import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, clients, programs, type AiGenerationRow } from "@pt/db";
import { AiProgramDraft, draftNoticeText, mockChatReply, mockReviseDraft, weekOf } from "@pt/shared";
import { toSignalProgram } from "./signals-service";
import { chatJson, extractJsonObject, ProviderError } from "../ai/provider";
import { providerRuntime, resolveEffort, ContextError } from "../ai/runtime";
import { buildRevisionMessages, buildWeekRevisionMessages } from "../ai/prompt";
import { loadContext } from "./context";
import { deregisterGeneration, registerGeneration } from "../ai/cancellation";

/** One smart turn (card 27tc8): reply always; a revised draft only when the
 *  trainer's message explicitly asks for program changes. */
export const SmartTurnOutput = z.object({
  reply: z.string().min(1).max(4000),
  draft: AiProgramDraft.nullish(),
});

/** Mock heuristic (deterministic for tests + demo mode): question-shaped
 *  messages never draft. Mirrored by the web mock adapter. */
export function mockTurnIsQuestion(message: string): boolean {
  return /^(why|what|how|who|when|where|which|does|do|is|are|can|could|should|\?)/i.test(message.trim());
}

export type SmartTurnResult =
  | { ok: false; status: 400 | 404 | 409 | 422; error: string }
  | { ok: true; generation: AiGenerationRow | null; reply: string; trainerId: string };

