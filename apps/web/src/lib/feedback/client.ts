import { PUBLIC_API_URL } from "$env/static/public";
import type { FeedbackContext, FeedbackItem, FeedbackStatus } from "@pt/shared";
import { client } from "$lib/api/treaty";

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
const normalize = (i: FeedbackItem): FeedbackItem => ({ ...i, createdAt: iso(i.createdAt), updatedAt: iso(i.updatedAt) });

export const feedbackApi = {
  submit: (body: { comment: string; context: FeedbackContext; elementShot?: string; pageShot?: string }) =>
    unwrap<{ id: string; number: number; handle: string }>(client.v1.feedback.post(body)),
  list: async (status?: FeedbackStatus[]) =>
    (await unwrap<FeedbackItem[]>(client.v1.feedback.get({ query: { status: status?.join(",") } }))).map(normalize),
  triage: async (id: string, patch: { status?: FeedbackStatus; triageNote?: string | null }) =>
    normalize(await unwrap<FeedbackItem>(client.v1.feedback({ id }).patch(patch))),
  remove: (id: string) => unwrap<{ ok: boolean }>(client.v1.feedback({ id }).delete()),
  exportMarkdown: async (status: string) =>
    String(await unwrap<unknown>(client.v1.feedback.export.get({ query: { status, format: "md" } }))),
};

const base = PUBLIC_API_URL ?? "http://localhost:4000";
export const shotUrl = (id: string, kind: "element" | "page") => `${base}/v1/feedback/${id}/shot/${kind}`;
export const exportUrl = (status: string, format: "md" | "json" = "md") =>
  `${base}/v1/feedback/export?status=${encodeURIComponent(status)}&format=${format}`;
