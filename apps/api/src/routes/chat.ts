import { Elysia, t } from "elysia";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, aiGenerations, chatMessages, type ChatMessageRow } from "@pt/db";
import { diffDrafts, draftNoticeText, proposalToFeedback } from "@pt/shared";
import { answerChat } from "../lib/chat-qa";
import { loadRevisionConversation, runRevision } from "../lib/revision";
import { runProposalTurn } from "../lib/proposal-turn";
import { trainerContext } from "../lib/trainer-context";
import { linkTurn } from "../ai/llm";
import { recordFeedback, recordIgnoredProposals } from "../lib/llm-feedback";

/**
 * The trainer's request that produced a proposal.
 * Proposal rows written since the request id was stored carry it, so the lookup
 * is exact even when both rows land in the same millisecond. Older rows fall
 * back to the nearest earlier trainer message, compared inside Postgres: a JS
 * Date bound would truncate the µs-precision timestamptz to milliseconds and
 * drop the request that is 111µs before the proposal.
 */
async function proposalRequestText(row: ChatMessageRow): Promise<string> {
  const requestId = row.proposal?.requestMessageId;
  if (requestId) {
    const [request] = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.id, requestId), eq(chatMessages.role, "trainer")));
    if (request) return request.content;
  }

  const [previous] = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.clientId, row.clientId),
        eq(chatMessages.role, "trainer"),
        lt(chatMessages.createdAt, sql`(select ${chatMessages.createdAt} from ${chatMessages} where ${chatMessages.id} = ${row.id})`)
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return previous?.content ?? row.proposal?.summary ?? "";
}

async function parentDraftOf(id: string | null) {
  if (!id) return null;
  const [parent] = await db.select({ draft: aiGenerations.draft }).from(aiGenerations).where(eq(aiGenerations.id, id));
  return parent?.draft ?? null;
}

