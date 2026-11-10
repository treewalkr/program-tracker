import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, feedbackComments, feedbackItems, feedbackMutes, feedbackReads, trainers, type FeedbackItemRow } from "@pt/db";
import { agentCheckBasis, FEEDBACK_STATUSES, type FeedbackComment, type FeedbackItem, type FeedbackStatus } from "@pt/shared";

/** Screenshot cap per image, decoded. Keeps a runaway capture out of the DB. */
export const MAX_SHOT_BYTES = 4 * 1024 * 1024;

/** Every column except the image blobs, plus has-shot flags and the author. */
const listColumns = {
  id: feedbackItems.id,
  number: feedbackItems.number,
  author: { id: trainers.id, name: trainers.name, avatarUrl: trainers.avatarUrl },
  status: feedbackItems.status,
  comment: feedbackItems.comment,
  triageNote: feedbackItems.triageNote,
  trainerId: feedbackItems.trainerId,
  route: feedbackItems.route,
  source: feedbackItems.source,
  context: feedbackItems.context,
  shippedIn: feedbackItems.shippedIn,
  agentCheck: feedbackItems.agentCheck,
  createdAt: feedbackItems.createdAt,
  updatedAt: feedbackItems.updatedAt,
  hasElementShot: sql<boolean>`${feedbackItems.elementShot} is not null`,
  hasPageShot: sql<boolean>`${feedbackItems.pageShot} is not null`,
};

type ListRow = Omit<FeedbackItemRow, "elementShot" | "pageShot"> & {
  author: FeedbackItem["author"];
  hasElementShot: boolean;
  hasPageShot: boolean;
};

const authorColumns = { id: trainers.id, name: trainers.name, avatarUrl: trainers.avatarUrl };

/**
 * Rows → API items: attaches each thread (one query) and, for a viewer, the
 * unread and muted flags (two more). Unread = someone other than the viewer filed it,
 * replied or changed its status after the viewer last looked. Only the admin
 * gets AI drafts and private notes (which then count as news for them too).
 */
