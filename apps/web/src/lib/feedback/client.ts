import { apiBase } from "$lib/api/base";
import {
  feedbackHandle,
  type FeedbackAttachment,
  type FeedbackComment,
  type FeedbackContext,
  type FeedbackItem,
  type FeedbackStatus,
} from "@pt/shared";
import type { LightboxImage } from "$lib/ui/Lightbox.svelte";
import { client } from "$lib/api/treaty";
import type { ImageSlot } from "./layout";

/** Someone else edited the ticket (or it was closed) while it was open in the editor. */
export class EditConflict extends Error {}

/**
 * Feedback goes straight to the Elysia API (Eden), in mock and live mode
 * alike — it reviews the app, it is not app data.
 */
async function unwrap<T>(p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    const value = error.value as { error?: string } | string | null;
    const message = typeof value === "string" ? value : value?.error;
    throw new Error(message ?? `request failed: ${String(error.status ?? "unknown")}`);
  }
  return data as T;
}

/** Eden revives ISO dates into Date objects; FeedbackItem models them as strings. */
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string));
const normalizeComment = (c: FeedbackComment): FeedbackComment => ({
  ...c,
  createdAt: iso(c.createdAt),
  aiMeta: c.aiMeta ? { ...c.aiMeta, runAt: iso(c.aiMeta.runAt) } : null,
  aiPublic: c.aiPublic
    ? { ...c.aiPublic, rating: c.aiPublic.rating ? { ...c.aiPublic.rating, at: iso(c.aiPublic.rating.at) } : null }
    : null,
});
const normalize = (i: FeedbackItem): FeedbackItem => ({
  ...i,
  thread: i.thread.map(normalizeComment),
  editedAt: i.editedAt === null ? null : iso(i.editedAt),
  fixPr: i.fixPr ? { ...i.fixPr, at: iso(i.fixPr.at) } : null,
  createdAt: iso(i.createdAt),
  updatedAt: iso(i.updatedAt),
});

/** PATCH /v1/feedback/:id body, straight from the API's type. */
export type TriagePatch = Parameters<ReturnType<typeof client.v1.feedback>["patch"]>[0];

/** PUT /v1/feedback/:id/comments/:cid/rating body, straight from the API's type. */
export type RateAnswerBody = Parameters<ReturnType<ReturnType<typeof client.v1.feedback>["comments"]>["rating"]["put"]>[0];

/** A screenshot the feedback form captured, and which one it is. */
export type CapturedShot = { kind: "element" | "page"; file: File };

/** Leaves out an empty image list so a text-only post stays JSON. */
function withImages<T extends { images?: File[] }>(body: T): T {
  if (body.images?.length) return body;
  const { images: _, ...rest } = body;
  return rest as T;
}

