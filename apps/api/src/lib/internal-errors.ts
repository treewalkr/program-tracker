import { Elysia } from "elysia";
import { REQUEST_ID_HEADER } from "./request-log";

/**
 * The catch-all for errors nobody meant to send: a thrown `Error`, a failed
 * query, a bug. The browser gets a plain 500 `{ error, requestId }` — never the
 * message, SQL or stack (those name tables and ids). The real error goes to
 * the server log, and `request-log` still records it under the request id.
 * Validation, not-found and any status a route chose pass through untouched.
 */

export const INTERNAL_ERROR = "Something went wrong on our side";

/** Codes Elysia maps to its own response (422, 404, 400, …); everything else is a string some library chose. */
const ELYSIA_CODES = new Set(["VALIDATION", "NOT_FOUND", "PARSE", "INVALID_COOKIE_SIGNATURE", "INVALID_FILE_TYPE"]);

/**
 * Whether an error is ours to hide: not one Elysia already maps, not a status a
 * route threw, and no 4xx status of its own. Elysia copies a thrown error's own
 * `code` (postgres `CONNECT_TIMEOUT`, `ECONNREFUSED`, a SQLSTATE), so those count too.
 */
export function isInternalError(code: unknown, error: unknown): boolean {
  if (typeof code === "string" && ELYSIA_CODES.has(code)) return false;
  // a thrown `status(4xx/5xx)`; DOMException codes (AbortError = 20) are below 100
  if (typeof code === "number" && code >= 400 && code < 600) return false;
  const status = (error as { status?: unknown } | null)?.status;
  return !(typeof status === "number" && status < 500);
}

/** The 500 body: a fixed sentence and the id support can look up. */
export const internalErrorBody = (requestId: string | undefined): { error: string; requestId: string | null } => ({
  error: INTERNAL_ERROR,
  requestId: requestId ?? null,
});

export const internalErrors = new Elysia({ name: "internal-errors" }).onError(
  { as: "global" },
  ({ code, error, set, request, status }) => {
    if (!isInternalError(code, error)) return;
    const id = set.headers[REQUEST_ID_HEADER];
    const requestId = typeof id === "string" ? id : undefined;
    const path = new URL(request.url).pathname;
    console.error(`[${requestId ?? "-"}] ${request.method} ${path} failed:`, error);
    return status(500, internalErrorBody(requestId));
  }
);
