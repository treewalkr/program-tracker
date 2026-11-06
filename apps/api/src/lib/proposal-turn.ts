import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, clients, programs } from "@pt/db";
import { ChatProposal, mockChatReply, mockProposal, weekOf } from "@pt/shared";
import { toSignalProgram } from "./signals-service";
import { chatJson, extractJsonObject, ProviderError } from "../ai/provider";
import { providerRuntime, resolveEffort, ContextError } from "../ai/runtime";
import { buildRevisionMessages, buildWeekRevisionMessages } from "../ai/prompt";
import { loadContext } from "./context";

export const ProposalTurnOutput = z.object({
  reply: z.string().min(1).max(4000),
  proposal: ChatProposal.nullish(),
});

/** Mock heuristic (deterministic): question-shaped messages never propose. Mirrored by the web mock adapter. */
export function mockTurnIsQuestion(message: string): boolean {
  return /^(why|what|how|who|when|where|which|does|do|is|are|can|could|should|\?)/i.test(message.trim());
}

export type ProposalTurnResult =
  | { ok: false; status: 400 | 404 | 409 | 422 | 502; error: string }
  | { ok: true; reply: string; proposal: ChatProposal | null; trainerId: string; parentGenerationId: string };

/**
 * One chat turn on a draft: reply always, a proposal only for change requests.
 * Never writes a generation — the trainer decides whether to Build.
 */
export async function runProposalTurn(
  parentId: string,
  message: string,
  opts: { conversation?: string | null; providerId?: string; model?: string; effort?: string } = {}
): Promise<ProposalTurnResult> {
  const [parent] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, parentId));
  if (!parent) return { ok: false, status: 404, error: "generation not found" };

  const trimmedMessage = message.trim();
  if (!trimmedMessage) return { ok: false, status: 422, error: "message must not be empty" };

  if (parent.status !== "validated") {
    return { ok: false, status: 409, error: `generation is ${parent.status}, not validated` };
  }

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

  if (providerId === "mock") {
    if (mockTurnIsQuestion(trimmedMessage)) {
      const [client] = await db.select().from(clients).where(eq(clients.id, parent.clientId));
      return {
        ok: true,
        reply: mockChatReply(trimmedMessage, client?.name ?? null),
        proposal: null,
        trainerId: parent.trainerId,
        parentGenerationId: parent.id,
      };
    }
    return {
      ok: true,
      reply: `Proposed: ${trimmedMessage}`,
      proposal: mockProposal(parent.draft!, trimmedMessage),
      trainerId: parent.trainerId,
      parentGenerationId: parent.id,
    };
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
      outputContract: "proposal",
    });
  } else {
    const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId);
    messages = buildRevisionMessages({
      ...ctx,
      trainerInstructions: "",
      direction: parent.direction,
      previousDraft: parent.draft!,
      feedback: trimmedMessage,
      conversation: opts.conversation ?? null,
      outputContract: "proposal",
    });
  }

  // Call + validate, with exactly one retry on validation failure. No DB writes.
  let parsed: z.infer<typeof ProposalTurnOutput> | null = null;
  let validationError: string | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const raw = await chatJson(
        rt,
        [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        { effort: effort ?? undefined }
      );
      const out = ProposalTurnOutput.safeParse(JSON.parse(extractJsonObject(raw)));
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
        return { ok: false, status: 502, error: err.message };
      }
      validationError = `parse failure: ${(err as Error).message}`;
    }
  }

  if (!parsed) {
    return { ok: false, status: 502, error: `proposal turn failed: ${validationError ?? "unknown error"}` };
  }

  return {
    ok: true,
    reply: parsed.reply,
    proposal: parsed.proposal ?? null,
    trainerId: parent.trainerId,
    parentGenerationId: parent.id,
  };
}
