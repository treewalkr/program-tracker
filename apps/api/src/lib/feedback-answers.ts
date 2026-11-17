import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, feedbackComments, llmBlobs, llmCalls, llmFeedback } from "@pt/db";
import {
  FEEDBACK_AI_CONFIDENCE,
  FEEDBACK_ANSWER_TAGS,
  feedbackHandle,
  type FeedbackAiMeta,
  type FeedbackAnswerRating,
  type FeedbackAnswerTag,
  type FeedbackComment,
  type FeedbackFixRating,
  type FeedbackItem,
  type LlmSignal,
} from "@pt/shared";
import { API_BUILD } from "./build";
import { capTranscript, transcriptStats } from "./agent-transcript";

/**
 * AI answers to feedback tickets as logged LLM outputs: the reporter's
 * 👍/👎 (llm_feedback, subject kind `feedback_answer`, subject id = the
 * reply's comment id), the agent run behind each answer (llm_calls, purpose
 * `feedback_answer`), and the records `feedback:agent dataset` and `lessons`
 * print.
 */

const RATING_SIGNALS: LlmSignal[] = ["thumbs_up", "thumbs_down"];
const TAGS = new Set<string>(FEEDBACK_ANSWER_TAGS);

/** The latest 👍/👎 on each of these answers (a later rating replaces an earlier one). */
export async function answerRatings(commentIds: string[]): Promise<Map<string, FeedbackAnswerRating>> {
  const out = new Map<string, FeedbackAnswerRating>();
  if (!commentIds.length) return out;
  const rows = await db
    .select({
      subjectId: llmFeedback.subjectId,
      signal: llmFeedback.signal,
      tags: llmFeedback.reasonTags,
      comment: llmFeedback.comment,
      createdAt: llmFeedback.createdAt,
    })
    .from(llmFeedback)
    .where(
      and(
        eq(llmFeedback.subjectKind, "feedback_answer"),
        inArray(llmFeedback.subjectId, commentIds),
        inArray(llmFeedback.signal, RATING_SIGNALS),
      ),
    )
    .orderBy(asc(llmFeedback.createdAt));
  for (const r of rows) {
    out.set(r.subjectId, {
      score: r.signal === "thumbs_up" ? 1 : -1,
      tags: r.tags.filter((t): t is FeedbackAnswerTag => TAGS.has(t)),
      comment: r.comment,
      at: r.createdAt.toISOString(),
    });
  }
  return out;
}

/** The reporter rates an answer. 👍 carries no tags or comment. Insert-only; the newest row wins. */
export async function rateAnswer(input: {
  trainerId: string;
  commentId: string;
  score: 1 | -1;
  tags?: FeedbackAnswerTag[];
  comment?: string | null;
}): Promise<void> {
  const down = input.score === -1;
  const [c] = await db
    .select({ callId: feedbackComments.llmCallId })
    .from(feedbackComments)
    .where(eq(feedbackComments.id, input.commentId));
  await db.insert(llmFeedback).values({
    trainerId: input.trainerId,
    callId: c?.callId ?? null,
    subjectKind: "feedback_answer",
    subjectId: input.commentId,
    signal: down ? "thumbs_down" : "thumbs_up",
    score: input.score,
    reasonTags: down ? [...new Set(input.tags ?? [])] : [],
    comment: down ? input.comment?.trim() || null : null,
  });
}

/** The reporter's latest "Fixed for you?" 👍/👎 on each of these shipped notes. */
export async function fixRatings(commentIds: string[]): Promise<Map<string, FeedbackFixRating>> {
  const out = new Map<string, FeedbackFixRating>();
  if (!commentIds.length) return out;
  const rows = await db
    .select({ subjectId: llmFeedback.subjectId, signal: llmFeedback.signal, comment: llmFeedback.comment, createdAt: llmFeedback.createdAt })
    .from(llmFeedback)
    .where(
      and(eq(llmFeedback.subjectKind, "feedback_fix"), inArray(llmFeedback.subjectId, commentIds), inArray(llmFeedback.signal, RATING_SIGNALS)),
    )
    .orderBy(asc(llmFeedback.createdAt));
  for (const r of rows) {
    out.set(r.subjectId, { score: r.signal === "thumbs_up" ? 1 : -1, comment: r.comment, at: r.createdAt.toISOString() });
  }
  return out;
}

