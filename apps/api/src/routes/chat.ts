import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { db, chatMessages } from "@pt/db";
import { answerChat } from "../lib/chat-qa";
import { loadRevisionConversation } from "../lib/revision";
import { runSmartTurn, smartTurnReplyText } from "../lib/smart-turn";

export const chatRoutes = new Elysia({ prefix: "/v1/ai/chat", tags: ["chat"] })
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
    async ({ body, status }) => {
      const res = await answerChat(body);
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
   * One smart turn (card 27tc8): always replies; revises the draft (new
   * version) only when the message explicitly asks for program changes.
   * Without a generationId it is a plain Q&A turn (answerChat).
   */
  .post(
    "/turn",
    async ({ body, status }) => {
      const message = body.message.trim();
      if (!message) return status(422, { error: "message must not be empty" });

      if (!body.generationId) {
        const qa = await answerChat({
          clientId: body.clientId,
          message,
          providerId: body.providerId,
          model: body.model,
          effort: body.effort,
        });
        if (!qa.ok) return status(qa.status as 422 | 400 | 404 | 502, { error: qa.error });
        return status(201, { messages: qa.messages, generation: null });
      }

      // Thread the recent chat history into the prompt. Runs before the
      // trainer row is inserted, so the current message isn't duplicated.
      const conversation = await loadRevisionConversation(body.generationId);
      const res = await runSmartTurn(body.generationId, message, {
        conversation,
        providerId: body.providerId ?? undefined,
        model: body.model ?? undefined,
        effort: body.effort,
      });
      if (!res.ok) return status(res.status, { error: res.error });
      const gen = res.generation;

      const [trainerRow] = await db
        .insert(chatMessages)
        .values({
          trainerId: res.trainerId,
          clientId: body.clientId,
          role: "trainer",
          kind: "revision",
          content: message,
          generationId: gen?.id ?? null,
        })
        .returning();

      const draftApplied = gen?.status === "validated";
      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          trainerId: trainerRow.trainerId,
          clientId: body.clientId,
          role: "assistant",
          kind: draftApplied ? "draft" : "chat",
          content: smartTurnReplyText(res.reply, gen),
          generationId: gen?.id ?? null,
        })
        .returning();

      return status(201, { messages: [trainerRow, assistantRow], generation: gen });
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