export async function runSmartTurn(
  parentId: string,
  message: string,
  opts: {
    conversation?: string | null;
    providerId?: string;
    model?: string;
    effort?: string;
  } = {}
): Promise<SmartTurnResult> {
  const [parent] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, parentId));
  if (!parent) return { ok: false, status: 404, error: "generation not found" };

  const trimmedMessage = message.trim();
  if (!trimmedMessage) return { ok: false, status: 422, error: "message must not be empty" };

  if (parent.status !== "validated") {
    return { ok: false, status: 409, error: `generation is ${parent.status}, not validated` };
  }

  const [pendingChild] = await db
    .select()
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.parentGenerationId, parent.id),
        eq(aiGenerations.status, "pending")
      )
    );
  if (pendingChild) {
    return { ok: false, status: 409, error: "a revision is already running for this generation" };
  }

  // Provider/model/effort: explicit selection wins, else the parent's — a
  // cross-provider pick only carries over what was explicitly given.
  const providerId = opts.providerId ?? parent.providerId;
  let rt: ReturnType<typeof providerRuntime>;
  try {
    rt = providerRuntime(providerId, opts.model ?? (providerId === parent.providerId ? parent.model : undefined));
  } catch (err) {
    if (err instanceof ContextError) return { ok: false, status: err.status as 400 | 404 | 409 | 422, error: err.message };
    throw err;
  }
  let effort: string | undefined | null;
  try {
    effort =
      opts.effort !== undefined
        ? resolveEffort(rt, opts.effort)
        : providerId === parent.providerId
          ? parent.effort
          : null;
  } catch (err) {
    if (err instanceof ContextError) return { ok: false, status: err.status as 400 | 404 | 409 | 422, error: err.message };
    throw err;
  }

  const [generation] = await db
    .insert(aiGenerations)
    .values({
      trainerId: parent.trainerId,
      clientId: parent.clientId,
      basedOnProgramId: parent.basedOnProgramId,
      kind: parent.kind,
      targetWeek: parent.targetWeek,
      direction: parent.direction,
      providerId,
      model: rt.model,
      effort,
      status: "pending",
      parentGenerationId: parent.id,
      revisionMessage: trimmedMessage,
      exampleProgramIds: parent.exampleProgramIds ?? [],
    })
    .returning();

  const ac = registerGeneration(generation.id);
  try {
    if (providerId === "mock") {
      if (mockTurnIsQuestion(trimmedMessage)) {
        // Question turn: no draft, so no child row — the version chain stays put.
        await db.delete(aiGenerations).where(eq(aiGenerations.id, generation.id));
        const [client] = await db.select().from(clients).where(eq(clients.id, parent.clientId));
        return { ok: true, generation: null, reply: mockChatReply(trimmedMessage, client?.name ?? null), trainerId: parent.trainerId };
      }
      const draft = mockReviseDraft(parent.draft!, trimmedMessage);
      const [updated] = await db
        .update(aiGenerations)
        .set({ status: "validated", draft, error: null })
        .where(eq(aiGenerations.id, generation.id))
        .returning();
      return { ok: true, generation: updated, reply: `Applied: ${trimmedMessage}`, trainerId: parent.trainerId };
    }

    let messages: { system: string; user: string };
    if (parent.kind === "week") {
      const [basedProg] = parent.basedOnProgramId
        ? await db.select().from(programs).where(eq(programs.id, parent.basedOnProgramId))
        : [null];
      const focusWeek = basedProg
        ? weekOf(toSignalProgram(basedProg), [])
        : (parent.targetWeek ? parent.targetWeek - 1 : 1);
      const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId, {
        focusWeek,
      });
      await db
        .update(aiGenerations)
        .set({ exampleProgramIds: ctx.examples.map((e) => e.programId) })
        .where(eq(aiGenerations.id, generation.id));
      const targetPlan = basedProg?.phasing?.weeks?.find((w) => w.week === parent.targetWeek);
      messages = buildWeekRevisionMessages({
        ...ctx,
        targetWeek: parent.targetWeek ?? 1,
        plannedWeeks: basedProg?.phasing?.plannedWeeks ?? basedProg?.sessions.length ?? 4,
        targetDirective: targetPlan?.directive ?? null,
        target: targetPlan?.target ?? null,
        direction: parent.direction ?? ctx.programDirection,
        trainerInstructions: "",
        previousDraft: parent.draft!,
        feedback: trimmedMessage,
        conversation: opts.conversation ?? null,
        outputContract: "smart-turn",
      });
    } else {
      const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId);
      await db
        .update(aiGenerations)
        .set({ exampleProgramIds: ctx.examples.map((e) => e.programId) })
        .where(eq(aiGenerations.id, generation.id));
      messages = buildRevisionMessages({
        ...ctx,
        trainerInstructions: "",
        direction: parent.direction,
        previousDraft: parent.draft!,
        feedback: trimmedMessage,
        conversation: opts.conversation ?? null,
        outputContract: "smart-turn",
      });
    }

    // Call + validate, with exactly one retry on validation failure.
    let parsed: z.infer<typeof SmartTurnOutput> | null = null;
    let validationError: string | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await chatJson(
          rt,
          [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ],
          { signal: ac.signal, effort: effort ?? undefined }
        );
        const out = SmartTurnOutput.safeParse(JSON.parse(extractJsonObject(raw)));
        if (out.success) {
          parsed = out.data;
        } else {
          validationError = z.prettifyError(out.error);
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          break;
        }
        if (err instanceof ProviderError) {
          const [failed] = await db
            .update(aiGenerations)
            .set({ status: "failed_provider", error: err.message })
            .where(and(eq(aiGenerations.id, generation.id), eq(aiGenerations.status, "pending")))
            .returning();
          return {
            ok: true,
            generation: failed ?? null,
            reply: `Revision failed: ${err.message}`.slice(0, 4000),
            trainerId: parent.trainerId,
          };
        }
        validationError = `parse failure: ${(err as Error).message}`;
      }
    }

    if (!parsed) {
      const [failed] = await db
        .update(aiGenerations)
        .set({ status: "failed_validation", error: validationError })
        .where(and(eq(aiGenerations.id, generation.id), eq(aiGenerations.status, "pending")))
        .returning();
      return {
        ok: true,
        generation: failed ?? null,
        reply: `Revision failed: ${validationError ?? "unknown error"}`.slice(0, 4000),
        trainerId: parent.trainerId,
      };
    }

    if (!parsed.draft) {
      // Reply-only turn: no draft means no version churn — drop the child row.
      await db.delete(aiGenerations).where(eq(aiGenerations.id, generation.id));
      return { ok: true, generation: null, reply: parsed.reply, trainerId: parent.trainerId };
    }

    const [updated] = await db
      .update(aiGenerations)
      .set({ status: "validated", draft: parsed.draft, error: null })
      .where(and(eq(aiGenerations.id, generation.id), eq(aiGenerations.status, "pending")))
      .returning();
    if (!updated) {
      const [row] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, generation.id));
      return { ok: true, generation: row, reply: parsed.reply, trainerId: parent.trainerId };
    }
    return { ok: true, generation: updated, reply: parsed.reply, trainerId: parent.trainerId };
  } finally {
    deregisterGeneration(generation.id);
  }
}

/** Transcript row content for a smart turn's assistant reply. */
export function smartTurnReplyText(reply: string, generation: AiGenerationRow | null): string {
  if (generation?.status === "validated" && generation.draft) {
    return `${reply}\n\n${draftNoticeText(generation.draft)}`;
  }
  return reply;
}
