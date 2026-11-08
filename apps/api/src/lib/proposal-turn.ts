import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, clients, programs } from "@pt/db";
import { ChatProposal, mockChatReply, mockProposal } from "@pt/shared";
import { currentBlockWeek } from "./signals-service";
import { callLlm, contextSnapshot, type LlmOutcome } from "../ai/llm";
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
  | {
      ok: true;
      reply: string;
      proposal: ChatProposal | null;
      trainerId: string;
      parentGenerationId: string;
      /** Log turn id — the caller links the reply row to it. */
      turnId: string;
    };

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

  const links = { trainerId: parent.trainerId, clientId: parent.clientId, generationId: parent.id };
  const shared = {
    parentGenerationId: parent.id,
    basedOnProgramId: parent.basedOnProgramId,
    previousDraft: parent.draft,
    feedback: trimmedMessage,
    conversation: opts.conversation ?? null,
    outputContract: "proposal",
  };

  if (providerId === "mock") {
    const isQuestion = mockTurnIsQuestion(trimmedMessage);
    const [client] = isQuestion ? await db.select().from(clients).where(eq(clients.id, parent.clientId)) : [];
    const canned = isQuestion
      ? { reply: mockChatReply(trimmedMessage, client?.name ?? null), proposal: null }
      : { reply: `Proposed: ${trimmedMessage}`, proposal: mockProposal(parent.draft!, trimmedMessage) };
    return finish(
      await callLlm({
        purpose: "proposal_turn",
        builder: parent.kind === "week" ? "buildWeekRevisionMessages" : "buildRevisionMessages",
        links,
        context: shared,
        messages: [],
        rt,
        mode: "json",
        schema: ProposalTurnOutput,
        mock: () => JSON.stringify(canned),
      }),
      parent
    );
  }

  let messages: { system: string; user: string };
  let context: Record<string, unknown>;
  if (parent.kind === "week") {
    const [basedProg] = parent.basedOnProgramId
      ? await db.select().from(programs).where(eq(programs.id, parent.basedOnProgramId))
      : [null];
    const focusWeek = basedProg
      ? await currentBlockWeek(basedProg)
      : (parent.targetWeek ? parent.targetWeek - 1 : 1);
    const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId, {
      focusWeek,
    });
    const targetPlan = basedProg?.phasing?.weeks?.find((w) => w.week === parent.targetWeek);
    const week = {
      targetWeek: parent.targetWeek ?? 1,
      plannedWeeks: basedProg?.phasing?.plannedWeeks ?? basedProg?.sessions.length ?? 4,
      targetDirective: targetPlan?.directive ?? null,
      target: targetPlan?.target ?? null,
      direction: parent.direction ?? ctx.programDirection,
      trainerInstructions: "",
    };
    context = contextSnapshot(ctx, { ...week, ...shared, basedOnProgramVersion: basedProg?.version ?? null });
    messages = buildWeekRevisionMessages({
      ...ctx,
      ...week,
      previousDraft: parent.draft!,
      feedback: trimmedMessage,
      conversation: opts.conversation ?? null,
      outputContract: "proposal",
    });
  } else {
    const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId);
    context = contextSnapshot(ctx, { ...shared, direction: parent.direction, trainerInstructions: "" });
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

  // Call + validate, with exactly one retry on validation failure. Never writes a generation.
  const out = await callLlm({
    purpose: "proposal_turn",
    builder: parent.kind === "week" ? "buildWeekRevisionMessages" : "buildRevisionMessages",
    links,
    context,
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    rt,
    effort,
    mode: "json",
    schema: ProposalTurnOutput,
  });
  return finish(out, parent);
}

function finish(
  out: LlmOutcome<z.infer<typeof ProposalTurnOutput>>,
  parent: { id: string; trainerId: string }
): ProposalTurnResult {
  if (!out.ok) {
    if (out.kind === "provider") return { ok: false, status: 502, error: out.error.message };
    const reason = out.kind === "validation" ? out.error : "aborted";
    return { ok: false, status: 502, error: `proposal turn failed: ${reason}` };
  }
  return {
    ok: true,
    reply: out.data.reply,
    proposal: out.data.proposal ?? null,
    trainerId: parent.trainerId,
    parentGenerationId: parent.id,
    turnId: out.turnId,
  };
}
