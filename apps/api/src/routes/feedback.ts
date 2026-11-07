import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, feedbackItems } from "@pt/db";
import {
  FEEDBACK_STATUSES,
  feedbackHandle,
  feedbackMarkdown,
  formatSourceLoc,
  type FeedbackContext,
} from "@pt/shared";
import { decodeShot, getFeedback, listFeedback, parseStatuses, shotMime } from "../lib/feedback";

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
    selector: t.String(),
    rect: t.Object({ x: t.Number(), y: t.Number(), width: t.Number(), height: t.Number() }),
  }),
  pageData: t.Unknown(),
  viewport: t.Object({ width: t.Number(), height: t.Number(), dpr: t.Number() }),
  userAgent: t.String(),
  appVersion: t.String(),
});

const Status = t.UnionEnum(FEEDBACK_STATUSES);
const IdParams = t.Object({ id: t.String({ format: "uuid" }) });

export const feedbackRoutes = new Elysia({ prefix: "/v1/feedback", tags: ["feedback"] })
  /** List items (no image bytes). `?status=new,accepted` filters. */
  .get("/", async ({ query }) => listFeedback(parseStatuses(query.status)), {
    query: t.Object({ status: t.Optional(t.String()) }),
    detail: { summary: "List feedback items" },
  })
  /**
   * Agent-facing export. Markdown by default — self-contained items with
   * absolute screenshot URLs. Defaults to `accepted`: the owner's go-list.
   */
  .get(
    "/export",
    async ({ query, request }) => {
      const statuses = query.status === "all" ? null : (parseStatuses(query.status ?? "accepted") ?? []);
      const items = await listFeedback(statuses, "oldest");
      if (query.format === "json") return items;
      const origin = new URL(request.url).origin;
      const md = feedbackMarkdown(items, {
        title: `Trainer feedback (${statuses ? statuses.join(", ") : "all"})`,
        imageUrl: (item, kind) =>
          (kind === "element" ? item.hasElementShot : item.hasPageShot)
            ? `${origin}/v1/feedback/${item.id}/shot/${kind}`
            : null,
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
  .post(
    "/",
    async ({ body, status }) => {
      let elementShot: Buffer | null;
      let pageShot: Buffer | null;
      try {
        elementShot = decodeShot(body.elementShot);
        pageShot = decodeShot(body.pageShot);
      } catch (err) {
        return status(422, { error: (err as Error).message });
      }
      const context = body.context as FeedbackContext;
      const [row] = await db
        .insert(feedbackItems)
        .values({
          comment: body.comment.trim(),
          route: context.route.path,
          source: context.target.source ? formatSourceLoc(context.target.source) : null,
          context,
          elementShot,
          pageShot,
        })
        .returning({ id: feedbackItems.id, number: feedbackItems.number });
      return { id: row.id, number: row.number, handle: feedbackHandle(row.number) };
    },
    {
      body: t.Object({
        comment: t.String({ minLength: 1, maxLength: 5000 }),
        context: Context,
        elementShot: t.Optional(t.String()),
        pageShot: t.Optional(t.String()),
      }),
      detail: { summary: "Submit a feedback item" },
    },
  )
  .get(
    "/:id",
    async ({ params, status }) => (await getFeedback(params.id)) ?? status(404, { error: "feedback not found" }),
    { params: IdParams, detail: { summary: "Get one feedback item" } },
  )
  /** Triage: owner sets status and/or a note. */
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const [row] = await db
        .update(feedbackItems)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(feedbackItems.id, params.id))
        .returning({ id: feedbackItems.id });
      if (!row) return status(404, { error: "feedback not found" });
      return (await getFeedback(row.id))!;
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
  .delete(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db
        .delete(feedbackItems)
        .where(eq(feedbackItems.id, params.id))
        .returning({ id: feedbackItems.id });
      return row ? { ok: true } : status(404, { error: "feedback not found" });
    },
    { params: IdParams, detail: { summary: "Delete a feedback item" } },
  )
  .get(
    "/:id/shot/:kind",
    async ({ params, status }) => {
      const col = params.kind === "element" ? feedbackItems.elementShot : feedbackItems.pageShot;
      const [row] = await db.select({ shot: col }).from(feedbackItems).where(eq(feedbackItems.id, params.id));
      if (!row?.shot) return status(404, { error: "screenshot not found" });
      return new Response(new Uint8Array(row.shot), {
        headers: { "content-type": shotMime(row.shot), "cache-control": "private, max-age=31536000, immutable" },
      });
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), kind: t.UnionEnum(["element", "page"]) }),
      detail: { summary: "Screenshot bytes for a feedback item" },
    },
  );
