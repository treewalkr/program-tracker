import { Elysia, t, type Static } from "elysia";
import { and, eq, ne } from "drizzle-orm";
import { db, feedbackComments, feedbackItems, feedbackMutes } from "@pt/db";
import {
  FEEDBACK_ANSWER_COMMENT_MAX,
  FEEDBACK_ANSWER_TAGS,
  FEEDBACK_ATTACHMENT_KINDS,
  feedbackHandle,
  feedbackMarkdown,
  formatSourceLoc,
  type FeedbackAnswerTag,
  type FeedbackAttachmentKind,
  type FeedbackContext,
  type FeedbackStatus,
} from "@pt/shared";
import { getFeedback, listFeedback, markSeen, parseStatuses, unreadCount, type FeedbackViewer } from "../lib/feedback";
import {
  attachmentBytes,
  checkLayout,
  readImages,
  relayoutTicketImages,
  saveAttachments,
  ticketImages,
} from "../lib/feedback-attachments";
import { API_VERSION } from "../lib/build";
import { notifyFeedback } from "../lib/feedback-notify";
import { closeDuplicates, linkDuplicate, unlinkDuplicate } from "../lib/feedback-duplicates";
import { trainerContext } from "../lib/trainer-context";
import { rateAnswer, recordDraftVerdict, unrateAnswer } from "../lib/feedback-answers";
import { FeedbackModel } from "../models/feedback";
import { spread } from "../utility";

const Loc = t.Object({ file: t.String(), line: t.Number(), column: t.Number() });

const Context = t.Object({
  route: t.Object({
    path: t.String(),
    id: t.Nullable(t.String()),
    params: t.Record(t.String(), t.String()),
  }),
  target: t.Object({
    source: t.Nullable(Loc),
    chain: t.Array(t.Object({ type: t.String(), file: t.String(), line: t.Number(), column: t.Number() })),
    tag: t.String(),
    text: t.String(),
    html: t.String(),
    headings: t.Array(t.String()),
    selector: t.String(),
    anchor: t.Optional(t.Nullable(t.Object({ attr: t.String({ maxLength: 100 }), value: t.String({ maxLength: 200 }), depth: t.Number() }))),
    rect: t.Object({ x: t.Number(), y: t.Number(), width: t.Number(), height: t.Number() }),
  }),
  pageData: t.Unknown(),
  viewport: t.Object({ width: t.Number(), height: t.Number(), dpr: t.Number() }),
  userAgent: t.String(),
  appVersion: t.String(),
});

// Written out (not t.UnionEnum) so Eden keeps the literals; the check keeps them in step with @pt/shared.
const AnswerTag = t.Union([t.Literal("wrong"), t.Literal("missed_question"), t.Literal("unclear"), t.Literal("outdated")]);
true satisfies (typeof FEEDBACK_ANSWER_TAGS)[number] extends Static<typeof AnswerTag> ? true : false;
true satisfies Static<typeof AnswerTag> extends FeedbackAnswerTag ? true : false;
const IdParams = t.Object({ id: t.String({ format: "uuid" }) });
const CommentParams = t.Object({ id: t.String({ format: "uuid" }), cid: t.String({ format: "uuid" }) });
/**
 * Uploaded images, multipart (Eden sends FormData when a field holds a File).
 * Count, size and type are checked by `readImages` so every refusal reads the
 * same way; the schema only caps the count far above the real limit.
 */
const Images = t.Optional(t.Files({ maxItems: 20 }));

/**
 * An edited ticket's images in their new order: `{ keep: id }` for an image
 * it already has, `{ upload: n }` for the nth file in `images`. Images left
 * out are removed. Eden sends an array of objects as one JSON field.
 */
const ImageLayout = t.Array(
  t.Union([t.Object({ keep: t.String({ format: "uuid" }) }), t.Object({ upload: t.Integer({ minimum: 0 }) })]),
  { maxItems: 40 },
);

