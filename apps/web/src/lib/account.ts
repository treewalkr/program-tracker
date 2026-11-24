import type { FeedbackAiMode, FeedbackEmailPrefs } from "@pt/shared";
import { client } from "$lib/api/treaty";
import { apiFailure } from "$lib/api/errors";

/**
 * The signed-in trainer's own settings, straight to the Elysia API (Eden) in
 * every mode — like feedback, it is about the account, not demo data.
 */
export interface MutedTicket {
  itemId: string;
  number: number;
  handle: string;
  /** Clipped. */
  comment: string;
}

export interface NotificationSettings {
  /** Master switch: off silences every feedback email, prefs are kept. */
  feedbackEmails: boolean;
  prefs: FeedbackEmailPrefs;
  muted: MutedTicket[];
  isAdmin: boolean;
}

export interface NotificationPatch {
  feedbackEmails?: boolean;
  prefs?: Partial<FeedbackEmailPrefs>;
}

async function unwrap<T>(p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null; headers?: unknown }>): Promise<T> {
  const { data, error, headers } = await p;
  if (error) throw apiFailure(error, headers as HeadersInit | undefined);
  return data as T;
}

export const accountApi = {
  notifications: () => unwrap<NotificationSettings>(client.v1.account.notifications.get()),
  setNotifications: (patch: NotificationPatch) =>
    unwrap<NotificationSettings>(client.v1.account.notifications.patch(patch)),
  /** Admin: AI answers on feedback — off, drafts only, or auto-send all. */
  feedbackAiMode: async () => (await unwrap<{ mode: FeedbackAiMode }>(client.v1.account["feedback-ai"].get())).mode,
  setFeedbackAiMode: async (mode: FeedbackAiMode) =>
    (await unwrap<{ mode: FeedbackAiMode }>(client.v1.account["feedback-ai"].put({ mode }))).mode,
};
