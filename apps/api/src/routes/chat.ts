import { Elysia, t } from "elysia";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db, chatMessages, type ChatMessageRow } from "@pt/db";
import { draftNoticeText, proposalToFeedback } from "@pt/shared";
import { answerChat } from "../lib/chat-qa";
import { loadRevisionConversation, runRevision } from "../lib/revision";
import { runProposalTurn } from "../lib/proposal-turn";
import { trainerContext } from "../lib/trainer-context";

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

export const chatRoutes = new Elysia({ prefix: "/v1/ai/chat", tags: ["chat"] })
  .use(trainerContext)
  .get(
    "/",
    async ({ query }) => {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.clientId, query.clientId))
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
      });
      if (!res.ok) return status(res.status, { error: res.error });
      const gen = res.generation;
      const built = gen.status === "validated" && gen.draft;
      if (built) {
        await db
          .update(chatMessages)
          .set({ proposal: { ...row.proposal, builtGenerationId: gen.id } })
          .where(eq(chatMessages.id, row.id));
      }
      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          trainerId: row.trainerId,
          clientId: row.clientId,
          role: "assistant",
          kind: built ? "draft" : "error",
          content: built
            ? `Built from the proposal.\n\n${draftNoticeText(gen.draft!)}`
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
    async ({ query, status }) => {
      await db.delete(chatMessages).where(eq(chatMessages.clientId, query.clientId));
      return status(204);
    },
    {
      query: t.Object({ clientId: t.String() }),
    }
  );
