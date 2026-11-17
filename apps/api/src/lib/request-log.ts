import { Elysia, StatusMap } from "elysia";
import { desc, eq, lt } from "drizzle-orm";
import { db, requestLogs } from "@pt/db";
import { redactText } from "@pt/shared";

/**
 * Request ids and the server's request log. Every response carries an
 * `x-request-id`; the browser keeps the ids of failed and slow calls and a
 * feedback ticket carries them, so the agent can look up what the server saw
 * (`GET /v1/agent/feedback/requests/:requestId`). Only failures (>= 400,
 * except 401: being signed out is not a fault) and slow requests (>= 2 s) are
 * written, without bodies. Rows older than 14 days go on ~1% of inserts.
 */

export const REQUEST_ID_HEADER = "x-request-id";
export const SLOW_REQUEST_MS = 2000;
export const REQUEST_LOG_DAYS = 14;
const ERROR_MAX = 500;
const PRUNE_CHANCE = 0.01;

/** An incoming id we may reuse: short, URL-safe, nothing to inject into a log. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The caller's `x-request-id` when it's a safe token, else a fresh 8-character id. */
export const requestIdFor = (incoming: string | null | undefined): string =>
  incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID().replace(/-/g, "").slice(0, 8);

/** Whether a finished request goes in the log. */
export const shouldLogRequest = (status: number, durationMs: number): boolean =>
  (status >= 400 && status !== 401) || durationMs >= SLOW_REQUEST_MS;

/** Error text as stored: redacted, one line, capped. */
export const requestErrorText = (raw: string | null | undefined): string | null => {
  const s = raw?.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const red = redactText(s);
  return red.length > ERROR_MAX ? `${red.slice(0, ERROR_MAX - 1)}…` : red;
};

export interface RequestLogEntry {
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  trainerId: string | null;
  error: string | null;
}

/** Delete rows older than REQUEST_LOG_DAYS; returns how many went. */
export async function pruneRequestLogs(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REQUEST_LOG_DAYS * 24 * 60 * 60 * 1000);
  const gone = await db.delete(requestLogs).where(lt(requestLogs.createdAt, cutoff)).returning({ id: requestLogs.id });
  return gone.length;
}

/** Insert one row; on ~1% of inserts (`random() < 0.01`) prune old rows too. Never throws. */
export async function writeRequestLog(entry: RequestLogEntry, random: () => number = Math.random): Promise<void> {
  try {
    await db.insert(requestLogs).values(entry);
    if (random() < PRUNE_CHANCE) await pruneRequestLogs();
  } catch (err) {
    console.error(`request-log: ${(err as Error).message}`);
  }
}

/** The rows for one request id, oldest first (a retried id may have several). */
export async function requestLogsFor(requestId: string) {
  const rows = await db
    .select({
      requestId: requestLogs.requestId,
      method: requestLogs.method,
      route: requestLogs.route,
      status: requestLogs.status,
      durationMs: requestLogs.durationMs,
      trainerId: requestLogs.trainerId,
      error: requestLogs.error,
      createdAt: requestLogs.createdAt,
    })
    .from(requestLogs)
    .where(eq(requestLogs.requestId, requestId))
    .orderBy(desc(requestLogs.createdAt))
    .limit(50);
  return rows.reverse().map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

const inFlight = new Set<Promise<void>>();
/** Tests: wait for the log writes started so far (after-response hooks run a tick after the response). */
export async function settleRequestLogs(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  while (inFlight.size) await Promise.all([...inFlight]);
}

/** Error text from a returned `status(4xx, { error })`, or what onError saw. */
function errorOf(responseValue: unknown, thrown: string | undefined): string | null {
  const v = responseValue as { response?: unknown } | null | undefined;
  const body = v && typeof v === "object" && "response" in v ? v.response : null;
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  if (typeof body === "string") return body;
  return thrown ?? null;
}

const seen = new WeakMap<Request, { id: string; start: number; error?: string }>();

/**
 * Global hooks: stamp `x-request-id` on every response (errors included) and
 * log failed or slow requests once the response is out. Requests that matched
 * no route (scanners, typos) are not logged.
 */
export const requestLog = new Elysia({ name: "request-log" })
  .onRequest(({ request, set }) => {
    const id = requestIdFor(request.headers.get(REQUEST_ID_HEADER));
    seen.set(request, { id, start: performance.now() });
    set.headers[REQUEST_ID_HEADER] = id;
  })
  .onError({ as: "global" }, ({ request, error }) => {
    const m = seen.get(request);
    if (m) m.error = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
  })
  .onAfterResponse({ as: "global" }, (ctx) => {
    const m = seen.get(ctx.request);
    if (!m || !ctx.route) return;
    const raw = ctx.set.status;
    const status = typeof raw === "number" ? raw : ((raw && StatusMap[raw as keyof typeof StatusMap]) ?? 200);
    const durationMs = Math.round(performance.now() - m.start);
    if (!shouldLogRequest(status, durationMs)) return;
    const trainerId = (ctx as { trainerId?: unknown }).trainerId;
    const p = writeRequestLog({
      requestId: m.id,
      method: ctx.request.method,
      route: ctx.route,
      status,
      durationMs,
      trainerId: typeof trainerId === "string" ? trainerId : null,
      error: status >= 400 ? requestErrorText(errorOf((ctx as { responseValue?: unknown }).responseValue, m.error)) : null,
    }).finally(() => inFlight.delete(p));
    inFlight.add(p);
  });
