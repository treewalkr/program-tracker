import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db, feedbackAttachments } from "@pt/db";
import {
  FEEDBACK_IMAGE_MIMES,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  type FeedbackAttachment,
  type FeedbackAttachmentKind,
  type FeedbackImageMime,
} from "@pt/shared";

/** What the bytes say they are: type from the magic number, size from the header. */
export interface ImageInfo {
  mime: FeedbackImageMime;
  width: number | null;
  height: number | null;
}

/** PNG, JPEG or WebP by content (never the client's claimed type), else null. */
export function imageInfo(buf: Uint8Array): ImageInfo | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    return { mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ...jpegSize(b) };
  }
  if (b.length >= 16 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    return { mime: "image/webp", ...webpSize(b) };
  }
  return null;
}

const NO_SIZE = { width: null, height: null };

/** Walks JPEG segments to the first start-of-frame marker. */
function jpegSize(b: Buffer): Pick<ImageInfo, "width" | "height"> {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return NO_SIZE;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    // SOF0..SOF15, minus DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return NO_SIZE;
}

function webpSize(b: Buffer): Pick<ImageInfo, "width" | "height"> {
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X" && b.length >= 30) {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 " && b.length >= 30) {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return NO_SIZE;
}

/** An image checked and ready to store. */
export interface NewImage extends ImageInfo {
  kind: FeedbackAttachmentKind;
  bytes: Buffer;
}

const MB = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

/**
 * Checks one upload: at most 2 MB, and really a PNG, JPEG or WebP. The error
 * names the file so the composer can say which one was refused.
 */
