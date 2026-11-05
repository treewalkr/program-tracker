import { Elysia, t } from "elysia";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db, aiGenerations, chatMessages, programs } from "@pt/db";
import { draftNoticeText, mockChatReply } from "@pt/shared";
import { chatText, ProviderError, type ChatMessage as ProviderChatMessage } from "../ai/provider";
import { ContextError, providerRuntime } from "../ai/runtime";
import { buildChatSystem, draftToText, type ChatDraftContext } from "../ai/prompt";
import { getDefaultTrainerId } from "../lib/trainer";
import { loadContext } from "../lib/context";
import { runRevision, loadRevisionConversation } from "../lib/revision";

const CHAT_HISTORY_LIMIT = 20;

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
  .post(
    "/",
    async ({ body, status }) => {
      const message = body.message.trim();
      if (!message) return status(422, { error: "message must not be empty" });

      const trainerId = await getDefaultTrainerId();

      let ctx;
      let rt: ReturnType<typeof providerRuntime> | null = null;
      try {
        const clientPrograms = await db
          .select()
          .from(programs)
          .where(eq(programs.clientId, body.clientId));
        const current = clientPrograms.find((p) => p.status === "active") ?? null;

        ctx = await loadContext(trainerId, body.clientId, current?.id ?? null);

        if (body.providerId !== "mock") {
          rt = providerRuntime(body.providerId ?? "zai", body.model);
        }
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }

      const [trainerRow] = await db
        .insert(chatMessages)
        .values({
          trainerId,
          clientId: body.clientId,
          role: "trainer",
          kind: "chat",
          content: message,
          generationId: null,
        })
        .returning();

      const [latestGen] = await db
        .select()
        .from(aiGenerations)
        .where(
          and(
            eq(aiGenerations.clientId, body.clientId),
            eq(aiGenerations.status, "validated"),
            isNotNull(aiGenerations.draft)
          )
        )
        .orderBy(desc(aiGenerations.createdAt))
        .limit(1);

      const latestDraft: ChatDraftContext | null =
        latestGen && latestGen.draft
          ? {
              kind: latestGen.kind as "block" | "week",
              targetWeek: latestGen.targetWeek,
              text: draftToText(latestGen.draft),
              revisionMessage: latestGen.revisionMessage,
            }
          : null;

      const historyRows = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.clientId, body.clientId),
            ne(chatMessages.kind, "error"),
            ne(chatMessages.id, trainerRow.id)
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(CHAT_HISTORY_LIMIT);

      historyRows.reverse();

      const history: ProviderChatMessage[] = historyRows.map((r) => ({
        role: r.role === "trainer" ? "user" : "assistant",
        content: r.content,
      }));

      const providerMessages: ProviderChatMessage[] = [
        { role: "system", content: buildChatSystem({ ...ctx, latestDraft }) },
        ...history,
        { role: "user", content: message },
      ];

      let reply: string;
      if (body.providerId === "mock") {
        reply = mockChatReply(message, ctx.client.name);
      } else {
        try {
          reply = (await chatText(rt!, providerMessages)).trim().slice(0, 4000);
        } catch (err) {
          if (err instanceof ProviderError) {
            await db.insert(chatMessages).values({
              trainerId,
              clientId: body.clientId,
              role: "assistant",
              kind: "error",
              content: err.message.slice(0, 4000),
              generationId: null,
            });
            return status(502, { error: err.message });
          }
          throw err;
        }
      }

      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          trainerId,
          clientId: body.clientId,
          role: "assistant",
          kind: "chat",
          content: reply,
          generationId: null,
        })
        .returning();

      return status(201, { messages: [trainerRow, assistantRow] });
    },
    {
      body: t.Object({
        clientId: t.String(),
        message: t.String({ minLength: 1, maxLength: 2000 }),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/revise",
    async ({ body, status }) => {
      const message = body.message.trim();
      if (!message) return status(422, { error: "message must not be empty" });

      try {
        // Thread the recent chat history into the revision prompt. Runs before
        // the trainer row is inserted, so the current message isn't duplicated.
        const conversation = await loadRevisionConversation(body.generationId);
        const res = await runRevision(body.generationId, message, { conversation });
        if (!res.ok) {
          return status(res.status, { error: res.error });
        }
        const gen = res.generation;

        const [trainerRow] = await db
          .insert(chatMessages)
          .values({
            trainerId: gen.trainerId,
            clientId: gen.clientId,
            role: "trainer",
            kind: "revision",
            content: message,
            generationId: gen.id,
          })
          .returning();

        const assistantContent =
          gen.status === "validated"
            ? draftNoticeText(gen.draft!)
            : `Revision failed: ${gen.error ?? "unknown error"}`.slice(0, 4000);

        const [assistantRow] = await db
          .insert(chatMessages)
          .values({
            trainerId: gen.trainerId,
            clientId: gen.clientId,
            role: "assistant",
            kind: gen.status === "validated" ? "draft" : "error",
            content: assistantContent,
            generationId: gen.id,
          })
          .returning();

        return status(201, { messages: [trainerRow, assistantRow], generation: gen });
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: t.Object({
        generationId: t.String(),
        message: t.String({ minLength: 1, maxLength: 2000 }),
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
