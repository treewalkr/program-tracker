import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, feedbackComments, feedbackItems } from "@pt/db";
import {
  ticketBasis,
  FEEDBACK_AI_CONFIDENCE,
  FEEDBACK_AI_RISKS,
  FEEDBACK_AI_VERDICTS,
  FEEDBACK_FIX_PLAN_MAX_STEPS,
  FEEDBACK_FIX_PLAN_STEP_MAX,
  feedbackHandle,
  feedbackItemMarkdown,
  type FeedbackAiMeta,
} from "@pt/shared";
import { getFeedback, listFeedback, shotMime } from "../lib/feedback";
import { notifyFeedback } from "../lib/feedback-notify";
import { agentTokenMatches, feedbackAiMode, needsAnswer, routeAnswer } from "../lib/feedback-ai";

/**
 * Bearer FEEDBACK_AGENT_TOKEN, nothing else: no session, no trainer. Only the
 * routes below use it, and they never accept a session cookie either.
 */
export const agentAuth = new Elysia({ name: "agent-auth" }).onBeforeHandle(
  { as: "scoped" },
  ({ headers, status }) => {
    if (!agentTokenMatches(headers.authorization)) return status(401, { error: "unauthorized" });
  },
);

const NOT_FOUND = { error: "feedback not found" } as const;
const MAX_TEXT = 2000;

/**
 * The feedback auto-reply agent's API (see lib/feedback-ai). It reads tickets
 * like the admin does, and writes only AI thread entries: a private note
 * always, plus a reply that is sent or left as a draft. It never changes a
 * ticket's status.
 */
export const agentFeedbackRoutes = new Elysia({ prefix: "/v1/agent/feedback", tags: ["agent"] })
  .use(agentAuth)
  /** Tickets waiting on an answer, oldest first, each as self-contained Markdown. */
  .get(
    "/inbox",
    async () => {
      const items = (await listFeedback(["new", "accepted"], "oldest")).filter(needsAnswer);
      return items.map((item) => ({
        id: item.id,
        number: item.number,
        handle: feedbackHandle(item.number),
        status: item.status,
        basis: ticketBasis(item),
        /** Reporter's build: `x.y.z+sha` or a bare sha. */
        build: item.context.appVersion,
        shots: { element: item.hasElementShot, page: item.hasPageShot },
        markdown: feedbackItemMarkdown(item, { imageUrl: () => null }),
      }));
    },
    { detail: { summary: "Tickets the auto-reply agent should answer" } },
  )
  .get(
    "/:id/shots/:kind",
    async ({ params, status }) => {
      const col = params.kind === "element" ? feedbackItems.elementShot : feedbackItems.pageShot;
      const [row] = await db.select({ shot: col }).from(feedbackItems).where(eq(feedbackItems.id, params.id));
      if (!row?.shot) return status(404, { error: "screenshot not found" });
      // octet-stream so Eden hands the CLI raw bytes (it reads image/* as text); the real type rides along
      return new Response(new Uint8Array(row.shot), {
        headers: { "content-type": "application/octet-stream", "x-shot-type": shotMime(row.shot) },
      });
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), kind: t.UnionEnum(["element", "page"]) }),
      detail: { summary: "Screenshot bytes for the auto-reply agent" },
    },
  )
  /**
   * Record an answer for the ticket version `basis`. The note is stored as a
   * private AI entry; the reply goes out only when `routeAnswer` says so,
   * otherwise it waits as a draft for the admin.
   */
  .post(
    "/:id/answer",
    async ({ params, body, status }) => {
      const mode = await feedbackAiMode();
      if (mode === "off") return status(403, { error: "AI answers are off" });
      const reply = body.reply?.trim() || null;
      const note = body.note.trim();
      if (!note) return status(422, { error: "note is empty" });
      const fixPlan = (body.fixPlan ?? []).map((s) => s.trim()).filter(Boolean);

      const out = await db.transaction(async (tx) => {
        // Serialises answers per ticket: a second run waits here, then sees the first one's entries.
        const [locked] = await tx
          .select({ id: feedbackItems.id })
          .from(feedbackItems)
          .where(eq(feedbackItems.id, params.id))
          .for("update");
        if (!locked) return { error: 404 as const };
        const item = (await getFeedback(params.id))!;
        if (item.status !== "new" && item.status !== "accepted") return { error: "closed" as const };
        const basis = ticketBasis(item);
        if (basis !== body.basis) return { error: "stale" as const, basis };
        if (item.thread.some((c) => c.authorKind === "ai" && c.aiMeta?.basis === basis)) {
          return { error: "answered" as const, basis };
        }
        const outcome = reply ? routeAnswer(mode, body, item) : null;
        const now = Date.now();
        const aiMeta: FeedbackAiMeta = {
          verdict: body.verdict,
          confidence: body.confidence,
          citations: body.citations,
          ...(fixPlan.length ? { fixPlan } : {}),
          ...(body.risk ? { risk: body.risk } : {}),
          basis,
          model: body.model ?? null,
          runAt: new Date(now).toISOString(),
        };
        const ai = { itemId: params.id, trainerId: null, kind: "reply" as const, authorKind: "ai" as const, aiMeta };
        const [noteRow] = await tx
          .insert(feedbackComments)
          .values({ ...ai, body: note, visibility: "private", createdAt: new Date(now) })
          .returning({ id: feedbackComments.id });
        const replyRow = reply
          ? (
              await tx
                .insert(feedbackComments)
                // a millisecond after the note, so the thread reads note → reply
                .values({ ...ai, body: reply, visibility: outcome === "sent" ? "public" : "draft", createdAt: new Date(now + 1) })
                .returning({ id: feedbackComments.id })
            )[0]
          : null;
        return { outcome, noteId: noteRow.id, replyId: replyRow?.id ?? null };
      });

      if ("error" in out) {
        if (out.error === 404) return status(404, NOT_FOUND);
        if (out.error === "closed") return status(409, { error: "ticket is closed", basis: null });
        if (out.error === "stale") return status(409, { error: "ticket changed since the inbox was read", basis: out.basis });
        return status(409, { error: "already answered for this version of the ticket", basis: out.basis });
      }
      if (out.outcome === "sent" && out.replyId) {
        notifyFeedback({ kind: "reply", itemId: params.id, commentId: out.replyId });
      }
      return { outcome: out.outcome ?? ("noted" as const), noteId: out.noteId, replyId: out.replyId };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        basis: t.String({ minLength: 1, maxLength: 64 }),
        reply: t.Optional(t.String({ maxLength: MAX_TEXT })),
        note: t.String({ minLength: 1, maxLength: MAX_TEXT }),
        verdict: t.UnionEnum(FEEDBACK_AI_VERDICTS),
        confidence: t.UnionEnum(FEEDBACK_AI_CONFIDENCE),
        citations: t.Array(t.String({ maxLength: 300 }), { maxItems: 30 }),
        /** For `bug` / `feature`: steps for the coding agent that will fix it. */
        fixPlan: t.Optional(
          t.Array(t.String({ minLength: 1, maxLength: FEEDBACK_FIX_PLAN_STEP_MAX }), { maxItems: FEEDBACK_FIX_PLAN_MAX_STEPS }),
        ),
        // Literal union, not t.UnionEnum: UnionEnum's default (its first value) would fill an absent risk with "low".
        risk: t.Optional(t.Union(FEEDBACK_AI_RISKS.map((r) => t.Literal(r)))),
        model: t.Optional(t.String({ maxLength: 100 })),
      }),
      detail: { summary: "Record the auto-reply agent's answer: a private note, plus a sent or drafted reply" },
    },
  );
