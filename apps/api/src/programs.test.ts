import { describe, expect, test, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import { db, trainers, programs } from "@pt/db";
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

/** Smallest valid weeks document: one lifting session with one set. */
const weeksWith = (exerciseId: string) => [
  {
    week: 1,
    sessions: [
      {
        id: crypto.randomUUID(),
        name: "Day A",
        seq: 1,
        order: 0,
        kind: "lifting",
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
