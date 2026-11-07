import type { FeedbackEmailPrefs } from "@pt/shared";
import { client } from "$lib/api/treaty";

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

async function unwrap<T>(p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    const value = error.value as { error?: string } | string | null;
    const message = typeof value === "string" ? value : value?.error;
    throw new Error(message ?? `request failed: ${String(error.status ?? "unknown")}`);
  }
  return data as T;
}

export const accountApi = {
  notifications: () => unwrap<NotificationSettings>(client.v1.account.notifications.get()),
  setNotifications: (patch: NotificationPatch) =>
    unwrap<NotificationSettings>(client.v1.account.notifications.patch(patch)),
};