async function hydrate(rows: ListRow[], viewerId: string | null, admin: boolean): Promise<FeedbackItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const comments = await db
    .select({
      id: feedbackComments.id,
      itemId: feedbackComments.itemId,
      trainerId: feedbackComments.trainerId,
      kind: feedbackComments.kind,
      body: feedbackComments.body,
      status: feedbackComments.status,
      authorKind: feedbackComments.authorKind,
      visibility: feedbackComments.visibility,
      aiMeta: feedbackComments.aiMeta,
      createdAt: feedbackComments.createdAt,
      author: authorColumns,
    })
    .from(feedbackComments)
    .leftJoin(trainers, eq(trainers.id, feedbackComments.trainerId))
    // Security boundary: AI drafts and private notes never leave the server for a non-admin.
    .where(and(inArray(feedbackComments.itemId, ids), admin ? undefined : eq(feedbackComments.visibility, "public")))
    .orderBy(asc(feedbackComments.createdAt));
  const seen = new Map<string, Date>();
  if (viewerId) {
    const reads = await db
      .select({ itemId: feedbackReads.itemId, seenAt: feedbackReads.seenAt })
      .from(feedbackReads)
      .where(and(eq(feedbackReads.trainerId, viewerId), inArray(feedbackReads.itemId, ids)));
    for (const r of reads) seen.set(r.itemId, r.seenAt);
  }
  const muted = new Set<string>();
  if (viewerId) {
    const mutes = await db
      .select({ itemId: feedbackMutes.itemId })
      .from(feedbackMutes)
      .where(and(eq(feedbackMutes.trainerId, viewerId), inArray(feedbackMutes.itemId, ids)));
    for (const m of mutes) muted.add(m.itemId);
  }

  return rows.map(({ trainerId, agentCheck, ...r }) => {
    const mine = comments.filter((c) => c.itemId === r.id);
    let last: Date | null = trainerId !== viewerId ? r.createdAt : null;
    for (const c of mine) if (c.trainerId !== viewerId && (!last || c.createdAt > last)) last = c.createdAt;
    const seenAt = seen.get(r.id);
    const thread = mine.map(
      (c): FeedbackComment => ({
        id: c.id,
        kind: c.kind,
        author: c.author,
        authorKind: c.authorKind,
        visibility: c.visibility,
        aiMeta: admin ? c.aiMeta : null,
        body: c.body,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      }),
    );
    return {
      ...r,
      thread,
      agentCheck:
        admin && agentCheck
          ? { ...agentCheck, stale: agentCheck.basis !== agentCheckBasis({ comment: r.comment, triageNote: r.triageNote, thread }) }
          : null,
      unread: viewerId !== null && last !== null && (!seenAt || last > seenAt),
      muted: muted.has(r.id),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/**
 * `data:image/png;base64,…` (or bare base64) → bytes. Null when absent;
 * throws on a non-image data URL or an oversized image.
 */
export function decodeShot(input: string | undefined | null): Buffer | null {
  if (!input) return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s.exec(input);
  if (input.startsWith("data:") && !m) throw new Error("screenshot must be a png, jpeg or webp data URL");
  const buf = Buffer.from(m ? m[2] : input, "base64");
  if (buf.byteLength > MAX_SHOT_BYTES) throw new Error("screenshot too large");
  return buf;
}

/** Magic-number sniff so the image route serves the right content type. */
export function shotMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF") return "image/webp";
  return "application/octet-stream";
}

export const shotExt = (buf: Buffer) => shotMime(buf).split("/")[1].replace("jpeg", "jpg");

export function parseStatuses(raw: string | undefined): FeedbackStatus[] | null {
  if (!raw) return null;
  const wanted = raw.split(",").map((s) => s.trim());
  return FEEDBACK_STATUSES.filter((s) => wanted.includes(s));
}

/**
 * Who is asking. `ownerId` scopes what they may see (null = everything, the
 * admin); `viewerId` is whose unread state to compute (null = none, e.g. export).
 */
export interface FeedbackViewer {
  ownerId: string | null;
  viewerId: string | null;
}
const EVERYTHING: FeedbackViewer = { ownerId: null, viewerId: null };

const visibleTo = (ownerId: string | null): SQL | undefined =>
  ownerId ? eq(feedbackItems.trainerId, ownerId) : undefined;

const selectItems = () =>
  db.select(listColumns).from(feedbackItems).leftJoin(trainers, eq(trainers.id, feedbackItems.trainerId));

/** Items newest first (review UI) or oldest first (export reads like a queue). */
export async function listFeedback(
  statuses: FeedbackStatus[] | null,
  order: "newest" | "oldest" = "newest",
  who: FeedbackViewer = EVERYTHING,
): Promise<FeedbackItem[]> {
  const rows = await selectItems()
    .where(and(statuses ? inArray(feedbackItems.status, statuses) : undefined, visibleTo(who.ownerId)))
    .orderBy(order === "newest" ? desc(feedbackItems.number) : asc(feedbackItems.number));
  return hydrate(rows, who.viewerId, who.ownerId === null);
}

/** One item, or null when it does not exist or `who` may not see it. */
export async function getFeedback(id: string, who: FeedbackViewer = EVERYTHING): Promise<FeedbackItem | null> {
  const [row] = await selectItems().where(and(eq(feedbackItems.id, id), visibleTo(who.ownerId)));
  return row ? ((await hydrate([row], who.viewerId, who.ownerId === null))[0] ?? null) : null;
}

/** How many visible items are unread for the viewer — the sidebar badge. */
export async function unreadCount(who: FeedbackViewer): Promise<number> {
  return (await listFeedback(null, "newest", who)).filter((i) => i.unread).length;
}

/** Marks an item seen by `trainerId` now. */
export async function markSeen(trainerId: string, itemId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(feedbackReads)
    .values({ trainerId, itemId, seenAt: now })
    .onConflictDoUpdate({ target: [feedbackReads.trainerId, feedbackReads.itemId], set: { seenAt: now } });
}
