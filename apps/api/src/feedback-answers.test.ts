import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, feedbackComments, feedbackItems, llmBlobs, llmCalls, llmFeedback, trainers } from "@pt/db";
import { unpinnedContext, type FeedbackAiMode, type FeedbackComment, type FeedbackItem } from "@pt/shared";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { answerRecords, lessonRecords } from "./lib/feedback-answers";
import { capTranscript, transcriptStats, transcriptsToPrune } from "./lib/agent-transcript";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackItems.id }).from(feedbackItems).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping AI answer rating DB tests");
}

const TOKEN = "agent-test-token-answers-0123456789";
const context = unpinnedContext("/settings", {
  viewport: { width: 1280, height: 800, dpr: 1 },
  userAgent: "test",
  appVersion: "0.1.20+abc1234",
});

type As = "admin" | string | { bearer: string };
const call = async (method: string, path: string, body?: unknown, as: As = "admin") => {
  const prev = process.env.AUTH_DISABLED;
  if (as !== "admin") process.env.AUTH_DISABLED = "false";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof as === "string" && as !== "admin") headers.cookie = `${SESSION_COOKIE}=${as}`;
  if (typeof as === "object") headers.authorization = `Bearer ${as.bearer}`;
  try {
    return await app.handle(
      new Request(`http://local${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    );
  } finally {
    process.env.AUTH_DISABLED = prev;
  }
};
const json = async (res: Response) => (await res.json()) as any;
const agent = { bearer: TOKEN };

/** A stream-json transcript as `claude -p --output-format stream-json --verbose` writes it. */
const TRANSCRIPT = [
  JSON.stringify({ type: "system", subtype: "init", session_id: "s-1", model: "claude-opus-5-5", tools: ["Read"] }),
  JSON.stringify({ type: "assistant", session_id: "s-1", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 500, output_tokens: 40 } } }),
  // the same message again (one event per content block): counted once
  JSON.stringify({ type: "assistant", session_id: "s-1", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 500, output_tokens: 40 } } }),
  JSON.stringify({ type: "user", session_id: "s-1", message: { content: [{ type: "tool_result", content: "ok" }] } }),
  JSON.stringify({ type: "assistant", session_id: "s-1", message: { id: "m2", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 60 } } }),
].join("\n");

describe("agent transcripts (pure)", () => {
  test("sums usage once per message; a result event's totals win", () => {
    expect(transcriptStats(TRANSCRIPT)).toEqual({
      model: "claude-opus-5-5",
      sessionId: "s-1",
      tokensIn: 130,
      tokensOut: 100,
      tokensCached: 500,
      costUsd: null,
      durationMs: null,
      numTurns: null,
    });
    const done = `${TRANSCRIPT}\nnot json\n${JSON.stringify({ type: "result", total_cost_usd: 0.42, duration_ms: 61000, num_turns: 7, usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 4000 } })}`;
    expect(transcriptStats(done)).toMatchObject({ tokensIn: 900, tokensOut: 300, tokensCached: 4000, costUsd: 0.42, durationMs: 61000, numTurns: 7 });
    expect(transcriptStats("")).toMatchObject({ model: null, tokensIn: null });
  });
  test("caps a long transcript to its init line and newest whole lines", () => {
    const lines = ['{"type":"system","subtype":"init"}', ...Array.from({ length: 200 }, (_, i) => `{"n":${i}}`)];
    const { text, truncated } = capTranscript(lines.join("\n"), 400);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text.startsWith('{"type":"system","subtype":"init"}\n{"type":"pt_truncated"')).toBe(true);
    expect(text.endsWith('{"n":199}')).toBe(true);
    for (const l of text.split("\n")) expect(() => JSON.parse(l)).not.toThrow();
    expect(capTranscript("short", 400)).toEqual({ text: "short", truncated: false });
  });
  test("keeps the newest transcripts", () => {
    const names = ["run-2026-11-03.jsonl", "watch-state.json", "run-2026-11-01.jsonl", "run-2026-11-02.jsonl"];
    expect(transcriptsToPrune(names, 2)).toEqual(["run-2026-11-01.jsonl"]);
    expect(transcriptsToPrune(names, 5)).toEqual([]);
  });
});

describe("answerRecords and lessonRecords (pure)", () => {
  const kai = { id: "k", name: "Kai", avatarUrl: null };
  const ana = { id: "a", name: "Ana", avatarUrl: null };
  const at = (min: number) => `2026-11-10T10:${String(min).padStart(2, "0")}:00.000Z`;
  const meta = { verdict: "exists" as const, confidence: "medium" as const, citations: ["a.ts:1"], basis: "b1", model: "m", runAt: at(1) };
  const c = (over: Partial<FeedbackComment>): FeedbackComment => ({
    id: crypto.randomUUID(), kind: "reply", author: null, authorKind: "human", visibility: "public", aiMeta: null, aiPublic: null,
    ship: null, body: "x", status: null, attachments: [], createdAt: at(0), ...over,
  });
  const item = (thread: FeedbackComment[], number = 7): FeedbackItem => ({
    id: `i${number}`, number, author: kai, status: "new", comment: "Where are emails?", triageNote: null, route: "/settings", source: null,
    context, attachments: [], shippedIn: null, thread, editedAt: null, editedBy: null, duplicateOf: null, duplicates: [], fixPr: null,
    unread: false, muted: false, reachable: true, createdAt: at(0), updatedAt: at(0),
  });
  const down = { score: -1 as const, tags: ["wrong" as const], comment: "Not there", at: at(3) };
  const sent = c({ id: "ans", authorKind: "ai", aiMeta: meta, body: "Settings → Email", createdAt: at(2), aiPublic: { confidence: "medium", rating: down, canRate: false } });
  const thread = [
    c({ author: kai, body: "On my phone", createdAt: at(1) }),
    c({ authorKind: "ai", visibility: "private", aiMeta: meta, body: "Exists, verified", createdAt: at(2) }),
    sent,
    c({ author: ana, body: "It's under Account → Email now", createdAt: at(4) }),
    c({ authorKind: "ai", visibility: "draft", aiMeta: { ...meta, basis: "b2" }, body: "Draft", createdAt: at(5), id: "draft" }),
  ];

  test("one record per AI reply, with the thread before it, its note, rating and what came next", () => {
    const out = answerRecords([item(thread)]);
    expect(out.map((r) => r.answer.commentId)).toEqual(["ans", "draft"]);
    expect(out[0]).toMatchObject({
      handle: "FB-007",
      ticket: { comment: "Where are emails?", route: "/settings", build: "0.1.20+abc1234" },
      thread: [{ who: "reporter", body: "On my phone" }],
      answer: { body: "Settings → Email", visibility: "public", verdict: "exists", confidence: "medium", citations: ["a.ts:1"] },
      note: "Exists, verified",
      rating: down,
      followUp: { who: "owner", body: "It's under Account → Email now" },
      ownerEdit: null,
      run: null,
    });
    expect(out[1]).toMatchObject({ answer: { visibility: "draft" }, followUp: null, rating: null });
  });
  test("lessons: 👎 answers and owner rewrites, newest first, capped", () => {
    const edits = new Map([["draft", { original: "Draft", sent: "Better" }]]);
    const records = answerRecords([item(thread)], { edits });
    expect(lessonRecords(records).map((r) => r.answer.commentId)).toEqual(["draft", "ans"]);
    expect(lessonRecords(records, 1)).toHaveLength(1);
    expect(lessonRecords(answerRecords([item(thread)]))).toHaveLength(1);
  });
});

describe.skipIf(!dbUp)("AI answer ratings and logging (API)", () => {
  const KAI = "fb-answers-kai@example.com";
  const LEE = "fb-answers-lee@example.com";
  const saved: Record<string, string | undefined> = {};
  let kai = "";
  let lee = "";
  const items: string[] = [];

  beforeAll(async () => {
    for (const k of ["FEEDBACK_AGENT_TOKEN", "ADMIN_EMAIL", "RESEND_API_KEY"]) saved[k] = process.env[k];
    process.env.FEEDBACK_AGENT_TOKEN = TOKEN;
    delete process.env.RESEND_API_KEY;
    const [admin] = await db.select().from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    process.env.ADMIN_EMAIL = admin.email;
    await db.delete(trainers).where(inArray(trainers.email, [KAI, LEE]));
    const [k] = await db.insert(trainers).values({ name: "Kai", email: KAI }).returning({ id: trainers.id });
    const [l] = await db.insert(trainers).values({ name: "Lee", email: LEE }).returning({ id: trainers.id });
    kai = (await createSession(k.id)).token;
    lee = (await createSession(l.id)).token;
  });
  afterAll(async () => {
    await setMode("drafts");
    await settleFeedbackNotifications();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (items.length) {
      const comments = await db.select({ id: feedbackComments.id }).from(feedbackComments).where(inArray(feedbackComments.itemId, items));
      if (comments.length) await db.delete(llmFeedback).where(inArray(llmFeedback.subjectId, comments.map((c) => c.id)));
      await db.delete(feedbackItems).where(inArray(feedbackItems.id, items));
    }
    await db.delete(trainers).where(inArray(trainers.email, [KAI, LEE]));
  });

  const setMode = async (mode: FeedbackAiMode) =>
    expect((await call("PUT", "/v1/account/feedback-ai", { mode })).status).toBe(200);
  const ticket = async (comment: string) => {
    const id = (await json(await call("POST", "/v1/feedback", { comment, context }, kai))).id as string;
    items.push(id);
    return id;
  };
  const inbox = async () => (await json(await call("GET", "/v1/agent/feedback/inbox", undefined, agent))) as any[];
  const inInbox = async (id: string) => (await inbox()).find((i) => i.id === id);
  const pending = async () => json(await call("GET", "/v1/agent/feedback/pending", undefined, agent));
  const answer = (id: string, body: Record<string, unknown>) =>
    call("POST", `/v1/agent/feedback/${id}/answer`, {
      note: "Exists: Settings → Email.",
      verdict: "exists",
      confidence: "high",
      citations: ["apps/web/src/routes/settings/+page.svelte:220"],
      reply: "Open **Settings → Email**.",
      ...body,
    }, agent);
  const asKai = async (id: string) => (await json(await call("GET", `/v1/feedback/${id}`, undefined, kai))) as FeedbackItem;
  const asAdmin = async (id: string) => (await json(await call("GET", `/v1/feedback/${id}`))) as FeedbackItem;
  const rate = (id: string, cid: string, body: unknown, as: As = kai) => call("PUT", `/v1/feedback/${id}/comments/${cid}/rating`, body, as);
  /** A ticket with one sent AI answer (auto mode, medium confidence); returns ids. */
  const answered = async (comment: string, run?: Record<string, unknown>) => {
    await setMode("auto");
    const id = await ticket(comment);
    const res = await answer(id, { basis: (await inInbox(id)).basis, confidence: "medium", ...(run ? { run } : {}) });
    const out = await json(res);
    expect(out.outcome).toBe("sent");
    return { id, replyId: out.replyId as string, noteId: out.noteId as string, callId: out.callId as string | null };
  };

  test("the reporter sees how sure a sent answer was, and nothing else of the AI's meta", async () => {
    const { id, replyId } = await answered("Where do I stop emails?");
    const reply = (await asKai(id)).thread.find((c) => c.id === replyId)!;
    expect(reply.aiPublic).toEqual({ confidence: "medium", rating: null, canRate: true });
    expect(reply.aiMeta).toBeNull();
    expect((await asKai(id)).thread.every((c) => c.visibility === "public")).toBe(true);
    // the admin sees it too, but may not rate someone else's answer
    const adminView = (await asAdmin(id)).thread.find((c) => c.id === replyId)!;
    expect(adminView.aiPublic).toMatchObject({ confidence: "medium", canRate: false });
    expect(adminView.aiMeta?.verdict).toBe("exists");
    // human replies carry none
    await call("POST", `/v1/feedback/${id}/comments`, { body: "Thanks" }, kai);
    expect((await asKai(id)).thread.at(-1)!.aiPublic).toBeNull();
  });

  test("only the reporter rates, and only sent AI answers", async () => {
    await setMode("drafts");
    const id = await ticket("How do I copy a week?");
    const drafted = await json(await answer(id, { basis: (await inInbox(id)).basis }));
    expect(drafted.outcome).toBe("drafted");
    // a draft is no answer to rate (the reporter can't even see it)
    expect((await rate(id, drafted.replyId, { score: 1 })).status).toBe(404);
    expect((await rate(id, drafted.noteId, { score: 1 })).status).toBe(404);
    const { id: sentId, replyId } = await answered("How do I copy a program?");
    // the admin is not the reporter
    expect((await rate(sentId, replyId, { score: 1 }, "admin")).status).toBe(403);
    // another trainer can't see the ticket at all
    expect((await rate(sentId, replyId, { score: 1 }, lee)).status).toBe(404);
    // a human reply is not an AI answer
    const human = await json(await call("POST", `/v1/feedback/${sentId}/comments`, { body: "Hm" }, kai));
    expect((await rate(sentId, human.id, { score: -1 })).status).toBe(404);
    // bad input
    expect((await rate(sentId, replyId, { score: 0 })).status).toBe(422);
    expect((await rate(sentId, replyId, { score: -1, tags: ["rude"] })).status).toBe(422);
    const ok = await rate(sentId, replyId, { score: 1 });
    expect(ok.status).toBe(200);
    expect(((await json(ok)) as FeedbackItem).thread.find((c) => c.id === replyId)!.aiPublic!.rating).toMatchObject({ score: 1, tags: [], comment: null });
  });

  test("a second rating replaces the first; 👍 drops tags and comment", async () => {
    const { id, replyId } = await answered("Where is the deload toggle?");
    await rate(id, replyId, { score: -1, tags: ["wrong", "unclear"], comment: "  Not on my screen  " });
    let r = (await asKai(id)).thread.find((c) => c.id === replyId)!.aiPublic!.rating!;
    expect(r).toMatchObject({ score: -1, tags: ["wrong", "unclear"], comment: "Not on my screen" });
    await rate(id, replyId, { score: 1, tags: ["wrong"], comment: "ignored" });
    r = (await asKai(id)).thread.find((c) => c.id === replyId)!.aiPublic!.rating!;
    expect(r).toMatchObject({ score: 1, tags: [], comment: null });
    // the admin sees the same
    expect((await asAdmin(id)).thread.find((c) => c.id === replyId)!.aiPublic!.rating!.score).toBe(1);
  });

  test("the reporter can take a rating back; nobody else can", async () => {
    const { id, replyId } = await answered("Where are my invoices?");
    await rate(id, replyId, { score: -1, tags: ["wrong"] });
    await rate(id, replyId, { score: 1 });
    const unrate = (as: As = kai) => call("DELETE", `/v1/feedback/${id}/comments/${replyId}/rating`, undefined, as);
    expect((await unrate("admin")).status).toBe(403);
    expect((await unrate(lee)).status).toBe(404);
    const ok = await unrate();
    expect(ok.status).toBe(200);
    expect(((await json(ok)) as FeedbackItem).thread.find((c) => c.id === replyId)!.aiPublic!.rating).toBeNull();
    expect((await asAdmin(id)).thread.find((c) => c.id === replyId)!.aiPublic!.rating).toBeNull();
    // nothing to remove is fine
    expect((await unrate()).status).toBe(200);
  });

  test("👎 sends the ticket back once, with the comment; the re-answer is always a draft", async () => {
    const { id, replyId } = await answered("How do I archive a client?");
    expect(await inInbox(id)).toBeUndefined();
    const before = (await pending()).cursor;
    await rate(id, replyId, { score: -1, tags: ["missed_question"], comment: "I asked about archiving, not deleting" });

    const entry = await inInbox(id);
    expect(entry).toBeDefined();
    expect(entry.markdown).toContain("**Reporter rated the last AI answer 👎 Didn't answer my question — “I asked about archiving, not deleting”**");
    expect((await pending()).cursor).not.toBe(before);

    // auto mode, high confidence, an "exists" verdict — still a draft
    const res = await answer(id, { basis: entry.basis, confidence: "high", reply: "Use **Archive** in the client menu." });
    expect(res.status).toBe(200);
    expect((await json(res)).outcome).toBe("drafted");
    expect((await asKai(id)).thread.some((c) => c.body?.includes("Archive"))).toBe(false);

    // at most once per 👎
    expect(await inInbox(id)).toBeUndefined();
    expect((await answer(id, { basis: entry.basis })).status).toBe(409);

    // a new 👎 (the reporter changes their comment) is new work again
    await rate(id, replyId, { score: -1, comment: "Still not it" });
    expect(await inInbox(id)).toBeDefined();
    // but an owner reply settles it
    await call("POST", `/v1/feedback/${id}/comments`, { body: "I'll take this one" });
    expect(await inInbox(id)).toBeUndefined();
  });

  test("each answer is logged as a feedback_answer call, with the uploaded transcript, linked from its entries", async () => {
    const { id, replyId, noteId, callId } = await answered("Where is the history tab?", {
      transcript: TRANSCRIPT,
      durationMs: 42000,
      promptVersion: "answer-feedback:abc123",
    });
    expect(callId).toBeString();
    const [row] = await db.select().from(llmCalls).where(eq(llmCalls.id, callId!));
    expect(row).toMatchObject({
      purpose: "feedback_answer",
      providerId: "claude-code",
      model: "claude-opus-5-5",
      promptVersion: "answer-feedback:abc123",
      status: "ok",
      tokensIn: 130,
      tokensOut: 100,
      tokensCached: 500,
      latencyMs: 42000,
      responseRaw: "Open **Settings → Email**.",
    });
    const ctx = row.context as any;
    expect(ctx).toMatchObject({ feedbackItemId: id, outcome: "sent", afterDownvote: false, sessionId: "s-1", costUsd: null });
    const [blob] = await db.select().from(llmBlobs).where(eq(llmBlobs.sha256, ctx.transcript.blob));
    expect(blob.content).toBe(TRANSCRIPT);
    const [request] = await db.select().from(llmBlobs).where(eq(llmBlobs.sha256, row.requestBlobIds[0].sha));
    expect(request.content).toContain("> Where is the history tab?");
    const linked = await db
      .select({ id: feedbackComments.id, callId: feedbackComments.llmCallId })
      .from(feedbackComments)
      .where(inArray(feedbackComments.id, [replyId, noteId]));
    expect(linked.map((l) => l.callId)).toEqual([callId, callId]);

    // the rating points at the run
    await rate(id, replyId, { score: -1 });
    const [verdict] = await db
      .select()
      .from(llmFeedback)
      .where(and(eq(llmFeedback.subjectKind, "feedback_answer"), eq(llmFeedback.subjectId, replyId)));
    expect(verdict).toMatchObject({ callId, signal: "thumbs_down", score: -1 });

    // no transcript: still logged, model from the answer
    await setMode("drafts");
    const plain = await ticket("Where is the logbook?");
    const out = await json(await answer(plain, { basis: (await inInbox(plain)).basis, model: "claude-x" }));
    const [bare] = await db.select().from(llmCalls).where(eq(llmCalls.id, out.callId));
    expect(bare).toMatchObject({ model: "claude-x", tokensIn: null, latencyMs: null });
    expect((bare.context as any).transcript).toBeNull();
  });

  test("dataset and lessons: the answer, its rating, the owner's rewrite and the run", async () => {
    const { id, replyId, callId } = await answered("Where are exports?", { transcript: TRANSCRIPT });
    await rate(id, replyId, { score: -1, tags: ["outdated"], comment: "That menu moved" });
    // the re-answer is a draft; the owner rewrites it and sends it
    const entry = await inInbox(id);
    const draft = await json(await answer(id, { basis: entry.basis, reply: "Try Settings." }));
    expect(draft.outcome).toBe("drafted");
    expect((await call("POST", `/v1/feedback/${id}/comments/${draft.replyId}/publish`, { body: "It's under Account → Export." })).status).toBe(200);

    const dataset = (await json(await call("GET", "/v1/agent/feedback/dataset", undefined, agent))) as any[];
    const first = dataset.find((r) => r.answer.commentId === replyId);
    expect(first).toMatchObject({
      ticketId: id,
      answer: { body: "Open **Settings → Email**.", visibility: "public", confidence: "medium" },
      rating: { score: -1, tags: ["outdated"], comment: "That menu moved" },
      followUp: { who: "ai", body: "It's under Account → Export." },
      run: { callId, model: "claude-opus-5-5", tokensIn: 130, tokensOut: 100 },
    });
    const second = dataset.find((r) => r.answer.commentId === draft.replyId);
    expect(second.ownerEdit).toEqual({ original: "Try Settings.", sent: "It's under Account → Export." });
    expect((await call("GET", "/v1/agent/feedback/dataset?since=2999-01-01T00:00:00.000Z", undefined, agent)).status).toBe(200);
    expect(await json(await call("GET", "/v1/agent/feedback/dataset?since=2999-01-01T00:00:00.000Z", undefined, agent))).toEqual([]);

    const lessons = (await json(await call("GET", "/v1/agent/feedback/lessons?limit=50", undefined, agent))) as any[];
    expect(lessons.some((r) => r.answer.commentId === replyId && r.rating.comment === "That menu moved")).toBe(true);
    expect(lessons.some((r) => r.answer.commentId === draft.replyId && r.ownerEdit.sent === "It's under Account → Export.")).toBe(true);
    // agent token only
    expect((await call("GET", "/v1/agent/feedback/lessons", undefined, kai)).status).toBe(401);
  });

  test("discarding an AI draft records a rejection; an unedited send records approval", async () => {
    await setMode("drafts");
    const a = await ticket("Discard me");
    const d1 = await json(await answer(a, { basis: (await inInbox(a)).basis }));
    await call("DELETE", `/v1/feedback/${a}/comments/${d1.replyId}`);
    const b = await ticket("Send me");
    const d2 = await json(await answer(b, { basis: (await inInbox(b)).basis }));
    await call("POST", `/v1/feedback/${b}/comments/${d2.replyId}/publish`, {});
    const rows = await db
      .select({ subjectId: llmFeedback.subjectId, signal: llmFeedback.signal })
      .from(llmFeedback)
      .where(and(eq(llmFeedback.subjectKind, "feedback_answer"), inArray(llmFeedback.subjectId, [d1.replyId, d2.replyId])));
    expect(rows).toContainEqual({ subjectId: d1.replyId, signal: "draft_rejected" });
    expect(rows).toContainEqual({ subjectId: d2.replyId, signal: "draft_approved_unedited" });
  });
});
