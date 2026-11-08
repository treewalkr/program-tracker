import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db, aiGenerations, chatMessages, programs, type ChatMessageRow } from "@pt/db";
import { DEFAULT_PROVIDER_ID } from "@pt/shared";
import { type ChatMessage as ProviderChatMessage } from "../ai/provider";
import { callLlm, contextSnapshot, linkTurn } from "../ai/llm";
import { providerRuntime, resolveEffort, ContextError } from "../ai/runtime";
import { buildChatSystem, draftToText, type ChatDraftContext } from "../ai/prompt";
import { loadContext } from "../lib/context";
import { mockGroundedChatReply } from "../ai/mock";

const CHAT_HISTORY_LIMIT = 20;

/**
 * Plain Q&A chat turn (no drafting, ever) — the chat session surface behind
 * POST /v1/ai/chat, also used by POST /v1/ai/chat/turn when no draft is in
 * flight. Writes the trainer row, calls the provider, writes the assistant
 * row. Provider failures write an error row and report 502.
 */
export async function answerChat(
  trainerId: string,
  body: { clientId: string; message: string; providerId?: string; model?: string; effort?: string }
): Promise<
  | { ok: true; messages: [ChatMessageRow, ChatMessageRow] }
  | { ok: false; status: number; error: string }
> {
  const message = body.message.trim();
  if (!message) return { ok: false, status: 422, error: "message must not be empty" };

  let ctx;
  let rt: ReturnType<typeof providerRuntime> | null = null;
  let effort: string | undefined;
  try {
    const clientPrograms = await db
      .select()
      .from(programs)
      .where(eq(programs.clientId, body.clientId));
    const current = clientPrograms.find((p) => p.status === "active") ?? null;

    ctx = await loadContext(trainerId, body.clientId, current?.id ?? null);

    if (body.providerId === "mock") {
      rt = providerRuntime("mock");
    } else {
      rt = providerRuntime(body.providerId ?? DEFAULT_PROVIDER_ID, body.model);
      effort = resolveEffort(rt, body.effort);
    }
  } catch (err) {
    if (err instanceof ContextError) return { ok: false, status: err.status, error: err.message };
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
        ne(chatMessages.id, trainerRow.id),
        isNull(chatMessages.hiddenAt)
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

  const out = await callLlm({
    purpose: "chat_qa",
    builder: "buildChatSystem",
    links: { trainerId, clientId: body.clientId, generationId: latestGen?.id ?? null },
    context: contextSnapshot(ctx, {
      latestGenerationId: latestGen?.id ?? null,
      latestDraft,
      historyMessageIds: historyRows.map((r) => r.id),
      message,
    }),
    messages: providerMessages,
    rt: rt!,
    effort,
    mode: "text",
    mock: () => mockGroundedChatReply(message, ctx.client.name, ctx.trainingLog),
  });
  if (!out.ok) {
    const error = out.kind === "provider" ? out.error.message : out.kind === "validation" ? out.error : "aborted";
    await db.insert(chatMessages).values({
      trainerId,
      clientId: body.clientId,
      role: "assistant",
      kind: "error",
      content: error.slice(0, 4000),
      generationId: null,
    });
    return { ok: false, status: 502, error };
  }
  const reply = out.data.trim().slice(0, 4000);

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
  await linkTurn(out.turnId, { chatMessageId: assistantRow.id });

  return { ok: true, messages: [trainerRow, assistantRow] };
}