/**
 * The reporter rates a shipped fix: one row per note, a new rating replaces
 * the old (subject kind `feedback_fix`, subject id = the release's note).
 * Runs in the caller's transaction.
 */
export async function rateFix(
  tx: Pick<typeof db, "delete" | "insert">,
  input: { trainerId: string; commentId: string; score: 1 | -1; comment?: string | null; at: Date },
): Promise<void> {
  const subject = and(eq(llmFeedback.subjectKind, "feedback_fix"), eq(llmFeedback.subjectId, input.commentId));
  await tx.delete(llmFeedback).where(and(subject, inArray(llmFeedback.signal, RATING_SIGNALS)));
  const down = input.score === -1;
  await tx.insert(llmFeedback).values({
    trainerId: input.trainerId,
    subjectKind: "feedback_fix",
    subjectId: input.commentId,
    signal: down ? "thumbs_down" : "thumbs_up",
    score: input.score,
    comment: down ? input.comment?.trim() || null : null,
    createdAt: input.at,
  });
}

/** The reporter takes their 👍/👎 back: every rating row on the answer goes. */
export async function unrateAnswer(commentId: string): Promise<void> {
  await db
    .delete(llmFeedback)
    .where(
      and(
        eq(llmFeedback.subjectKind, "feedback_answer"),
        eq(llmFeedback.subjectId, commentId),
        inArray(llmFeedback.signal, RATING_SIGNALS),
      ),
    );
}

/**
 * The owner sent or discarded an AI draft: an implicit verdict on it. An
 * edited send keeps the agent's original text (payload) and the sent text
 * (correction) — what `lessons` shows the agent. Never breaks the action.
 */
