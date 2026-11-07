import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, feedbackItems, trainers, type FeedbackItemRow } from "@pt/db";
import { FEEDBACK_STATUSES, type FeedbackItem, type FeedbackStatus } from "@pt/shared";

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
  route: feedbackItems.route,
  source: feedbackItems.source,
  context: feedbackItems.context,
  createdAt: feedbackItems.createdAt,
  updatedAt: feedbackItems.updatedAt,
  hasElementShot: sql<boolean>`${feedbackItems.elementShot} is not null`,
  hasPageShot: sql<boolean>`${feedbackItems.pageShot} is not null`,
};

type ListRow = Omit<FeedbackItemRow, "elementShot" | "pageShot" | "trainerId"> & {
  author: FeedbackItem["author"];
  hasElementShot: boolean;
  hasPageShot: boolean;
};

export const toFeedbackItem = (r: ListRow): FeedbackItem => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

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
 * Who may see what: the admin sees everything (`ownerId` null), a trainer
 * only the items they filed.
 */
const visibleTo = (ownerId: string | null): SQL | undefined =>
  ownerId ? eq(feedbackItems.trainerId, ownerId) : undefined;

const selectItems = () =>
  db.select(listColumns).from(feedbackItems).leftJoin(trainers, eq(trainers.id, feedbackItems.trainerId));

/** Items newest first (review UI) or oldest first (export reads like a queue). */
export async function listFeedback(
  statuses: FeedbackStatus[] | null,
  order: "newest" | "oldest" = "newest",
  ownerId: string | null = null,
): Promise<FeedbackItem[]> {
  const rows = await selectItems()
    .where(and(statuses ? inArray(feedbackItems.status, statuses) : undefined, visibleTo(ownerId)))
    .orderBy(order === "newest" ? desc(feedbackItems.number) : asc(feedbackItems.number));
  return rows.map(toFeedbackItem);
}

/** One item, or null when it does not exist or `ownerId` may not see it. */
export async function getFeedback(id: string, ownerId: string | null = null): Promise<FeedbackItem | null> {
  const [row] = await selectItems().where(and(eq(feedbackItems.id, id), visibleTo(ownerId)));
  return row ? toFeedbackItem(row) : null;
}
