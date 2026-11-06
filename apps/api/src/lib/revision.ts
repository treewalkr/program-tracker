import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, chatMessages, programs, type AiGenerationRow } from "@pt/db";
import { AiProgramDraft, mockReviseDraft, weekOf } from "@pt/shared";
import { toSignalProgram } from "./signals-service";
import { chatJson, extractJsonObject, ProviderError } from "../ai/provider";
import { providerRuntime } from "../ai/runtime";
import {
  REVISION_CONVERSATION_LIMIT,
  buildRevisionMessages,
  buildWeekRevisionMessages,
  conversationToText,
} from "../ai/prompt";
import { loadContext } from "./context";
import { deregisterGeneration, registerGeneration } from "../ai/cancellation";

export type RevisionResult =
  | { ok: false; status: 404 | 409 | 422; error: string }
  | { ok: true; generation: AiGenerationRow };

export async function runRevision(
  parentId: string,
  message: string,
  opts: { conversation?: string | null } = {}
): Promise<RevisionResult> {
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

  const [generation] = await db
    .insert(aiGenerations)
    .values({
      trainerId: parent.trainerId,
      clientId: parent.clientId,
      basedOnProgramId: parent.basedOnProgramId,
      kind: parent.kind,
      targetWeek: parent.targetWeek,
      direction: parent.direction,
      providerId: parent.providerId,
      model: parent.model,
      effort: parent.effort,
      status: "pending",
      parentGenerationId: parent.id,
      revisionMessage: trimmedMessage,
      exampleProgramIds: parent.exampleProgramIds ?? [],
    })
    .returning();

  const ac = registerGeneration(generation.id);
  try {
    let messages: { system: string; user: string } | null = null;
    let rt: ReturnType<typeof providerRuntime> | null = null;
    if (parent.providerId !== "mock") {
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
        const targetDirective = targetPlan?.directive ?? null;
        const target = targetPlan?.target ?? null;
        const plannedWeeks = basedProg?.phasing?.plannedWeeks ?? basedProg?.sessions.length ?? 4;
        messages = buildWeekRevisionMessages({
          ...ctx,
          targetWeek: parent.targetWeek ?? 1,
          plannedWeeks,
          targetDirective,
          target,
          direction: parent.direction ?? ctx.programDirection,
          trainerInstructions: "",
          previousDraft: parent.draft!,
          feedback: trimmedMessage,
          conversation: opts.conversation ?? null,
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
        });
      }
      rt = providerRuntime(parent.providerId, parent.model);
    }

    // Call + validate, with exactly one retry on validation failure.
    let draft: z.infer<typeof AiProgramDraft> | null = null;
    let validationError: string | null = null;
    for (let attempt = 0; attempt < 2 && !draft; attempt++) {
      try {
        const raw =
          parent.providerId === "mock"
            ? JSON.stringify(mockReviseDraft(parent.draft!, trimmedMessage))
            : await chatJson(
                rt!,
                [
                  { role: "system", content: messages!.system },
                  { role: "user", content: messages!.user },
                ],
                { signal: ac.signal }
              );
        const parsed = AiProgramDraft.safeParse(JSON.parse(extractJsonObject(raw)));
        if (parsed.success) {
          draft = parsed.data;
        } else {
          validationError = z.prettifyError(parsed.error);
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
          if (!failed) {
            const [row] = await db
              .select()
              .from(aiGenerations)
              .where(eq(aiGenerations.id, generation.id));
            return { ok: true, generation: row };
          }
          return { ok: true, generation: failed };
        }
        validationError = `parse failure: ${(err as Error).message}`;
      }
    }

    if (draft) {
      const [updated] = await db
        .update(aiGenerations)
        .set({ status: "validated", draft, error: null })
        .where(and(eq(aiGenerations.id, generation.id), eq(aiGenerations.status, "pending")))
        .returning();
      if (!updated) {
        const [row] = await db
          .select()
          .from(aiGenerations)
          .where(eq(aiGenerations.id, generation.id));
        return { ok: true, generation: row };
      }
      return { ok: true, generation: updated };
    }

    const [failed] = await db
      .update(aiGenerations)
      .set({ status: "failed_validation", error: validationError })
      .where(and(eq(aiGenerations.id, generation.id), eq(aiGenerations.status, "pending")))
      .returning();
    if (!failed) {
      const [row] = await db
        .select()
        .from(aiGenerations)
        .where(eq(aiGenerations.id, generation.id));
      return { ok: true, generation: row };
    }
    return { ok: true, generation: failed };
  } finally {
    deregisterGeneration(generation.id);
  }
}

/**
 * Recent chat thread for the client that owns `generationId`, rendered for the
 * revision prompt. Reads the last REVISION_CONVERSATION_LIMIT rows of kind
 * chat|revision (draft/error rows excluded — boilerplate and failure text),
 * oldest → newest. Returns null when the generation or history is missing.
 */
export async function loadRevisionConversation(generationId: string): Promise<string | null> {
  const [generation] = await db
    .select()
    .from(aiGenerations)
    .where(eq(aiGenerations.id, generationId));
  if (!generation) return null;

  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.clientId, generation.clientId),
        inArray(chatMessages.kind, ["chat", "revision"])
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(REVISION_CONVERSATION_LIMIT);

  return conversationToText(rows.reverse());
}