export async function readImage(file: File, kind: FeedbackAttachmentKind): Promise<NewImage | { error: string }> {
  const name = file.name && file.name !== "blob" ? `"${file.name}"` : "an image";
  if (file.size > FEEDBACK_MAX_IMAGE_BYTES) {
    return { error: `${name} is ${MB(file.size)} — images can be at most ${MB(FEEDBACK_MAX_IMAGE_BYTES)}` };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const info = imageInfo(bytes);
  if (!info || !FEEDBACK_IMAGE_MIMES.includes(info.mime)) {
    return { error: `${name} isn't a PNG, JPEG or WebP image` };
  }
  return { ...info, kind, bytes };
}

/**
 * A ticket's or reply's images, in order. `kinds[i]` says where `images[i]`
 * came from (default "upload"): the ticket form sends its captured element
 * and page screenshots in `images` too. At most one of each captured kind and
 * FEEDBACK_MAX_IMAGES uploads; the screenshots don't count.
 */
export async function readImages(input: {
  images?: File[];
  kinds?: FeedbackAttachmentKind[];
}): Promise<{ images: NewImage[] } | { error: string }> {
  const files = input.images ?? [];
  const kinds = input.kinds ?? [];
  if (kinds.length > files.length) return { error: "more image kinds than images" };
  const queue: [File, FeedbackAttachmentKind][] = [
    ...files.map((f, i) => [f, kinds[i] ?? "upload"] as [File, FeedbackAttachmentKind]),
  ];
  const count = (kind: FeedbackAttachmentKind) => queue.filter(([, k]) => k === kind).length;
  const uploads = count("upload");
  if (uploads > FEEDBACK_MAX_IMAGES) {
    return { error: `at most ${FEEDBACK_MAX_IMAGES} images — ${uploads} were attached` };
  }
  if (count("element") > 1 || count("page") > 1) return { error: "at most one element and one page screenshot" };
  const images: NewImage[] = [];
  for (const [file, kind] of queue) {
    const img = await readImage(file, kind);
    if ("error" in img) return img;
    images.push(img);
  }
  return { images };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Stores images in order on a ticket (`commentId` null) or a reply. */
export async function saveAttachments(
  tx: Tx,
  itemId: string,
  commentId: string | null,
  images: NewImage[],
): Promise<void> {
  if (images.length === 0) return;
  await tx.insert(feedbackAttachments).values(
    images.map((img, position) => ({
      itemId,
      commentId,
      kind: img.kind,
      mime: img.mime,
      bytes: img.bytes,
      width: img.width,
      height: img.height,
      position,
    })),
  );
}

/** Attachment metadata (no bytes) for these items, keyed by item, then by comment ("" = the ticket). */
export async function attachmentsByItem(itemIds: string[]): Promise<Map<string, Map<string, FeedbackAttachment[]>>> {
  const out = new Map<string, Map<string, FeedbackAttachment[]>>();
  if (itemIds.length === 0) return out;
  const rows = await db
    .select({
      id: feedbackAttachments.id,
      itemId: feedbackAttachments.itemId,
      commentId: feedbackAttachments.commentId,
      kind: feedbackAttachments.kind,
      mime: feedbackAttachments.mime,
      width: feedbackAttachments.width,
      height: feedbackAttachments.height,
      position: feedbackAttachments.position,
    })
    .from(feedbackAttachments)
    .where(inArray(feedbackAttachments.itemId, itemIds))
    .orderBy(asc(feedbackAttachments.position), asc(feedbackAttachments.createdAt));
  for (const { itemId, commentId, ...a } of rows) {
    const byEntry = out.get(itemId) ?? new Map<string, FeedbackAttachment[]>();
    out.set(itemId, byEntry);
    const key = commentId ?? "";
    byEntry.set(key, [...(byEntry.get(key) ?? []), a]);
  }
  return out;
}

/** One attachment's bytes and where it sits, or null. */
export async function attachmentBytes(itemId: string, attachmentId: string) {
  const [row] = await db
    .select({
      commentId: feedbackAttachments.commentId,
      mime: feedbackAttachments.mime,
      bytes: feedbackAttachments.bytes,
    })
    .from(feedbackAttachments)
    .where(and(eq(feedbackAttachments.id, attachmentId), eq(feedbackAttachments.itemId, itemId)));
  return row ?? null;
}

/** A ticket's own images (not its replies'), in order, without bytes. */
export async function ticketImages(tx: Tx, itemId: string): Promise<Pick<FeedbackAttachment, "id" | "kind">[]> {
  return tx
    .select({ id: feedbackAttachments.id, kind: feedbackAttachments.kind })
    .from(feedbackAttachments)
    .where(and(eq(feedbackAttachments.itemId, itemId), isNull(feedbackAttachments.commentId)))
    .orderBy(asc(feedbackAttachments.position), asc(feedbackAttachments.createdAt));
}

/** One slot of a ticket's edited image list: an image it already has, or the nth new upload. */
export type ImageSlot = { keep: string } | { upload: number };

/**
 * Checks an edited image list against the ticket's current images: every
 * kept id is one of them (once), every new upload is placed exactly once,
 * and the uploads in the result — kept and new — stay within
 * FEEDBACK_MAX_IMAGES. Captured screenshots may be kept or dropped but don't
 * count. Pure; the error reads as-is in the editor.
 */
export function checkLayout(
  current: Pick<FeedbackAttachment, "id" | "kind">[],
  layout: ImageSlot[],
  uploads: number,
): { error: string } | null {
  const byId = new Map(current.map((a) => [a.id, a]));
  const kept = new Set<string>();
  const placed = new Set<number>();
  for (const slot of layout) {
    if ("keep" in slot) {
      if (!byId.has(slot.keep) || kept.has(slot.keep)) return { error: "an image in the list isn't on this ticket" };
      kept.add(slot.keep);
    } else {
      if (slot.upload >= uploads || placed.has(slot.upload)) return { error: "the image list doesn't match the uploads" };
      placed.add(slot.upload);
    }
  }
  if (placed.size !== uploads) return { error: "the image list doesn't match the uploads" };
  const total = [...kept].filter((id) => byId.get(id)!.kind === "upload").length + uploads;
  if (total > FEEDBACK_MAX_IMAGES) return { error: `at most ${FEEDBACK_MAX_IMAGES} images — the ticket would have ${total}` };
  return null;
}

/**
 * Rewrites a ticket's own images (`comment_id` null) to `layout`: drops the
 * ones left out, renumbers the kept ones and inserts the new uploads where
 * they were placed. Run `checkLayout` first.
 */
export async function relayoutTicketImages(tx: Tx, itemId: string, layout: ImageSlot[], uploads: NewImage[]): Promise<void> {
  const keep = layout.flatMap((s) => ("keep" in s ? [s.keep] : []));
  const onTicket = and(eq(feedbackAttachments.itemId, itemId), isNull(feedbackAttachments.commentId));
  await tx.delete(feedbackAttachments).where(keep.length ? and(onTicket, notInArray(feedbackAttachments.id, keep)) : onTicket);
  for (const [position, slot] of layout.entries()) {
    if ("keep" in slot) {
      await tx.update(feedbackAttachments).set({ position }).where(and(onTicket, eq(feedbackAttachments.id, slot.keep)));
    } else {
      const img = uploads[slot.upload];
      await tx.insert(feedbackAttachments).values({
        itemId,
        commentId: null,
        kind: img.kind,
        mime: img.mime,
        bytes: img.bytes,
        width: img.width,
        height: img.height,
        position,
      });
    }
  }
}