export async function recordDraftVerdict(input: {
  trainerId: string;
  commentId: string;
  signal: "draft_approved_unedited" | "draft_approved_edited" | "draft_rejected";
  original?: string | null;
  sent?: string | null;
}): Promise<void> {
  try {
    const [c] = await db
      .select({ callId: feedbackComments.llmCallId })
      .from(feedbackComments)
      .where(eq(feedbackComments.id, input.commentId));
    await db.insert(llmFeedback).values({
      trainerId: input.trainerId,
      callId: c?.callId ?? null,
      subjectKind: "feedback_answer",
      subjectId: input.commentId,
      signal: input.signal,
      score: input.signal === "draft_approved_unedited" ? 1 : input.signal === "draft_rejected" ? -1 : 0,
      payload: input.signal === "draft_approved_edited" ? { original: input.original ?? null } : null,
      correction: input.signal === "draft_approved_edited" ? (input.sent ?? null) : null,
    });
  } catch (err) {
    console.error("[llm-log] failed to record a draft verdict:", err);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface AgentRun {
  /** Claude Code `stream-json` output, as far as the run got. */
  transcript?: string;
  /** Since the run started, when the transcript has no `result` yet. */
  durationMs?: number;
  /** `answer-feedback:<hash of SKILL.md>`. */
  promptVersion?: string;
}

/**
 * Log one agent answer as an llm_calls row (purpose `feedback_answer`): the
 * ticket Markdown it answered (request blob), the answer (response), and —
 * when uploaded — the run transcript (a blob, by hash, in `context`) with its
 * model, tokens, cost and duration. Links the note and reply to it. Returns
 * the call id; null when logging failed (the answer stands regardless).
 */
export async function logAgentAnswer(input: {
  item: FeedbackItem;
  markdown: string;
  basis: string;
  answer: Pick<FeedbackAiMeta, "verdict" | "confidence" | "citations" | "fixPlan" | "risk" | "ready" | "acceptance"> & {
    reply: string | null;
    note: string;
    model?: string;
  };
  outcome: "sent" | "drafted" | "noted";
  commentIds: string[];
  downvote: boolean;
  run?: AgentRun;
}): Promise<string | null> {
  try {
    const capped = input.run?.transcript ? capTranscript(input.run.transcript) : null;
    const stats = capped ? transcriptStats(capped.text) : null;
    const blobs = [{ sha256: sha256(input.markdown), content: input.markdown, bytes: Buffer.byteLength(input.markdown) }];
    if (capped) blobs.push({ sha256: sha256(capped.text), content: capped.text, bytes: Buffer.byteLength(capped.text) });
    await db.insert(llmBlobs).values(blobs).onConflictDoNothing();
    const { reply, note, model, ...meta } = input.answer;
    const [row] = await db
      .insert(llmCalls)
      .values({
        turnId: randomUUID(),
        purpose: "feedback_answer",
        trainerId: null,
        providerId: "claude-code",
        model: stats?.model ?? model ?? "unknown",
        jsonMode: false,
        promptVersion: input.run?.promptVersion ?? "answer-feedback",
        appBuild: API_BUILD,
        requestBlobIds: [{ role: "user", sha: blobs[0].sha256 }],
        context: {
          feedbackItemId: input.item.id,
          handle: feedbackHandle(input.item.number),
          basis: input.basis,
          outcome: input.outcome,
          commentIds: input.commentIds,
          afterDownvote: input.downvote,
          transcript: capped ? { blob: blobs[1].sha256, bytes: blobs[1].bytes, truncated: capped.truncated } : null,
          costUsd: stats?.costUsd ?? null,
          numTurns: stats?.numTurns ?? null,
          sessionId: stats?.sessionId ?? null,
        },
        responseRaw: reply ?? note,
        parsed: { ...meta, reply, note },
        status: "ok",
        tokensIn: stats?.tokensIn ?? null,
        tokensOut: stats?.tokensOut ?? null,
        tokensCached: stats?.tokensCached ?? null,
        latencyMs: stats?.durationMs ?? input.run?.durationMs ?? null,
      })
      .returning({ id: llmCalls.id });
    if (input.commentIds.length) {
      await db.update(feedbackComments).set({ llmCallId: row.id }).where(inArray(feedbackComments.id, input.commentIds));
    }
    return row.id;
  } catch (err) {
    console.error("[llm-log] failed to log a feedback answer:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dataset and lessons
// ---------------------------------------------------------------------------

export interface AnswerRunInfo {
  callId: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  transcriptBytes: number | null;
}

export interface OwnerEdit {
  original: string | null;
  sent: string | null;
}

type Who = "reporter" | "owner" | "ai" | "release";

/** One AI answer with everything around it — a dataset line. */
export interface AnswerRecord {
  handle: string;
  ticketId: string;
  status: FeedbackItem["status"];
  ticket: { comment: string; route: string; build: string; createdAt: string };
  /** Public entries before the answer, oldest first. */
  thread: { who: Who; body: string; at: string }[];
  answer: {
    commentId: string;
    body: string;
    visibility: FeedbackComment["visibility"];
    at: string;
    verdict: FeedbackAiMeta["verdict"];
    confidence: FeedbackAiMeta["confidence"];
    citations: string[];
    model: string | null;
  };
  /** The private triage note written with it. */
  note: string | null;
  rating: FeedbackAnswerRating | null;
  /** The owner changed the draft before sending it. */
  ownerEdit: OwnerEdit | null;
  /** The next public reply after the answer — often the correction. */
  followUp: { who: Who; body: string; at: string } | null;
  run: AnswerRunInfo | null;
}

const whoOf = (item: FeedbackItem, c: FeedbackComment): Who =>
  c.authorKind === "ai"
    ? "ai"
    : c.authorKind === "system"
      ? "release"
      : item.author && c.author?.id === item.author.id
        ? "reporter"
        : "owner";

/**
 * Every AI reply (sent or draft) on these tickets as a record, oldest ticket
 * first. Pure; needs the admin view (drafts, notes, aiMeta).
 */
export function answerRecords(
  items: FeedbackItem[],
  extras: { runs?: Map<string, AnswerRunInfo>; edits?: Map<string, OwnerEdit> } = {},
): AnswerRecord[] {
  const out: AnswerRecord[] = [];
  for (const item of items) {
    const replies = item.thread.filter((c) => c.kind === "reply");
    for (const a of replies) {
      if (a.authorKind !== "ai" || a.visibility === "private" || !a.aiMeta) continue;
      const pub = replies.filter((c) => c.visibility === "public");
      const note = item.thread.findLast(
        (c) => c.authorKind === "ai" && c.visibility === "private" && c.aiMeta?.basis === a.aiMeta!.basis,
      );
      const next = a.visibility === "public" ? pub.find((c) => c.createdAt > a.createdAt) : undefined;
      out.push({
        handle: feedbackHandle(item.number),
        ticketId: item.id,
        status: item.status,
        ticket: { comment: item.comment, route: item.context.route.path, build: item.context.appVersion, createdAt: item.createdAt },
        thread: pub
          .filter((c) => c.createdAt < a.createdAt && c.id !== a.id)
          .map((c) => ({ who: whoOf(item, c), body: c.body ?? "", at: c.createdAt })),
        answer: {
          commentId: a.id,
          body: a.body ?? "",
          visibility: a.visibility,
          at: a.createdAt,
          verdict: a.aiMeta.verdict,
          confidence: a.aiMeta.confidence,
          citations: a.aiMeta.citations,
          model: a.aiMeta.model,
        },
        note: note?.body ?? null,
        rating: a.aiPublic?.rating ?? null,
        ownerEdit: extras.edits?.get(a.id) ?? null,
        followUp: next ? { who: whoOf(item, next), body: next.body ?? "", at: next.createdAt } : null,
        run: extras.runs?.get(a.id) ?? null,
      });
    }
  }
  return out;
}

/** What went wrong lately: 👎 answers and drafts the owner had to rewrite, newest first. */
export function lessonRecords(records: AnswerRecord[], limit = 20): AnswerRecord[] {
  return records
    .filter((r) => r.rating?.score === -1 || r.ownerEdit)
    .sort((a, b) => ((b.rating?.at ?? b.answer.at) > (a.rating?.at ?? a.answer.at) ? 1 : -1))
    .slice(0, limit);
}

/** One shipped fix and the reporter's verdict on it — a dataset line (`type: "fix"`). */
export interface FixRecord {
  type: "fix";
  handle: string;
  ticketId: string;
  status: FeedbackItem["status"];
  ticket: { comment: string; kind: FeedbackItem["kind"]; route: string; build: string; createdAt: string };
  ship: { sha: string; version: string; at: string };
  /** The AI triage the fix followed: the latest note before it shipped; null when there was none. */
  triage: Pick<FeedbackAiMeta, "verdict" | "confidence" | "risk" | "ready" | "fixPlan" | "acceptance"> | null;
  fixPr: string | null;
  rating: FeedbackFixRating | null;
}

/** Every release note on these tickets as a fix record, oldest ticket first. Pure; needs the admin view. */
export function fixRecords(items: FeedbackItem[]): FixRecord[] {
  const out: FixRecord[] = [];
  for (const item of items) {
    for (const c of item.thread) {
      if (!c.fixPublic || !c.ship) continue;
      const note = item.thread.findLast(
        (n) => n.authorKind === "ai" && n.visibility === "private" && n.aiMeta && n.createdAt < c.createdAt,
      )?.aiMeta;
      out.push({
        type: "fix",
        handle: feedbackHandle(item.number),
        ticketId: item.id,
        status: item.status,
        ticket: {
          comment: item.comment,
          kind: item.kind,
          route: item.context.route.path,
          build: item.context.appVersion,
          createdAt: item.createdAt,
        },
        ship: { sha: c.ship.sha, version: c.ship.version, at: c.createdAt },
        triage: note
          ? {
              verdict: note.verdict,
              confidence: note.confidence,
              ...(note.risk ? { risk: note.risk } : {}),
              ...(note.ready !== undefined ? { ready: note.ready } : {}),
              ...(note.fixPlan ? { fixPlan: note.fixPlan } : {}),
              ...(note.acceptance ? { acceptance: note.acceptance } : {}),
            }
          : null,
        fixPr: item.fixPr?.url ?? null,
        rating: c.fixPublic.rating,
      });
    }
  }
  return out;
}

export interface CalibrationCell {
  count: number;
  up: number;
  down: number;
  unrated: number;
  /** Shares of `count`, 0–1, two decimals; 0 when there are none. */
  upShare: number;
  downShare: number;
}

/**
 * How well confidence predicts the reporter's verdict: per confidence level,
 * how many AI answers (and shipped fixes, by the confidence of the triage
 * they followed) there were and what share were rated 👍 / 👎. Pure.
 */
export function calibration(answers: AnswerRecord[], fixes: FixRecord[]) {
  const cell = (scores: (1 | -1 | null)[]): CalibrationCell => {
    const up = scores.filter((s) => s === 1).length;
    const down = scores.filter((s) => s === -1).length;
    const share = (n: number) => (scores.length ? Math.round((n / scores.length) * 100) / 100 : 0);
    return { count: scores.length, up, down, unrated: scores.length - up - down, upShare: share(up), downShare: share(down) };
  };
  return FEEDBACK_AI_CONFIDENCE.map((confidence) => ({
    confidence,
    // Drafts never reached the reporter: only sent answers can be rated.
    answers: cell(answers.filter((a) => a.answer.visibility === "public" && a.answer.confidence === confidence).map((a) => a.rating?.score ?? null)),
    fixes: cell(fixes.filter((f) => f.triage?.confidence === confidence).map((f) => f.rating?.score ?? null)),
  }));
}

/** The run behind each answer and the owner's edits, for these tickets (two or three queries). */
export async function answerExtras(items: FeedbackItem[]): Promise<{ runs: Map<string, AnswerRunInfo>; edits: Map<string, OwnerEdit> }> {
  const ids = items.flatMap((i) => i.thread.filter((c) => c.authorKind === "ai" && c.kind === "reply").map((c) => c.id));
  const runs = new Map<string, AnswerRunInfo>();
  const edits = new Map<string, OwnerEdit>();
  if (!ids.length) return { runs, edits };
  const links = await db
    .select({
      commentId: feedbackComments.id,
      callId: llmCalls.id,
      model: llmCalls.model,
      tokensIn: llmCalls.tokensIn,
      tokensOut: llmCalls.tokensOut,
      latencyMs: llmCalls.latencyMs,
      context: llmCalls.context,
    })
    .from(feedbackComments)
    .innerJoin(llmCalls, eq(llmCalls.id, feedbackComments.llmCallId))
    .where(inArray(feedbackComments.id, ids));
  for (const l of links) {
    const ctx = l.context as { costUsd?: number | null; transcript?: { bytes?: number } | null };
    runs.set(l.commentId, {
      callId: l.callId,
      model: l.model,
      tokensIn: l.tokensIn,
      tokensOut: l.tokensOut,
      costUsd: ctx.costUsd ?? null,
      latencyMs: l.latencyMs,
      transcriptBytes: ctx.transcript?.bytes ?? null,
    });
  }
  const edited = await db
    .select({ subjectId: llmFeedback.subjectId, payload: llmFeedback.payload, correction: llmFeedback.correction })
    .from(llmFeedback)
    .where(
      and(
        eq(llmFeedback.subjectKind, "feedback_answer"),
        inArray(llmFeedback.subjectId, ids),
        eq(llmFeedback.signal, "draft_approved_edited"),
      ),
    )
    .orderBy(asc(llmFeedback.createdAt));
  for (const e of edited) {
    edits.set(e.subjectId, { original: (e.payload?.original as string | null | undefined) ?? null, sent: e.correction });
  }
  return { runs, edits };
}
