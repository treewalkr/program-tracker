/**
 * One voice for failed API calls. A 4xx keeps the API's own `{ error }`
 * sentence (routes write those for people). A 5xx or a call that never got an
 * answer never shows its raw body — that can be SQL, ids or "request failed:
 * 503" — but plain words; the request id rides along for support.
 */

/** The server answered with a 5xx. */
export const SERVER_ERROR = "Something went wrong on our side. Try again.";
/** No answer at all: offline, dropped Wi-Fi, server down. */
export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

/** What an Eden call hands back on failure. */
export interface EdenFailure {
  value: unknown;
  status?: unknown;
}

/** A failed API call: its message is safe to show as-is. */
export interface ApiFailure extends Error {
  /** HTTP status; "unknown" when Eden couldn't tell. A dropped connection reads 503 (Eden's choice). */
  status: number | "unknown";
  /** The call never reached the server. */
  network: boolean;
  /** The server's `x-request-id` for this call, when it sent one — for support, not the headline. */
  requestId: string | null;
}

/** Eden turns a thrown `fetch` (offline, reset, DNS) into a failure whose value is the thrown Error. */
export const isNetworkFailure = (error: EdenFailure): boolean => error.value instanceof Error;

const bodyOf = (value: unknown): { error?: unknown; requestId?: unknown } | null =>
  value && typeof value === "object" ? (value as { error?: unknown; requestId?: unknown }) : null;

/** The words to show for a failed call. */
export function apiErrorText(error: EdenFailure): string {
  if (isNetworkFailure(error)) return NETWORK_ERROR;
  const status = typeof error.status === "number" ? error.status : null;
  if (status === null || status >= 500) return SERVER_ERROR;
  const said = typeof error.value === "string" ? error.value : bodyOf(error.value)?.error;
  return typeof said === "string" && said.trim() ? said : SERVER_ERROR;
}

/** The request id the API put in a 500 body (`{ error, requestId }`), if any. */
export function apiRequestId(error: EdenFailure, headers?: HeadersInit | null): string | null {
  const fromBody = bodyOf(error.value)?.requestId;
  if (typeof fromBody === "string" && fromBody) return fromBody;
  try {
    return headers ? new Headers(headers).get("x-request-id") : null;
  } catch {
    return null;
  }
}

/** The Error to throw for a failed call, with its status, network flag and request id. */
export function apiFailure(error: EdenFailure, headers?: HeadersInit | null): ApiFailure {
  const network = isNetworkFailure(error);
  return Object.assign(new Error(apiErrorText(error)), {
    status: typeof error.status === "number" ? error.status : ("unknown" as const),
    network,
    requestId: network ? null : apiRequestId(error, headers),
  });
}

const failureOf = (err: unknown): Partial<ApiFailure> => (err && typeof err === "object" ? (err as Partial<ApiFailure>) : {});

/** Whether trying again later could help: no answer, or the server broke. */
export function isTransient(err: unknown): boolean {
  const f = failureOf(err);
  return f.network === true || (typeof f.status === "number" && f.status >= 500);
}

/**
 * The text for a failed save where the trainer's entries are still on screen
 * (or kept as a draft): a blip says so, so nobody retypes a session. Other
 * failures keep their own message.
 */
export function saveErrorText(err: unknown): string {
  const f = failureOf(err);
  if (f.network === true) return "Couldn't reach the server — your changes are still here. Try again.";
  if (isTransient(err)) return "Something went wrong on our side — your changes are still here. Try again.";
  return err instanceof Error && err.message ? err.message : SERVER_ERROR;
}

/** The text for anything that failed: the safe message, or the generic line. */
export function errorText(err: unknown): string {
  if (isTransient(err)) {
    return failureOf(err).network === true ? NETWORK_ERROR : SERVER_ERROR;
  }
  return err instanceof Error && err.message ? err.message : SERVER_ERROR;
}

/** The request id a failure carries, for a muted "Ref …" line. */
export const errorRef = (err: unknown): string | null => {
  const id = failureOf(err).requestId;
  return typeof id === "string" && id ? id : null;
};

/**
 * The reason after a dash — "Couldn't load clients — {reason}." — lowercase,
 * no closing period: a blip in plain words, else the safe message.
 */
export function reasonText(err: unknown): string {
  const f = failureOf(err);
  if (f.network === true) return "can't reach the server. Check your connection and try again";
  if (isTransient(err)) return "something went wrong on our side. Try again";
  const msg = err instanceof Error ? err.message.trim().replace(/\.$/, "") : "";
  return msg || "something went wrong. Try again";
}
