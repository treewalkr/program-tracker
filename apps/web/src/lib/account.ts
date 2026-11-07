import { client } from "$lib/api/treaty";

/**
 * The signed-in trainer's own settings, straight to the Elysia API (Eden) in
 * every mode — like feedback, it is about the account, not demo data.
 */
export interface NotificationSettings {
  feedbackEmails: boolean;
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
  setNotifications: (patch: NotificationSettings) =>
    unwrap<NotificationSettings>(client.v1.account.notifications.patch(patch)),
};