/**
 * Where each file in `images` came from, in the same order, comma-separated:
 * `element,page,upload`. One string, because multipart sends an array as one
 * field per value and a lone value would arrive bare.
 */
const ImageKinds = t.Optional(t.String({ pattern: `^(${FEEDBACK_ATTACHMENT_KINDS.join("|")})(,(${FEEDBACK_ATTACHMENT_KINDS.join("|")}))*$`, maxLength: 200 }));

const OPEN_STATUSES: readonly FeedbackStatus[] = ["new", "accepted"];

const IMAGE_CACHE = "private, max-age=31536000, immutable";

const ADMIN_ONLY = { error: "admin only" } as const;
const NOT_FOUND = { error: "feedback not found" } as const;

/**
 * Trainers file feedback and see only their own items; the platform admin
 * sees every item and is the only one who triages, deletes and exports.
 */
export const feedbackRoutes = new Elysia({ prefix: "/v1/feedback", tags: ["feedback"] })
  .use(trainerContext)
  .resolve(({ trainerId, isAdmin }) => ({
    /** Query scope: the admin sees everything, a trainer their own items. */
    who: { ownerId: isAdmin ? null : trainerId, viewerId: trainerId } satisfies FeedbackViewer,
  }))
  /** List items (no image bytes). `?status=new,accepted` filters. */
  .get("/", async ({ query, who }) => listFeedback(parseStatuses(query.status), "newest", who), {
    query: t.Object({ status: t.Optional(t.String()) }),
    detail: { summary: "List feedback items" },
  })
  /** Sidebar badge: visible items with news from someone else since you last looked. */
  .get("/unread", async ({ who }) => ({ count: await unreadCount(who) }), {
    detail: { summary: "Count unread feedback items" },
  })
  /**
   * Agent-facing export. Markdown by default — self-contained items with
   * absolute screenshot URLs. Defaults to `accepted`: the owner's go-list.
   */
  .get(
    "/export",
    async ({ query, request, isAdmin, status }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      const statuses = query.status === "all" ? null : (parseStatuses(query.status ?? "accepted") ?? []);
      const items = await listFeedback(statuses, "oldest");
      if (query.format === "json") return items;
      const origin = new URL(request.url).origin;
      const md = feedbackMarkdown(items, {
        title: `Trainer feedback (${statuses ? statuses.join(", ") : "all"})`,
        imageUrl: (item, a) => `${origin}/v1/feedback/${item.id}/attachments/${a.id}`,
      });
      return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8" } });
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        format: t.Optional(t.UnionEnum(["md", "json"])),
      }),
      detail: { summary: "Export feedback for a coding agent (Markdown or JSON)" },
    },
  )
  /**
   * File a ticket. Multipart when it carries images: the captured element and
   * page screenshots plus up to FEEDBACK_MAX_IMAGES uploads, all in `images`,
   * with `kinds` naming each one.
   */
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const { kinds, ...files } = body;
      const read = await readImages({ ...files, kinds: kinds?.split(",") as FeedbackAttachmentKind[] | undefined });
      if ("error" in read) return status(422, { error: read.error });
      const context = body.context as FeedbackContext;
      const row = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(feedbackItems)
          .values({
            trainerId,
            comment: body.comment.trim(),
            route: context.route.path,
            source: context.target.source ? formatSourceLoc(context.target.source) : null,
            context,
          })
          .returning({ id: feedbackItems.id, number: feedbackItems.number });
        await saveAttachments(tx, row.id, null, read.images);
        return row;
      });
      notifyFeedback({ kind: "created", itemId: row.id });
      return { id: row.id, number: row.number, handle: feedbackHandle(row.number) };
    },
    {
      body: t.Object({
        comment: FeedbackModel.comment,
        context: Context,
        images: Images,
        kinds: ImageKinds,
      }),
      detail: { summary: "Submit a feedback item" },
    },
  )
  .get(
    "/:id",
    async ({ params, status, who }) => (await getFeedback(params.id, who)) ?? status(404, NOT_FOUND),
    { params: IdParams, detail: { summary: "Get one feedback item" } },
  )
  /**
   * Triage: the admin sets status and/or a note. A status change also lands
   * in the thread; done stamps the live version, leaving done clears it.
   * Won't fix may carry a reason for the reporter: it posts as a public reply
   * just before the status entry, and the one Won't-fix email quotes it.
   */
  .patch(
    "/:id",
    async ({ params, body, status, isAdmin, trainerId, who }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      const { reason: rawReason, ...patch } = body;
      if (rawReason !== undefined && patch.status !== "wontfix") {
        return status(422, { error: "a reason goes only with Won't fix" });
      }
      const reason = rawReason?.trim() || null;
      const found = await db.transaction(async (tx) => {
        const [prev] = await tx
          .select({ status: feedbackItems.status })
          .from(feedbackItems)
          .where(eq(feedbackItems.id, params.id))
          .for("update");
        if (!prev) return null;
        const moved = patch.status !== undefined && patch.status !== prev.status;
        if (reason && !moved) return { fail: "already" } as const;
        await tx
          .update(feedbackItems)
          .set({
            ...patch,
            ...(moved ? { shippedIn: patch.status === "done" ? API_VERSION : null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(feedbackItems.id, params.id));
        if (!moved) return { statusCommentId: null, reasonId: null, duplicates: [] };
        // Explicit times: both rows would otherwise share the transaction's now().
        const at = Date.now();
        const [why] = reason
          ? await tx
              .insert(feedbackComments)
              .values({ itemId: params.id, trainerId, kind: "reply", body: reason, createdAt: new Date(at) })
              .returning({ id: feedbackComments.id })
          : [];
        const [entry] = await tx
          .insert(feedbackComments)
          .values({
            itemId: params.id,
            trainerId,
            kind: "status",
            status: patch.status,
            ...(why ? { createdAt: new Date(at + 1) } : {}),
          })
          .returning({ id: feedbackComments.id });
        // Closing an original closes the open tickets that repeat it, the same way.
        const duplicates =
          patch.status === "done" || patch.status === "wontfix"
            ? await closeDuplicates(tx, params.id, {
                status: patch.status,
                shippedIn: patch.status === "done" ? API_VERSION : null,
                trainerId,
                authorKind: "human",
                reason,
                at: at + 2,
              })
            : [];
        return { statusCommentId: entry.id, reasonId: why?.id ?? null, duplicates };
      });
      if (!found) return status(404, NOT_FOUND);
      if ("fail" in found) return status(409, { error: "Already Won't fix — reply on the thread instead." });
      // One email: the status one, quoting the reason. The reason reply sends none of its own.
      if (found.statusCommentId) {
        notifyFeedback({ kind: "status", itemId: params.id, commentId: found.statusCommentId, reasonId: found.reasonId });
      }
      for (const d of found.duplicates) {
        notifyFeedback({ kind: "status", itemId: d.itemId, commentId: d.statusId, reasonId: d.reasonId });
      }
      await markSeen(trainerId, params.id);
      return (await getFeedback(params.id, who))!;
    },
    {
      params: IdParams,
      body: t.Object({
        ...spread(FeedbackModel.triage),
        /** Won't fix only: shown to the reporter as a reply and quoted in the email. */
        reason: t.Optional(t.String({ maxLength: 5000 })),
      }),
      detail: { summary: "Triage a feedback item" },
    },
  )
  /**
   * Edit an open ticket's comment and its own images (remove any, add
   * uploads, reorder) — its reporter or the admin. `version` is the ticket's
   * `editedAt` (or `createdAt` if never edited) when the editor opened it; a
   * different one means someone else edited it meanwhile: 409, nothing saved.
   * Counts as news for the other side, but sends no email.
   */
  .patch(
    "/:id/content",
    async ({ params, body, status, isAdmin, trainerId, who }) => {
      const comment = body.comment.trim();
      if (!comment) return status(422, { error: "comment is empty" });
      const read = await readImages({ images: body.images });
      if ("error" in read) return status(422, { error: read.error });
      const out = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            trainerId: feedbackItems.trainerId,
            status: feedbackItems.status,
            comment: feedbackItems.comment,
            editedAt: feedbackItems.editedAt,
            createdAt: feedbackItems.createdAt,
          })
          .from(feedbackItems)
          .where(eq(feedbackItems.id, params.id))
          .for("update");
        // Same rule as reading it: a trainer may only touch their own tickets.
        if (!row || (!isAdmin && row.trainerId !== trainerId)) return { fail: 404 } as const;
        if (!OPEN_STATUSES.includes(row.status)) return { fail: "closed" } as const;
        if (body.version !== (row.editedAt ?? row.createdAt).toISOString()) return { fail: "stale" } as const;
        const current = await ticketImages(tx, params.id);
        const invalid = checkLayout(current, body.layout, read.images.length);
        if (invalid) return { invalid: invalid.error };
        const same =
          comment === row.comment &&
          body.layout.length === current.length &&
          body.layout.every((slot, i) => "keep" in slot && slot.keep === current[i].id);
        if (same) return { saved: false };
        await relayoutTicketImages(tx, params.id, body.layout, read.images);
        const now = new Date();
        await tx
          .update(feedbackItems)
          .set({ comment, editedAt: now, editedBy: trainerId, updatedAt: now })
          .where(eq(feedbackItems.id, params.id));
        return { saved: true };
      });
      if ("fail" in out) {
        if (out.fail === 404) return status(404, NOT_FOUND);
        if (out.fail === "closed") return status(409, { error: "This ticket is closed, so it can't be edited." });
        return status(409, { error: "Someone else edited this ticket while you were editing it." });
      }
      if ("invalid" in out) return status(422, { error: out.invalid });
      // No email for an edit; the unread dot tells the other side.
      if (out.saved) await markSeen(trainerId, params.id);
      return (await getFeedback(params.id, who))!;
    },
    {
      params: IdParams,
      body: t.Object({
        comment: FeedbackModel.comment,
        version: t.String({ minLength: 1, maxLength: 64 }),
        layout: ImageLayout,
        images: Images,
      }),
      detail: { summary: "Edit a ticket's comment and images (reporter or admin)" },
    },
  )
  /** Reply on an item's thread — its reporter or the admin — with up to FEEDBACK_MAX_IMAGES images. */
  .post(
    "/:id/comments",
    async ({ params, body, status, trainerId, who }) => {
      if (!(await getFeedback(params.id, who))) return status(404, NOT_FOUND);
      const text = body.body.trim();
      const read = await readImages({ images: body.images });
      if ("error" in read) return status(422, { error: read.error });
      if (!text && read.images.length === 0) return status(422, { error: "reply is empty" });
      const row = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(feedbackComments)
          .values({ itemId: params.id, trainerId, kind: "reply", body: text })
          .returning({ id: feedbackComments.id });
        await saveAttachments(tx, params.id, row.id, read.images);
        return row;
      });
      notifyFeedback({ kind: "reply", itemId: params.id, commentId: row.id });
      await markSeen(trainerId, params.id);
      const item = (await getFeedback(params.id, who))!;
      return status(201, item.thread.find((c) => c.id === row.id)!);
    },
    {
      params: IdParams,
      // Text, images or both; empty text is fine when images come with it.
      body: t.Object({ body: FeedbackModel.replyBody, images: Images }),
      detail: { summary: "Reply on a feedback item" },
    },
  )
  /**
   * Admin: send an AI draft reply, optionally edited first. It moves to the
   * end of the thread (sent now) and notifies like any reply.
   */
  .post(
    "/:id/comments/:cid/publish",
    async ({ params, body, status, isAdmin, trainerId, who }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      const text = body.body?.trim();
      if (body.body !== undefined && !text) return status(422, { error: "reply is empty" });
      const [before] = await db
        .select({ body: feedbackComments.body, authorKind: feedbackComments.authorKind })
        .from(feedbackComments)
        .where(and(eq(feedbackComments.id, params.cid), eq(feedbackComments.itemId, params.id)));
      const [row] = await db
        .update(feedbackComments)
        .set({ visibility: "public", createdAt: new Date(), ...(text ? { body: text } : {}) })
        .where(
          and(
            eq(feedbackComments.id, params.cid),
            eq(feedbackComments.itemId, params.id),
            eq(feedbackComments.visibility, "draft"),
          ),
        )
        .returning({ id: feedbackComments.id });
      if (!row) return status(404, { error: "draft not found" });
      if (before?.authorKind === "ai") {
        const edited = text !== undefined && text !== before.body?.trim();
        await recordDraftVerdict({
          trainerId,
          commentId: row.id,
          signal: edited ? "draft_approved_edited" : "draft_approved_unedited",
          original: before.body,
          sent: edited ? text : null,
        });
      }
      notifyFeedback({ kind: "reply", itemId: params.id, commentId: row.id, by: trainerId });
      await markSeen(trainerId, params.id);
      return (await getFeedback(params.id, who))!;
    },
    {
      params: CommentParams,
      body: t.Object({ body: t.Optional(FeedbackModel.replyBody) }),
      detail: { summary: "Send an AI draft reply (optionally edited)" },
    },
  )
  /** Admin: discard an AI draft or private note. Sent replies stay. */
  .delete(
    "/:id/comments/:cid",
    async ({ params, status, isAdmin, trainerId, who }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      const [row] = await db
        .delete(feedbackComments)
        .where(
          and(
            eq(feedbackComments.id, params.cid),
            eq(feedbackComments.itemId, params.id),
            ne(feedbackComments.visibility, "public"),
          ),
        )
        .returning({ id: feedbackComments.id, visibility: feedbackComments.visibility, authorKind: feedbackComments.authorKind });
      if (!row) return status(404, { error: "draft not found" });
      if (row.authorKind === "ai" && row.visibility === "draft") {
        await recordDraftVerdict({ trainerId, commentId: row.id, signal: "draft_rejected" });
      }
      return (await getFeedback(params.id, who))!;
    },
    { params: CommentParams, detail: { summary: "Discard an AI draft or private note" } },
  )
  /**
   * The reporter rates a sent AI answer: 👍 (score 1) or 👎 (score -1, with
   * optional quick tags and a comment). A second rating replaces the first.
   * Only the ticket's reporter may rate, and only sent AI answers. A 👎 on
   * the latest answer sends the ticket back to the agent once; its new answer
   * waits as a draft for the admin (lib/feedback-ai).
   */
  .put(
    "/:id/comments/:cid/rating",
    async ({ params, body, status, trainerId, who }) => {
      const item = await getFeedback(params.id, who);
      if (!item) return status(404, NOT_FOUND);
      const answer = item.thread.find((c) => c.id === params.cid);
      if (!answer?.aiPublic) return status(404, { error: "AI answer not found" });
      if (!answer.aiPublic.canRate) return status(403, { error: "only the reporter can rate this answer" });
      await rateAnswer({ trainerId, commentId: answer.id, score: body.score, tags: body.tags, comment: body.comment });
      return (await getFeedback(params.id, who))!;
    },
    {
      params: CommentParams,
      body: t.Object({
        score: t.Union([t.Literal(1), t.Literal(-1)]),
        tags: t.Optional(t.Array(AnswerTag, { maxItems: FEEDBACK_ANSWER_TAGS.length })),
        comment: t.Optional(t.String({ maxLength: FEEDBACK_ANSWER_COMMENT_MAX })),
      }),
      detail: { summary: "Rate an AI answer 👍/👎 (the ticket's reporter only)" },
    },
  )
  /** The reporter removes their rating. A 👎 that already re-ran the agent stays run. */
  .delete(
    "/:id/comments/:cid/rating",
    async ({ params, status, who }) => {
      const item = await getFeedback(params.id, who);
      if (!item) return status(404, NOT_FOUND);
      const answer = item.thread.find((c) => c.id === params.cid);
      if (!answer?.aiPublic) return status(404, { error: "AI answer not found" });
      if (!answer.aiPublic.canRate) return status(403, { error: "only the reporter can rate this answer" });
      await unrateAnswer(answer.id);
      return (await getFeedback(params.id, who))!;
    },
    { params: CommentParams, detail: { summary: "Remove the rating on an AI answer (the ticket's reporter only)" } },
  )
  /**
   * Admin: mark the ticket a duplicate of open ticket number `of`, or unlink
   * it (`of: null`). It closes when that ticket does (lib/feedback-duplicates).
   */
  .put(
    "/:id/duplicate",
    async ({ params, body, status, isAdmin, who }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      if (body.of === null) {
        if (!(await unlinkDuplicate(params.id))) return status(404, NOT_FOUND);
      } else {
        const out = await linkDuplicate(params.id, body.of);
        if (!out.ok) return status(out.status, { error: out.error });
      }
      return (await getFeedback(params.id, who))!;
    },
    {
      params: IdParams,
      body: t.Object({ of: t.Nullable(t.Integer({ minimum: 1, maximum: 999_999_999 })) }),
      detail: { summary: "Mark a ticket a duplicate of another open one, or unlink it" },
    },
  )
  /** The caller has looked at this item: clears it from their unread count. */
  .post(
    "/:id/seen",
    async ({ params, status, trainerId, who }) => {
      if (!(await getFeedback(params.id, who))) return status(404, NOT_FOUND);
      await markSeen(trainerId, params.id);
      return { ok: true };
    },
    { params: IdParams, detail: { summary: "Mark a feedback item seen" } },
  )
  /** Stop emails about one item, for the caller only. Unread dots still work. */
  .put(
    "/:id/mute",
    async ({ params, status, trainerId, who }) => {
      if (!(await getFeedback(params.id, who))) return status(404, NOT_FOUND);
      await db.insert(feedbackMutes).values({ trainerId, itemId: params.id }).onConflictDoNothing();
      return { muted: true };
    },
    { params: IdParams, detail: { summary: "Mute emails about a feedback item" } },
  )
  .delete(
    "/:id/mute",
    async ({ params, status, trainerId, who }) => {
      if (!(await getFeedback(params.id, who))) return status(404, NOT_FOUND);
      await db
        .delete(feedbackMutes)
        .where(and(eq(feedbackMutes.trainerId, trainerId), eq(feedbackMutes.itemId, params.id)));
      return { muted: false };
    },
    { params: IdParams, detail: { summary: "Unmute emails about a feedback item" } },
  )
  .delete(
    "/:id",
    async ({ params, status, isAdmin }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      const [row] = await db
        .delete(feedbackItems)
        .where(eq(feedbackItems.id, params.id))
        .returning({ id: feedbackItems.id });
      return row ? { ok: true } : status(404, NOT_FOUND);
    },
    { params: IdParams, detail: { summary: "Delete a feedback item" } },
  )
  /**
   * One image, visible exactly when what it's on is: the ticket for its
   * reporter and the admin; a draft's or private note's only for the admin.
   */
  .get(
    "/:id/attachments/:attachmentId",
    async ({ params, status, who }) => {
      const item = await getFeedback(params.id, who);
      const row = item ? await attachmentBytes(params.id, params.attachmentId) : null;
      // `thread` already holds only the entries this viewer may see.
      if (!row || (row.commentId && !item!.thread.some((c) => c.id === row.commentId))) {
        return status(404, { error: "image not found" });
      }
      return new Response(new Uint8Array(row.bytes), {
        headers: { "content-type": row.mime, "cache-control": IMAGE_CACHE },
      });
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), attachmentId: t.String({ format: "uuid" }) }),
      detail: { summary: "Image bytes for a feedback item or reply" },
    },
  );

