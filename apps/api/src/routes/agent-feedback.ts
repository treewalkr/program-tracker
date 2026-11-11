import { Elysia, t } from "elysia";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  imageExt,
  shippedNote,
  type FeedbackAiMeta,
  type FeedbackAttachment,
  type FeedbackItem,
  type FeedbackShip,
  type FeedbackStatus,
} from "@pt/shared";
import { API_VERSION } from "../lib/build";
import { getFeedback, listFeedback } from "../lib/feedback";
import { attachmentBytes } from "../lib/feedback-attachments";
import { notifyFeedback } from "../lib/feedback-notify";
import { closeDuplicates, linkDuplicate, type ClosedDuplicate } from "../lib/feedback-duplicates";
import { agentTokenMatches, feedbackAiMode, fixCandidate, inboxCursor, needsAnswer, routeAnswer } from "../lib/feedback-ai";

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

type ShipRef = { handle: string; number: number; sha: string };
type ShipOutcome =
  | { closed: true }
  | { closed: false; reason: "unknown" | "already-shipped" | Exclude<FeedbackStatus, "new" | "accepted"> };

/**
 * Close one ticket for one commit, at most once: a ticket the same commit
 * closed before stays as the owner left it (reopened, say). The release
 * writes a status entry and a public note to the reporter; returns the status
 * entry's id for the email.
 */
async function shipTicket(
  number: number,
  ship: FeedbackShip,
): Promise<ShipOutcome & { itemId?: string; statusId?: string; duplicates?: ClosedDuplicate[] }> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: feedbackItems.id, status: feedbackItems.status, comment: feedbackItems.comment })
      .from(feedbackItems)
      .where(eq(feedbackItems.number, number))
      .for("update");
    if (!item) return { closed: false, reason: "unknown" };
    if (item.status !== "new" && item.status !== "accepted") return { closed: false, reason: item.status };
    const [before] = await tx
      .select({ id: feedbackComments.id })
      .from(feedbackComments)
      .where(
        and(
          eq(feedbackComments.itemId, item.id),
          eq(feedbackComments.authorKind, "system"),
          sql`${feedbackComments.ship}->>'sha' = ${ship.sha}`,
        ),
      )
      .limit(1);
    if (before) return { closed: false, reason: "already-shipped" };
    const now = Date.now();
    await tx
      .update(feedbackItems)
      .set({ status: "done", shippedIn: ship.version, updatedAt: new Date(now) })
      .where(eq(feedbackItems.id, item.id));
    const release = { itemId: item.id, trainerId: null, authorKind: "system" as const, ship };
    const [entry] = await tx
      .insert(feedbackComments)
      .values({ ...release, kind: "status", status: "done", createdAt: new Date(now) })
      .returning({ id: feedbackComments.id });
    // a millisecond later, so the thread reads status → note
    await tx
      .insert(feedbackComments)
      .values({ ...release, kind: "reply", body: shippedNote(ship.version, item.comment), createdAt: new Date(now + 1) });
    // Its open duplicates ship with it: same status entry and note on each.
    const duplicates = await closeDuplicates(tx, item.id, {
      status: "done",
      shippedIn: ship.version,
      trainerId: null,
      authorKind: "system",
      ship,
      note: (comment) => shippedNote(ship.version, comment),
      at: now + 2,
    });
    return { closed: true, itemId: item.id, statusId: entry.id, duplicates };
  });
}
const MAX_TEXT = 2000;
/** Most tickets one fix-agent run may take. */
const FIX_LIMIT = 5;
const GITHUB_PR_URL = "^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$";

/** Stands in for an image URL in the inbox Markdown; the CLI swaps in the downloaded file's path. */
export const agentImageRef = (a: Pick<FeedbackAttachment, "id">) => `attachment:${a.id}`;

/**
 * Every image the agent should look at, in reading order: the ticket's, then
 * each public reply's. `file` is the CLI's download name, `<handle>-<n>.<ext>`.
 */
export function agentAttachments(item: FeedbackItem) {
  const handle = feedbackHandle(item.number);
  const entries = [
    { entry: "ticket", commentId: null as string | null, list: item.attachments },
    ...item.thread
      .filter((c) => c.kind === "reply" && c.visibility === "public" && c.attachments.length)
      .map((c) => ({
        entry: `reply by ${c.authorKind === "ai" ? "AI" : (c.author?.name ?? "unknown")} on ${c.createdAt.slice(0, 10)}`,
        commentId: c.id as string | null,
        list: c.attachments,
      })),
  ];
  let n = 0;
  return entries.flatMap(({ entry, commentId, list }) =>
    list.map((a) => ({
      id: a.id,
      kind: a.kind,
      mime: a.mime,
      entry,
      commentId,
      file: `${handle}-${++n}.${imageExt(a.mime)}`,
    })),
  );
}

