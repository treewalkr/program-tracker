import { Elysia, t, type Static } from "elysia";
import { and, eq, ne } from "drizzle-orm";
import { db, feedbackComments, feedbackItems, feedbackMutes } from "@pt/db";
import {
  FEEDBACK_STATUSES,
  feedbackHandle,
  feedbackMarkdown,
  formatSourceLoc,
  type FeedbackContext,
} from "@pt/shared";
import { getFeedback, listFeedback, markSeen, parseStatuses, unreadCount, type FeedbackViewer } from "../lib/feedback";
import { attachmentBytes, readImages, saveAttachments, ticketShot } from "../lib/feedback-attachments";
import { API_VERSION } from "../lib/build";
import { notifyFeedback } from "../lib/feedback-notify";
import { trainerContext } from "../lib/trainer-context";

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

// Literal union, not t.UnionEnum: UnionEnum carries a default (its first
// value), so an absent optional status would arrive as "new" and a note-only
// PATCH would silently reopen the item.
const Status = t.Union([t.Literal("new"), t.Literal("accepted"), t.Literal("done"), t.Literal("wontfix")]);
// Keeps the literal list in step with FEEDBACK_STATUSES.
true satisfies (typeof FEEDBACK_STATUSES)[number] extends Static<typeof Status> ? true : false;
const IdParams = t.Object({ id: t.String({ format: "uuid" }) });
const CommentParams = t.Object({ id: t.String({ format: "uuid" }), cid: t.String({ format: "uuid" }) });
/**
 * Uploaded images, multipart (Eden sends FormData when a field holds a File).
 * Count, size and type are checked by `readImages` so every refusal reads the
 * same way; the schema only caps the count far above the real limit.
 */
const Images = t.Optional(t.Files({ maxItems: 20 }));

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
   * page screenshots, plus up to FEEDBACK_MAX_IMAGES uploads.
   */
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const read = await readImages(body);
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
        comment: t.String({ minLength: 1, maxLength: 5000 }),
        context: Context,
        elementShot: t.Optional(t.File()),
        pageShot: t.Optional(t.File()),
        images: Images,
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
   */
  .patch(
    "/:id",
    async ({ params, body, status, isAdmin, trainerId, who }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      const found = await db.transaction(async (tx) => {
        const [prev] = await tx
          .select({ status: feedbackItems.status })
          .from(feedbackItems)
          .where(eq(feedbackItems.id, params.id))
          .for("update");
        if (!prev) return null;
        const moved = body.status !== undefined && body.status !== prev.status;
        await tx
          .update(feedbackItems)
          .set({
            ...body,
            ...(moved ? { shippedIn: body.status === "done" ? API_VERSION : null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(feedbackItems.id, params.id));
        if (!moved) return { statusCommentId: null };
        const [entry] = await tx
          .insert(feedbackComments)
          .values({ itemId: params.id, trainerId, kind: "status", status: body.status })
          .returning({ id: feedbackComments.id });
        return { statusCommentId: entry.id };
      });
      if (!found) return status(404, NOT_FOUND);
      if (found.statusCommentId) notifyFeedback({ kind: "status", itemId: params.id, commentId: found.statusCommentId });
      await markSeen(trainerId, params.id);
      return (await getFeedback(params.id, who))!;
    },
    {
      params: IdParams,
      body: t.Object({
        status: t.Optional(Status),
        triageNote: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
      }),
      detail: { summary: "Triage a feedback item" },
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
      body: t.Object({ body: t.String({ maxLength: 5000 }), images: Images }),
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
      notifyFeedback({ kind: "reply", itemId: params.id, commentId: row.id, by: trainerId });
      await markSeen(trainerId, params.id);
      return (await getFeedback(params.id, who))!;
    },
    {
      params: CommentParams,
      body: t.Object({ body: t.Optional(t.String({ maxLength: 5000 })) }),
      detail: { summary: "Send an AI draft reply (optionally edited)" },
    },
  )
  /** Admin: discard an AI draft or private note. Sent replies stay. */
  .delete(
    "/:id/comments/:cid",
    async ({ params, status, isAdmin, who }) => {
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
        .returning({ id: feedbackComments.id });
      if (!row) return status(404, { error: "draft not found" });
      return (await getFeedback(params.id, who))!;
    },
    { params: CommentParams, detail: { summary: "Discard an AI draft or private note" } },
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
  )
  /** Old screenshot URLs (pre-attachments export links): the ticket's captured element or page image. */
  .get(
    "/:id/shot/:kind",
    async ({ params, status, who }) => {
      if (!(await getFeedback(params.id, who))) return status(404, { error: "screenshot not found" });
      const shot = await ticketShot(params.id, params.kind);
      if (!shot) return status(404, { error: "screenshot not found" });
      return new Response(new Uint8Array(shot.bytes), {
        headers: { "content-type": shot.mime, "cache-control": IMAGE_CACHE },
      });
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), kind: t.UnionEnum(["element", "page"]) }),
      detail: { summary: "Screenshot bytes for a feedback item (compatibility alias)" },
    },
  );
