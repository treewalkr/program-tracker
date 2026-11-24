/** A failed API call, keeping the HTTP status the message alone loses. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/**
 * Why the feedback list didn't load, in words that say what to do: follows
 * "Couldn't load feedback — …". A raw server string ("signed out") never
 * stands alone.
 */
export function loadErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "you're signed out. Sign in again, then try again";
    if (err.status === 403) return "this account can't open feedback";
    if (err.status !== null && err.status >= 500) return "the server hit an error. Try again in a minute";
  }
  // fetch rejects with a TypeError when the server can't be reached at all (Eden: a `network` failure)
  if (err instanceof TypeError || (err as { network?: unknown } | null)?.network === true) {
    return "can't reach the server. Check your connection";
  }
  return err instanceof Error && err.message ? err.message : "something went wrong";
}
