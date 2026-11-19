import { describe, expect, test, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import { db, trainers, programs } from "@pt/db";
import { addDays, localDateOf } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping program validation tests");
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

/** Smallest valid weeks document: one exercise session with one set. */
const weeksWith = (exerciseId: string) => [
  {
    week: 1,
    sessions: [
      {
        id: crypto.randomUUID(),
        name: "Day A",
        seq: 1,
        order: 0,
        kind: "exercises",
        exercises: [
          { id: crypto.randomUUID(), exerciseId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5 }] },
        ],
      },
    ],
  },
];

describe.skipIf(!dbUp)("program body validation", () => {
  const ids: string[] = [];
  let weeks: unknown[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(programs).where(inArray(programs.id, ids));
  });

  test("create returns the program with weeks and server-owned fields", async () => {
    const squat = await call("GET", "/v1/exercises?q=squat");
    weeks = weeksWith(squat.body[0].id);
    const { status, body } = await call("POST", "/v1/programs", { name: "Validation", weeks });
    expect(status).toBe(201);
    expect(body).toMatchObject({ name: "Validation", status: "draft", version: 1 });
    expect(body.weeks).toHaveLength(1);
    expect(body.sessions).toBeUndefined();
    ids.push(body.id);
  });

  test("create refuses an over-length name, description or direction, and a missing name", async () => {
    expect((await call("POST", "/v1/programs", { name: "x".repeat(161), weeks })).status).toBe(422);
    expect((await call("POST", "/v1/programs", { name: "", weeks })).status).toBe(422);
    expect((await call("POST", "/v1/programs", { weeks })).status).toBe(422);
    expect((await call("POST", "/v1/programs", { name: "ok", weeks, description: "x".repeat(2001) })).status).toBe(422);
    expect((await call("POST", "/v1/programs", { name: "ok", weeks, direction: "x".repeat(501) })).status).toBe(422);
  });

  test("create refuses a client id that is not a uuid", async () => {
    expect((await call("POST", "/v1/programs", { name: "ok", weeks, clientId: "nope" })).status).toBe(422);
  });

  test("status refuses an unknown value; direction refuses over-length text and a missing field", async () => {
    const id = ids[0];
    expect((await call("PATCH", `/v1/programs/${id}/status`, { status: "deleted" })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/direction`, { direction: "x".repeat(501) })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/direction`, {})).status).toBe(422);
    expect((await call("PUT", `/v1/programs/${id}`, { weeks, direction: "x".repeat(501) })).status).toBe(422);
  });

  test("status and direction updates still apply", async () => {
    const id = ids[0];
    const dir = await call("PATCH", `/v1/programs/${id}/direction`, { direction: "heavier" });
    expect(dir.status).toBe(200);
    expect(dir.body.direction).toBe("heavier");
    const st = await call("PATCH", `/v1/programs/${id}/status`, { status: "archived" });
    expect(st.status).toBe(200);
    expect(st.body.status).toBe("archived");
  });
});

describe.skipIf(!dbUp)("when Week 1 starts (startsOn)", () => {
  const ids: string[] = [];
  const today = localDateOf(Date.now());
  let weeks: unknown[] = [];
  /** A draft with `n` weeks. */
  const draft = async (n = 1) => {
    const doc = Array.from({ length: n }, (_, i) => ({ ...(weeks[0] as object), week: i + 1, sessions: (weeks[0] as any).sessions.map((s: any) => ({ ...s, id: crypto.randomUUID() })) }));
    const r = await call("POST", "/v1/programs", { name: "Start date", weeks: doc });
    ids.push(r.body.id);
    return r.body.id as string;
  };
  afterAll(async () => {
    if (ids.length) await db.delete(programs).where(inArray(programs.id, ids));
  });

  test("activation saves startsOn and stamps activatedAt", async () => {
    const squat = await call("GET", "/v1/exercises?q=squat");
    weeks = weeksWith(squat.body[0].id);
    const id = await draft(6);
    const monday = addDays(today, 5);
    const r = await call("PATCH", `/v1/programs/${id}/status`, { status: "active", startsOn: monday });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "active", startsOn: monday });
    expect(r.body.activatedAt).toBeTruthy();
  });

  test("activation without startsOn (the previous web) leaves it null", async () => {
    const id = await draft();
    const r = await call("PATCH", `/v1/programs/${id}/status`, { status: "active" });
    expect(r.status).toBe(200);
    expect(r.body.startsOn).toBeNull();
    expect(r.body.activatedAt).toBeTruthy();
  });

  test("activation refuses a bad, too early or too late date, and startsOn on another status", async () => {
    const id = await draft(2);
    const bad = await call("PATCH", `/v1/programs/${id}/status`, { status: "active", startsOn: "2026-02-30" });
    expect(bad.status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/status`, { status: "active", startsOn: "soon" })).status).toBe(422);
    // A 2-week block can start no earlier than 13 days ago.
    expect((await call("PATCH", `/v1/programs/${id}/status`, { status: "active", startsOn: addDays(today, -14) })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/status`, { status: "active", startsOn: addDays(today, 57) })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/status`, { status: "archived", startsOn: today })).status).toBe(422);
    const [row] = await db.select().from(programs).where(inArray(programs.id, [id]));
    expect(row.status).toBe("draft");
    expect((await call("PATCH", `/v1/programs/${id}/status`, { status: "active", startsOn: addDays(today, -13) })).status).toBe(200);
  });

  test("starts-on moves an active program's start", async () => {
    const id = await draft(6);
    await call("PATCH", `/v1/programs/${id}/status`, { status: "active" });
    const earlier = addDays(today, -14);
    const r = await call("PATCH", `/v1/programs/${id}/starts-on`, { startsOn: earlier });
    expect(r.status).toBe(200);
    expect(r.body.startsOn).toBe(earlier);
  });

  test("starts-on 422s: bad date, too early, too late, missing, a draft", async () => {
    const id = await draft(2);
    expect((await call("PATCH", `/v1/programs/${id}/starts-on`, { startsOn: today })).status).toBe(422); // draft
    await call("PATCH", `/v1/programs/${id}/status`, { status: "active" });
    expect((await call("PATCH", `/v1/programs/${id}/starts-on`, { startsOn: "2026-13-01" })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/starts-on`, { startsOn: addDays(today, -14) })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/starts-on`, { startsOn: addDays(today, 57) })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/starts-on`, {})).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${id}/starts-on`, { startsOn: null })).status).toBe(422);
    expect((await call("PATCH", `/v1/programs/${crypto.randomUUID()}/starts-on`, { startsOn: today })).status).toBe(404);
  });
});
