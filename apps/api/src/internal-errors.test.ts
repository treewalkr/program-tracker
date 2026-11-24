import { describe, expect, spyOn, test } from "bun:test";
import { Elysia, status, t } from "elysia";
import { INTERNAL_ERROR, internalErrorBody, internalErrors, isInternalError } from "./lib/internal-errors";
import { errorOf } from "./lib/request-log";
import { validationErrors } from "./lib/validation-errors";

const SQL = `Failed query: select "id" from "clients" where "trainer_id" = $1 params: 0b9c2f3e-1111-4222-8333-944445555666`;

// the app's order: request id first, then the 422 mapper, then the catch-all
const app = new Elysia()
  .onRequest(({ set }) => {
    set.headers["x-request-id"] = "req12345";
  })
  .use(validationErrors)
  .use(internalErrors)
  .get("/boom", () => {
    throw new Error(SQL);
  })
  .get("/teapot", () => status(409, { error: "name already taken" }))
  .get("/thrown-status", () => {
    throw status(403, { error: "not yours" });
  })
  .get("/db-down", () => {
    throw Object.assign(new Error("write CONNECT_TIMEOUT db.internal.example:6543"), { code: "CONNECT_TIMEOUT" });
  })
  .get("/coded", () => {
    throw Object.assign(new Error("bad range"), { status: 400 });
  })
  .post("/typed", ({ body }) => body, { body: t.Object({ n: t.Number() }) });

const get = (path: string, init?: RequestInit) => app.handle(new Request(`http://local${path}`, init));

describe("internal errors", () => {
  test("an unhandled error is a plain 500 with the request id, never the message", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await get("/boom");
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain("clients");
      expect(text).not.toContain("0b9c2f3e");
      expect(JSON.parse(text)).toEqual({ error: INTERNAL_ERROR, requestId: "req12345" });
      // the real error still reaches the server log
      expect(String(logged.mock.calls[0]?.[0])).toContain("req12345");
      expect((logged.mock.calls[0]?.[1] as Error).message).toBe(SQL);
    } finally {
      logged.mockRestore();
    }
  });

  test("a status the route returned or threw keeps its body", async () => {
    const returned = await get("/teapot");
    expect(returned.status).toBe(409);
    expect(await returned.json()).toEqual({ error: "name already taken" });
    const thrown = await get("/thrown-status");
    expect(thrown.status).toBe(403);
    expect(await thrown.json()).toEqual({ error: "not yours" });
  });

  test("an error carrying its own 4xx status is not hidden", async () => {
    const res = await get("/coded");
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(INTERNAL_ERROR);
  });

  test("not-found and validation keep their own responses", async () => {
    expect((await get("/nope")).status).toBe(404);
    const bad = await get("/typed", { method: "POST", headers: { "content-type": "application/json" }, body: '{"n":"x"}' });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { type: string }).type).toBe("validation");
  });

  test("an error with its own code (a driver or system error) is hidden too", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await get("/db-down");
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain("CONNECT_TIMEOUT");
      expect(text).not.toContain("db.internal");
      expect(JSON.parse(text)).toEqual({ error: INTERNAL_ERROR, requestId: "req12345" });
    } finally {
      logged.mockRestore();
    }
  });

  test("only Elysia's own codes and route statuses pass through", () => {
    expect(isInternalError("UNKNOWN", new Error("x"))).toBe(true);
    expect(isInternalError("ECONNREFUSED", new Error("connect ECONNREFUSED 10.0.0.5:5432"))).toBe(true);
    expect(isInternalError("23505", new Error("duplicate key value violates unique constraint"))).toBe(true);
    expect(isInternalError(20, new Error("The operation was aborted"))).toBe(true);
    expect(isInternalError("23505", Object.assign(new Error("x"), { status: 409 }))).toBe(false);
    expect(isInternalError("INTERNAL_SERVER_ERROR", new Error("x"))).toBe(true);
    expect(isInternalError("UNKNOWN", Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(isInternalError("UNKNOWN", Object.assign(new Error("x"), { status: 404 }))).toBe(false);
    for (const code of ["VALIDATION", "NOT_FOUND", "PARSE", 409]) expect(isInternalError(code, new Error("x"))).toBe(false);
    expect(internalErrorBody(undefined)).toEqual({ error: INTERNAL_ERROR, requestId: null });
  });

  test("the request log keeps the real error behind a 5xx", () => {
    const sent = { response: internalErrorBody("req12345") };
    expect(errorOf(sent, SQL, 500)).toBe(SQL);
    expect(errorOf({ response: { error: "name already taken" } }, undefined, 409)).toBe("name already taken");
  });
});