export const chatRoutes = new Elysia({ prefix: "/v1/ai/chat", tags: ["chat"] })
  .use(trainerContext)
  .get(
    "/",
    async ({ query }) => {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.clientId, query.clientId), isNull(chatMessages.hiddenAt)))
        .orderBy(asc(chatMessages.createdAt));
      return { messages };
    },
    {
      query: t.Object({ clientId: t.String() }),
    }
  )
  /**
   * Plain chat session: Q&A only, never drafts, never touches a generation.
   * The chat page sends everything through /turn; this endpoint stays as the
   * guaranteed-safe conversational surface (raw API use, future pages).
   */
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const res = await answerChat(trainerId, body);
      if (!res.ok) return status(res.status as 422 | 400 | 404 | 502, { error: res.error });
      return status(201, { messages: res.messages });
    },
    {
      body: t.Object({
        clientId: t.String(),
        message: t.String({ minLength: 1, maxLength: 2000 }),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        effort: t.Optional(t.String()),
      }),
    }
  )
  /**
   * One chat turn on a draft (propose → build): always replies; asks for a
   * proposal (a slot change list) only when the message asks for changes.
   * Never builds a draft — the trainer presses Build to get the next version.
   * Without a generationId it is a plain Q&A turn (answerChat).
   */
  .post(
    "/turn",
    async ({ body, status, trainerId }) => {
      const message = body.message.trim();
      if (!message) return status(422, { error: "message must not be empty" });

      // Moving on without building or adjusting an open proposal is a weak "no".
      await recordIgnoredProposals(trainerId, body.clientId);

      if (!body.generationId) {
        const qa = await answerChat(trainerId, {
          clientId: body.clientId,
          message,
          providerId: body.providerId,
          model: body.model,
          effort: body.effort,
        });
        if (!qa.ok) return status(qa.status as 422 | 400 | 404 | 502, { error: qa.error });
        return status(201, { messages: qa.messages, generation: null });
      }

      const conversation = await loadRevisionConversation(body.generationId);
      const res = await runProposalTurn(body.generationId, message, {
        conversation,
        providerId: body.providerId ?? undefined,
        model: body.model ?? undefined,
        effort: body.effort,
      });
      if (!res.ok) return status(res.status, { error: res.error });

      const [trainerRow] = await db
        .insert(chatMessages)
        .values({ trainerId: res.trainerId, clientId: body.clientId, role: "trainer", kind: "revision", content: message, generationId: null })
        .returning();
      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          trainerId: res.trainerId,
          clientId: body.clientId,
          role: "assistant",
          kind: res.proposal ? "proposal" : "chat",
          content: res.reply,
          generationId: null,
          proposal: res.proposal
            ? {
                ...res.proposal,
                parentGenerationId: res.parentGenerationId,
                builtGenerationId: null,
                requestMessageId: trainerRow.id,
              }
            : null,
        })
        .returning();
      await linkTurn(res.turnId, { chatMessageId: assistantRow.id });
      return status(201, { messages: [trainerRow, assistantRow], generation: null });
    },
    {
      body: t.Object({
        clientId: t.String(),
        generationId: t.Optional(t.Nullable(t.String())),
        message: t.String({ minLength: 1, maxLength: 2000 }),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        effort: t.Optional(t.String()),
      }),
    }
  )
  /** Build a proposal (propose → build): runs one revision bound to the proposal. */
  .post(
    "/proposals/:messageId/build",
    async ({ params, body, status }) => {
      const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, params.messageId));
      if (!row || row.kind !== "proposal" || !row.proposal) return status(404, { error: "proposal not found" });
      if (row.proposal.builtGenerationId) return status(409, { error: "proposal already built" });

      const requestText = await proposalRequestText(row);
      const feedback = proposalToFeedback(requestText, row.proposal);
      const conversation = await loadRevisionConversation(row.proposal.parentGenerationId);
      // History shows the trainer's request; the model gets the proposal-bound instruction.
      const res = await runRevision(row.proposal.parentGenerationId, requestText, {
        feedback,
        conversation,
        providerId: body.providerId,
        model: body.model,
        effort: body.effort,
        mockProposal: row.proposal,
        scope: row.proposal,
      });
      if (!res.ok) return status(res.status, { error: res.error });
      const gen = res.generation;
      const built = gen.status === "validated" && gen.draft;
      if (built) {
        await db
          .update(chatMessages)
          .set({ proposal: { ...row.proposal, builtGenerationId: gen.id } })
          .where(eq(chatMessages.id, row.id));
        await recordFeedback({
          trainerId: row.trainerId,
          clientId: row.clientId,
          subjectKind: "chat_message",
          subjectId: row.id,
          signal: "proposal_built",
          payload: { builtGenerationId: gen.id, changes: row.proposal.changes.length },
        });
      }
      let builtText = "";
      if (built) {
        // Count from the stored (scoped) draft, not from the proposal's length.
        const parentDraft = await parentDraftOf(gen.parentGenerationId);
        const n = parentDraft ? diffDrafts(parentDraft, gen.draft!).length : row.proposal.changes.length;
        const d = gen.discardedChanges?.length ?? 0;
        builtText = [
          `Built from the proposal: ${n} ${n === 1 ? "change" : "changes"}.`,
          d ? ` The AI also changed ${d} ${d === 1 ? "thing" : "things"} outside the proposal. Kept as before.` : "",
          `\n\n${draftNoticeText(gen.draft!)}`,
        ].join("");
      }
      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          trainerId: row.trainerId,
          clientId: row.clientId,
          role: "assistant",
          kind: built ? "draft" : "error",
          content: built
            ? builtText
            : gen.status === "cancelled"
              ? "Build cancelled. The draft is unchanged."
              : `Build failed: ${gen.error ?? gen.status}`,
          generationId: gen.id,
        })
        .returning();
      return status(201, { messages: [assistantRow], generation: gen });
    },
    {
      params: t.Object({ messageId: t.String() }),
      body: t.Object({
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        effort: t.Optional(t.String()),
      }),
    }
  )
  .delete(
    "/",
    async ({ query, status, trainerId }) => {
      // Soft delete: gone from the thread and from model context, kept for the LLM dataset.
      const hidden = await db
        .update(chatMessages)
        .set({ hiddenAt: new Date() })
        .where(and(eq(chatMessages.clientId, query.clientId), isNull(chatMessages.hiddenAt)))
        .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });
      if (hidden.length > 0) {
        const last = hidden.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
        await recordFeedback({
          trainerId,
          clientId: query.clientId,
          subjectKind: "chat_message",
          subjectId: last.id,
          signal: "chat_cleared",
          callId: null,
          payload: { hiddenCount: hidden.length },
        });
      }
      return status(204);
    },
    {
      query: t.Object({ clientId: t.String() }),
    }
  );
