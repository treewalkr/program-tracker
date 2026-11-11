import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, aiGenerations, chatMessages, programs, type AiGenerationRow } from "@pt/db";
import { AiProgramDraft, lockPhasing, mockApplyProposal, mockReviseDraft, scopeToProposal, type ChatProposal, type SlotChange } from "@pt/shared";
import { currentBlockWeek } from "./signals-service";
import { callLlm, contextSnapshot } from "../ai/llm";
import { settleGeneration } from "./settle-generation";
import { recordFeedback } from "./llm-feedback";
import { providerRuntime, resolveEffort, ContextError } from "../ai/runtime";
import {
  REVISION_CONVERSATION_LIMIT,
  buildRevisionMessages,
  buildWeekRevisionMessages,
  conversationToText,
} from "../ai/prompt";
import { loadContext } from "./context";
import { deregisterGeneration, registerGeneration } from "../ai/cancellation";

export type RevisionResult =
  | { ok: false; status: 400 | 404 | 409 | 422; error: string }
  | { ok: true; generation: AiGenerationRow };

export async function runRevision(
  parentId: string,
  message: string,
  opts: {
    conversation?: string | null;
    providerId?: string;
    model?: string;
    effort?: string;
    mockProposal?: ChatProposal;
    /** Prompt text when it differs from `message` (proposal builds). `message` is what history shows. */
    feedback?: string;
    /**
     * Proposal builds: keep only the changes this proposal asked for
     * (scopeToProposal) and store the rest as `discardedChanges`.
     */
    scope?: ChatProposal;
    /**
     * Free-text revisions: keep the parent's block plan unless `message` is
     * about it (lockPhasing / mentionsPlan); reverted plan edits are stored
     * as `discardedChanges`.
     */
    lockPhasing?: boolean;
  } = {}
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

  const providerId = opts.providerId ?? parent.providerId;
  let rtSel: ReturnType<typeof providerRuntime>;
  try {
    rtSel = providerRuntime(providerId, opts.model ?? (providerId === parent.providerId ? parent.model : undefined));
  } catch (err) {
    if (err instanceof ContextError) return { ok: false, status: err.status as 400 | 404 | 409 | 422, error: err.message };
    throw err;
  }
  let effort: string | undefined | null;
  try {
    effort =
      opts.effort !== undefined
        ? resolveEffort(rtSel, opts.effort)
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
      model: rtSel.model,
      effort,
      status: "pending",
      parentGenerationId: parent.id,
      revisionMessage: trimmedMessage,
      // A trainer-ordered draft stays trainer-ordered through AI revisions.
      trainerOrder: parent.trainerOrder,
      exampleProgramIds: parent.exampleProgramIds ?? [],
    })
    .returning();

  // A revision request is a critique of the parent draft.
  await recordFeedback({
    trainerId: parent.trainerId,
    clientId: parent.clientId,
    subjectKind: "generation",
    subjectId: parent.id,
    signal: "draft_revised",
    comment: trimmedMessage,
    payload: { childGenerationId: generation.id, fromProposal: Boolean(opts.mockProposal || opts.feedback) },
  });

  const ac = registerGeneration(generation.id);
  try {
    let messages: { system: string; user: string } | null = null;
    let context: Record<string, unknown> = {};
    const shared = {
      parentGenerationId: parent.id,
      basedOnProgramId: parent.basedOnProgramId,
      previousDraft: parent.draft,
      feedback: opts.feedback ?? trimmedMessage,
      conversation: opts.conversation ?? null,
    };
    if (providerId !== "mock") {
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
        await db
          .update(aiGenerations)
          .set({ exampleProgramIds: ctx.examples.map((e) => e.programId) })
          .where(eq(aiGenerations.id, generation.id));
        const targetPlan = basedProg?.phasing?.weeks?.find((w) => w.week === parent.targetWeek);
        const targetDirective = targetPlan?.directive ?? null;
        const target = targetPlan?.target ?? null;
        const plannedWeeks = basedProg?.phasing?.plannedWeeks ?? basedProg?.sessions.length ?? 4;
        const week = {
          targetWeek: parent.targetWeek ?? 1,
          plannedWeeks,
          targetDirective,
          target,
          direction: parent.direction ?? ctx.programDirection,
          trainerInstructions: "",
        };
        messages = buildWeekRevisionMessages({
          ...ctx,
          ...week,
          previousDraft: parent.draft!,
          feedback: shared.feedback,
          conversation: shared.conversation,
        });
        context = contextSnapshot(ctx, { ...week, ...shared, basedOnProgramVersion: basedProg?.version ?? null });
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
          feedback: shared.feedback,
          conversation: shared.conversation,
        });
        context = contextSnapshot(ctx, { ...shared, direction: parent.direction, trainerInstructions: "" });
      }
    } else {
      context = shared;
    }

    // Call + validate, with exactly one retry on validation failure.
    const out = await callLlm({
      purpose: parent.kind === "week" ? "week_revision" : "revision",
      builder: parent.kind === "week" ? "buildWeekRevisionMessages" : "buildRevisionMessages",
      links: { trainerId: parent.trainerId, clientId: parent.clientId, generationId: generation.id },
      context,
      messages: messages
        ? [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ]
        : [],
      rt: rtSel,
      effort,
      signal: ac.signal,
      mode: "json",
      schema: AiProgramDraft,
      mock: () =>
        JSON.stringify(
          mockApplyProposal(
            mockReviseDraft(parent.draft!, trimmedMessage),
            opts.mockProposal ?? { summary: "", changes: [] },
            // Opt-in for tests: the mock also edits phasing and cardio unasked (see mockApplyProposal).
            { rogue: process.env.MOCK_ROGUE === "1" }
          )
        ),
    });
    let settled = out;
    let discardedChanges: SlotChange[] | undefined;
    if (out.ok && opts.scope) {
      const scoped = scopeToProposal(parent.draft!, out.data, opts.scope);
      const valid = AiProgramDraft.safeParse(scoped.draft);
      settled = valid.success
        ? { ...out, data: valid.data }
        : { turnId: out.turnId, callId: out.callId, attempts: out.attempts, ok: false, kind: "validation", error: `scoped draft invalid: ${valid.error.message}` };
      discardedChanges = scoped.discarded;
    } else if (out.ok && opts.lockPhasing) {
      const locked = lockPhasing(parent.draft!, out.data, trimmedMessage);
      settled = { ...out, data: locked.draft };
      discardedChanges = locked.discarded;
    }
    const { row } = await settleGeneration(generation.id, settled, { discardedChanges });
    return { ok: true, generation: row };
  } finally {
    deregisterGeneration(generation.id);
  }
}

/**
 * Recent chat thread for the client that owns `generationId`, rendered for the
 * revision prompt. Reads the last REVISION_CONVERSATION_LIMIT rows of kind
 * chat|revision|proposal (draft/error rows excluded — boilerplate and failure text),
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
        // "edit": the trainer's hand edits, so the model keeps them.
        inArray(chatMessages.kind, ["chat", "revision", "proposal", "edit"]),
        isNull(chatMessages.hiddenAt)
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(REVISION_CONVERSATION_LIMIT);

  return conversationToText(rows.reverse());
}