export const feedbackApi = {
  /**
   * Multipart when it carries images (Eden switches to FormData for File
   * fields). The captured screenshots go first in `images`; `kinds` names
   * each image so the API stores them as element / page / upload.
   */
  submit: ({ shots = [], uploads = [], ...body }: { comment: string; context: FeedbackContext; shots?: CapturedShot[]; uploads?: File[] }) => {
    const images = [...shots.map((s) => s.file), ...uploads];
    const kinds = [...shots.map((s) => s.kind), ...uploads.map(() => "upload" as const)].join(",");
    return unwrap<{ id: string; number: number; handle: string }>(
      client.v1.feedback.post(images.length ? { ...body, images, kinds } : body),
    );
  },
  list: async (status?: FeedbackStatus[]) =>
    (await unwrap<FeedbackItem[]>(client.v1.feedback.get({ query: { status: status?.join(",") } }))).map(normalize),
  /** Status and/or note; `reason` (Won't fix only) posts as a reply the email quotes. */
  triage: async (id: string, patch: TriagePatch) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).patch(patch))),
  /**
   * Edit a ticket's comment and images (its reporter or the admin). `version`
   * is `editedAt ?? createdAt` as the editor opened it; a 409 throws
   * EditConflict. Multipart only when new images ride along.
   */
  editContent: async (id: string, body: { comment: string; version: string; layout: ImageSlot[]; images: File[] }) => {
    const res = await client.v1.feedback({ id }).content.patch(withImages(body));
    if (res.error?.status === 409) {
      const value = res.error.value as { error?: string } | null;
      throw new EditConflict(value?.error ?? "This ticket changed while you were editing it.");
    }
    return normalize(await unwrap<FeedbackItem>(Promise.resolve(res)));
  },
  get: async (id: string) => normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).get())),
  remove: (id: string) => unwrap<{ ok: boolean }>(client.v1.feedback({ id }).delete()),
  reply: async (id: string, body: string, images: File[] = []) =>
    normalizeComment(await unwrap<FeedbackComment>(client.v1.feedback({ id }).comments.post(withImages({ body, images })))),
  /** Stop (or resume) emails about one item, for the signed-in trainer. */
  setMuted: (id: string, muted: boolean) =>
    unwrap<{ muted: boolean }>(muted ? client.v1.feedback({ id }).mute.put() : client.v1.feedback({ id }).mute.delete()),
  /** Admin: mark it a duplicate of open ticket number `of`, or unlink it (null). */
  setDuplicate: async (id: string, of: number | null) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).duplicate.put({ of }))),
  seen: (id: string) => unwrap<{ ok: boolean }>(client.v1.feedback({ id }).seen.post()),
  unread: async () => (await unwrap<{ count: number }>(client.v1.feedback.unread.get())).count,
  exportMarkdown: async (status: string) =>
    String(await unwrap<unknown>(client.v1.feedback.export.get({ query: { status, format: "md" } }))),
  /** Admin: send an AI draft reply, edited when `body` is given. */
  publishDraft: async (id: string, cid: string, body?: string) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).comments({ cid }).publish.post(body === undefined ? {} : { body }))),
  /** The reporter's 👍 (1) or 👎 (-1, optional tags and comment) on a sent AI answer; replaces any earlier rating. */
  rateAnswer: async (id: string, cid: string, rating: RateAnswerBody) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).comments({ cid }).rating.put(rating))),
  unrateAnswer: async (id: string, cid: string) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).comments({ cid }).rating.delete())),
  /** Admin: discard an AI draft or private note. */
  discardAi: async (id: string, cid: string) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).comments({ cid }).delete())),
};

const base = apiBase;
export const attachmentUrl = (itemId: string, attachmentId: string) =>
  `${base}/v1/feedback/${itemId}/attachments/${attachmentId}`;
export const exportUrl = (status: string, format: "md" | "json" = "md") =>
  `${base}/v1/feedback/export?status=${encodeURIComponent(status)}&format=${format}`;

/** Lightbox entries for one ticket's or reply's images, in their stored order. */
export function attachmentImages(
  itemId: string,
  list: FeedbackAttachment[],
  caption: (a: FeedbackAttachment, n: number) => string,
): LightboxImage[] {
  return list.map((a, i) => ({ src: attachmentUrl(itemId, a.id), alt: caption(a, i + 1), caption: caption(a, i + 1) }));
}

/** How a ticket image is described: what was captured, or "image n". */
export function ticketImageCaption(item: FeedbackItem) {
  const handle = feedbackHandle(item.number);
  return (a: FeedbackAttachment, n: number) =>
    a.kind === "page"
      ? `${handle} · the page when it was filed, element outlined in red`
      : a.kind === "element"
        ? `${handle} · the element`
        : `${handle} · image ${n}`;
}

/**
 * A ticket's screenshots for "Show me": the page shot first (the element is
 * outlined in red in it), then the close-up of the element.
 */
export function ticketShots(item: FeedbackItem): LightboxImage[] {
  const order = { page: 0, element: 1 } as const;
  const shots = item.attachments
    .filter((a): a is FeedbackAttachment & { kind: "page" | "element" } => a.kind === "page" || a.kind === "element")
    .sort((a, b) => order[a.kind] - order[b.kind]);
  return attachmentImages(item.id, shots, ticketImageCaption(item));
}
