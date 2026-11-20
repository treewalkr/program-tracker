import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, requestLogs } from "@pt/db";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import {
  pruneRequestLogs,
  requestErrorText,
  requestIdFor,
  settleRequestLogs,
  shouldLogRequest,
  writeRequestLog,
} from "./lib/request-log";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: requestLogs.id }).from(requestLogs).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping request log DB tests");
}

const TOKEN = "agent-test-token-request-log";

describe("request log rules", () => {
  test("requestIdFor reuses a safe incoming id, else makes an 8-char one", () => {
    expect(requestIdFor("abcDEF12-_x")).toBe("abcDEF12-_x");
    expect(requestIdFor("short")).toMatch(/^[0-9a-f]{8}$/);
    expect(requestIdFor("bad id; drop table")).toMatch(/^[0-9a-f]{8}$/);
    expect(requestIdFor(null)).toMatch(/^[0-9a-f]{8}$/);
  });

  test("logs failures except 401, and slow requests", () => {
    expect(shouldLogRequest(200, 10)).toBe(false);
    expect(shouldLogRequest(200, 2000)).toBe(true);
    expect(shouldLogRequest(401, 10)).toBe(false);
    expect(shouldLogRequest(404, 10)).toBe(true);
    expect(shouldLogRequest(422, 10)).toBe(true);
    expect(shouldLogRequest(500, 10)).toBe(true);
  });

  test("error text is redacted, squashed and capped at 500", () => {
    expect(requestErrorText("no client for\n kai@x.com")).toBe("no client for [email]");
    expect(requestErrorText("")).toBeNull();
    expect(requestErrorText("x".repeat(900))!.length).toBe(500);
  });
});

describe.skipIf(!dbUp)("request ids and the request log", () => {
  const saved = process.env.FEEDBACK_AGENT_TOKEN;
  beforeAll(() => {
    process.env.FEEDBACK_AGENT_TOKEN = TOKEN;
  });
  afterAll(async () => {
    process.env.FEEDBACK_AGENT_TOKEN = saved;
    await db.delete(requestLogs);
  });

  const call = async (method: string, path: string, opts: { body?: unknown; id?: string; cookie?: string; bearer?: string } = {}) => {
    const prev = process.env.AUTH_DISABLED;
    if (opts.cookie !== undefined || opts.bearer) process.env.AUTH_DISABLED = "false";
    try {
      const res = await app.handle(
        new Request(`http://local${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            ...(opts.id ? { "x-request-id": opts.id } : {}),
            ...(opts.cookie !== undefined ? { cookie: `${SESSION_COOKIE}=${opts.cookie}` } : {}),
            ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
          },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        }),
      );
      await settleRequestLogs();
      return res;
    } finally {
      process.env.AUTH_DISABLED = prev;
    }
  };
  const rowsFor = (requestId: string) => db.select().from(requestLogs).where(eq(requestLogs.requestId, requestId));

  test("every response carries x-request-id: 200, 4xx and 5xx-style errors", async () => {
    const ok = await call("GET", "/v1/meta");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}$/);
    const bad = await call("POST", "/v1/feedback", { body: { comment: "" } });
    expect(bad.status).toBe(422);
    expect(bad.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}$/);
    const echoed = await call("GET", "/v1/meta", { id: "client-chosen-id" });
    expect(echoed.headers.get("x-request-id")).toBe("client-chosen-id");
  });

  test("a 422 is logged with its route pattern and error; a 200 and a 401 are not", async () => {
    await call("GET", "/v1/meta", { id: "rl-ok-0001" });
    expect(await rowsFor("rl-ok-0001")).toEqual([]);

    await call("GET", "/v1/feedback", { id: "rl-401-0001", cookie: "nope" });
    expect(await rowsFor("rl-401-0001")).toEqual([]);

    await call("POST", "/v1/feedback", { id: "rl-422-0001", body: { comment: "" } });
    const [invalid] = await rowsFor("rl-422-0001");
    expect(invalid).toMatchObject({ method: "POST", route: "/v1/feedback/", status: 422 });
    // the field and reason, never the submitted body
    expect(invalid.error).toBe("context: Expected required property");

    // A handler's own refusal, after the session resolved: the caller is recorded.
    const me = await getDefaultTrainerId();
    const { token: session } = await createSession(me);
    const res = await call("POST", "/v1/feedback/00000000-0000-4000-8000-000000000000/comments", {
      id: "rl-404-0001",
      cookie: session,
      body: { body: "hi" },
    });
    expect(res.status).toBe(404);
    const [row] = await rowsFor("rl-404-0001");
    expect(row).toMatchObject({ route: "/v1/feedback/:id/comments", status: 404, trainerId: me, error: "feedback not found" });
  });

  test("the agent reads a request id's rows, with its token only", async () => {
    await call("POST", "/v1/feedback", { id: "rl-agent-0001", body: { comment: "" } });
    expect(await call("GET", "/v1/agent/feedback/requests/rl-agent-0001", { bearer: "wrong" }).then((r) => r.status)).toBe(401);
    const res = await call("GET", "/v1/agent/feedback/requests/rl-agent-0001", { bearer: TOKEN });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { route: string; status: number; error: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ route: "/v1/feedback/", status: 422 });
  });

  test("prune drops rows older than 14 days; writes prune on the 1% roll", async () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const base = { method: "GET", route: "/x", status: 500, durationMs: 1, trainerId: null, error: null };
    await db.insert(requestLogs).values([
      { ...base, requestId: "rl-old-0001", createdAt: old },
      { ...base, requestId: "rl-new-0001" },
    ]);
    expect(await pruneRequestLogs()).toBeGreaterThanOrEqual(1);
    expect(await rowsFor("rl-old-0001")).toEqual([]);
    expect(await rowsFor("rl-new-0001")).toHaveLength(1);

    await db.insert(requestLogs).values({ ...base, requestId: "rl-old-0002", createdAt: old });
    await writeRequestLog({ ...base, requestId: "rl-roll-0001" }, () => 0.5);
    expect(await rowsFor("rl-old-0002")).toHaveLength(1);
    await writeRequestLog({ ...base, requestId: "rl-roll-0002" }, () => 0.001);
    expect(await rowsFor("rl-old-0002")).toEqual([]);
    const kept = await db.select().from(requestLogs).where(inArray(requestLogs.requestId, ["rl-roll-0001", "rl-roll-0002"]));
    expect(kept).toHaveLength(2);
  });
});