const imageResponse = (bytes: Buffer, mime: string) =>
  // octet-stream so Eden hands the CLI raw bytes (it reads image/* as text); the real type rides along
  new Response(new Uint8Array(bytes), { headers: { "content-type": "application/octet-stream", "x-shot-type": mime } });

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
      return items.map((item) => {
        const attachments = agentAttachments(item);
        const listed = new Set(attachments.map((a) => a.id));
        return {
        id: item.id,
        number: item.number,
        handle: feedbackHandle(item.number),
        status: item.status,
        basis: ticketBasis(item),
        /** Reporter's build: `x.y.z+sha` or a bare sha. */
        build: item.context.appVersion,
        /** Every image on the ticket and its public replies. */
        attachments,
        markdown: feedbackItemMarkdown(item, { imageUrl: (_, a) => (listed.has(a.id) ? agentImageRef(a) : null) }),
        };
      });
    },
    { detail: { summary: "Tickets the auto-reply agent should answer" } },
  )
  /**
   * Every open ticket in brief, oldest first — what the agent compares a new
   * ticket against before calling it a duplicate. Comments clipped to 400
   * characters; `duplicateOf` is the number of the ticket it already repeats.
   */
  .get(
    "/open",
    async () => {
      const items = await listFeedback(["new", "accepted"], "oldest");
      return items.map((i) => ({
        id: i.id,
        number: i.number,
        handle: feedbackHandle(i.number),
        status: i.status,
        route: i.context.route.path,
        comment: i.comment.length > 400 ? `${i.comment.slice(0, 399)}…` : i.comment,
        duplicateOf: i.duplicateOf?.number ?? null,
        createdAt: i.createdAt,
      }));
    },
    { detail: { summary: "Open tickets in brief, for duplicate checks" } },
  )
  /**
   * Tickets the fix agent may take (`fixCandidate`), oldest first, at most
   * `limit` (default and cap 5): Markdown brief, basis and any recorded PR,
   * which the caller checks with `gh` — an open or merged one means skip.
   * `skipped` lists the other accepted tickets and why, for the dry run.
   */
  .get(
    "/fixable",
    async ({ query }) => {
      const accepted = await listFeedback(["accepted"], "oldest");
      const ready = [] as FeedbackItem[];
      const skipped: { handle: string; reason: string }[] = [];
      for (const item of accepted) {
        const verdict = fixCandidate(item);
        if (verdict.ok) ready.push(item);
        else skipped.push({ handle: feedbackHandle(item.number), reason: verdict.reason });
      }
      return {
        tickets: ready.slice(0, query.limit ?? FIX_LIMIT).map((item) => ({
          id: item.id,
          number: item.number,
          handle: feedbackHandle(item.number),
          basis: ticketBasis(item),
          fixPr: item.fixPr?.url ?? null,
          markdown: feedbackItemMarkdown(item, { imageUrl: () => null }),
        })),
        /** Candidates beyond `limit`. */
        more: Math.max(0, ready.length - (query.limit ?? FIX_LIMIT)),
        skipped,
      };
    },
    {
      query: t.Object({ limit: t.Optional(t.Integer({ minimum: 1, maximum: FIX_LIMIT })) }),
      detail: { summary: "Accepted, low-risk, ready tickets for the fix agent" },
    },
  )
  /**
   * Record the fix agent's pull request on an accepted ticket. Replaces an
   * older one (the agent only reopens a ticket whose PR was closed unmerged).
   */
  .post(
    "/:id/fix-pr",
    async ({ params, body, status }) => {
      const [row] = await db
        .update(feedbackItems)
        .set({ fixPr: body.url, fixPrAt: new Date() })
        .where(and(eq(feedbackItems.id, params.id), eq(feedbackItems.status, "accepted")))
        .returning({ number: feedbackItems.number });
      if (!row) {
        const [exists] = await db.select({ id: feedbackItems.id }).from(feedbackItems).where(eq(feedbackItems.id, params.id));
        return exists ? status(409, { error: "only an accepted ticket takes a fix PR" }) : status(404, NOT_FOUND);
      }
      return { handle: feedbackHandle(row.number), fixPr: body.url };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ url: t.String({ pattern: GITHUB_PR_URL, maxLength: 300 }) }),
      detail: { summary: "Record the fix agent's pull request on a ticket" },
    },
  )
  /**
   * Link a ticket to the open ticket it repeats (`of` = its number). Same
   * rules as the admin's link: both open, no chains. The agent still answers
   * the ticket as usual; the link only makes it close with the original.
   */
  .post(
    "/:id/duplicate",
    async ({ params, body, status }) => {
      const out = await linkDuplicate(params.id, body.of);
      if (!out.ok) return status(out.status, { error: out.error });
      return { linked: true as const, changed: out.changed, of: feedbackHandle(body.of) };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ of: t.Integer({ minimum: 1, maximum: 999_999_999 }) }),
      detail: { summary: "Mark a ticket a duplicate of an open one" },
    },
  )
  /**
   * The cheap check a local watcher polls: how many tickets wait for an
   * answer, how many the fix agent could take, and `cursor`, which changes
   * exactly when the inbox does. No Markdown, no images.
   */
  .get(
    "/pending",
    async () => {
      const open = await listFeedback(["new", "accepted"], "oldest");
      const inbox = open.filter(needsAnswer);
      return {
        inbox: inbox.length,
        fixable: open.filter((i) => fixCandidate(i).ok).length,
        cursor: inboxCursor(inbox.map((i) => ({ id: i.id, basis: ticketBasis(i) }))),
      };
    },
    { detail: { summary: "Inbox and fixable counts, plus a cursor that changes with the inbox" } },
  )
  /**
   * Tickets by number (`?numbers=12,14`), any status: what `changelog:draft`
   * words a release line from. Unknown numbers are left out.
   */
  .get(
    "/tickets",
    async ({ query }) => {
      const numbers = [...new Set(query.numbers.split(",").map(Number))];
      const rows = await db
        .select({ number: feedbackItems.number, status: feedbackItems.status, comment: feedbackItems.comment })
        .from(feedbackItems)
        .where(inArray(feedbackItems.number, numbers))
        .orderBy(feedbackItems.number);
      return rows.map((r) => ({ ...r, handle: feedbackHandle(r.number) }));
    },
    {
      query: t.Object({ numbers: t.String({ pattern: "^[1-9][0-9]{0,8}(,[1-9][0-9]{0,8}){0,99}$" }) }),
      detail: { summary: "Tickets by number, for release notes" },
    },
  )
  /** One image on a ticket or a public reply. */
  .get(
    "/:id/attachments/:attachmentId",
    async ({ params, status }) => {
      const item = await getFeedback(params.id);
      const row = item ? await attachmentBytes(params.id, params.attachmentId) : null;
      const visible = row && (!row.commentId || item!.thread.some((c) => c.id === row.commentId && c.visibility === "public"));
      if (!visible) return status(404, { error: "image not found" });
      return imageResponse(row.bytes, row.mime);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), attachmentId: t.String({ format: "uuid" }) }),
      detail: { summary: "Image bytes for the auto-reply agent" },
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
      if (body.ready && !fixPlan.length) return status(422, { error: "ready needs a fix plan" });

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
          ...(body.ready !== undefined ? { ready: body.ready } : {}),
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
        /** For `bug` / `feature`: the plan is complete and checked, nothing left to ask — the fix agent may take it (with low risk). */
        ready: t.Optional(t.Boolean()),
        model: t.Optional(t.String({ maxLength: 100 })),
      }),
      detail: { summary: "Record the auto-reply agent's answer: a private note, plus a sent or drafted reply" },
    },
  )
  /**
   * CI, after a deploy is live: close the tickets these commits name. Each
   * open (new / accepted) ticket goes to done with `shippedIn` = this server's
   * version, gets a release status entry and a public note, and its reporter
   * the usual status email. Done, won't-fix and unknown tickets are reported,
   * not touched; a commit never closes the same ticket twice.
   */
  .post(
    "/shipped",
    async ({ body }) => {
      const closed: ShipRef[] = [];
      const skipped: (ShipRef & { reason: string })[] = [];
      const unknown: ShipRef[] = [];
      /** Duplicates closed along with a ticket in `closed`. */
      const closedDuplicates: (ShipRef & { duplicate: string })[] = [];
      for (const commit of body.commits) {
        const sha = commit.sha.toLowerCase();
        for (const number of new Set(commit.handles)) {
          const ref = { handle: feedbackHandle(number), number, sha };
          const out = await shipTicket(number, { sha, version: API_VERSION });
          if (out.closed) {
            closed.push(ref);
            notifyFeedback({ kind: "status", itemId: out.itemId!, commentId: out.statusId! });
            for (const d of out.duplicates ?? []) {
              closedDuplicates.push({ ...ref, duplicate: feedbackHandle(d.number) });
              notifyFeedback({ kind: "status", itemId: d.itemId, commentId: d.statusId });
            }
          } else if (out.reason === "unknown") unknown.push(ref);
          else skipped.push({ ...ref, reason: out.reason });
        }
      }
      return { version: API_VERSION, closed, closedDuplicates, skipped, unknown };
    },
    {
      body: t.Object({
        commits: t.Array(
          t.Object({
            sha: t.String({ pattern: "^[0-9a-fA-F]{7,40}$" }),
            subject: t.String({ maxLength: 1000 }),
            handles: t.Array(t.Integer({ minimum: 1 }), { maxItems: 50 }),
          }),
          { maxItems: 1000 },
        ),
      }),
      detail: { summary: "Close the tickets that live commits name (CI, after a deploy)" },
    },
  );
