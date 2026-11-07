import { and, desc, eq, inArray } from "drizzle-orm";
import { db, aiGenerations, chatMessages, programs, type AiGenerationRow } from "@pt/db";
import { AiProgramDraft, mockApplyProposal, mockReviseDraft, weekOf, type ChatProposal } from "@pt/shared";
import { toSignalProgram } from "./signals-service";
import { callLlm, contextSnapshot } from "../ai/llm";
import { settleGeneration } from "./settle-generation";
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
      exampleProgramIds: parent.exampleProgramIds ?? [],
    })
    .returning();

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
          opts.mockProposal
            ? mockApplyProposal(mockReviseDraft(parent.draft!, trimmedMessage), opts.mockProposal)
            : mockReviseDraft(parent.draft!, trimmedMessage)
        ),
    });
    const { row } = await settleGeneration(generation.id, out);
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
        inArray(chatMessages.kind, ["chat", "revision", "proposal"])
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(REVISION_CONVERSATION_LIMIT);

  return conversationToText(rows.reverse());
}
