import { describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { db, trainers, signalOutbox, sessionLogs } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";
import { getDefaultTrainerId } from "./lib/trainer";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping log flag tests");
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

const today = () => new Date().toISOString().slice(0, 10);

describe.skipIf(!dbUp)("session log flags and readiness", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const programSessionId = crypto.randomUUID();
  const slotId = crypto.randomUUID();

  test("setup: client, active program", async () => {
    // Acts as the default trainer — the one the routes resolve without a session.
    expect(await getDefaultTrainerId()).toBeTruthy();
    const c = await call("POST", "/v1/clients", { name: "Flag Client", email: `flags-${Date.now()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    const p = await call("POST", "/v1/programs", {
      name: "Flag Block",
      clientId,
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: programSessionId,
              name: "Day A",
              seq: 1,
              order: 0,
              kind: "lifting",
              exercises: [
                { id: slotId, exerciseId: squatId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
              ],
            },
          ],
        },
      ],
    });
    expect(p.status).toBe(201);
    programId = p.body.id;
    expect((await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" })).status).toBe(200);
  });

  const base = () => ({
    clientId,
    programId,
    date: today(),
    sets: [{ programExerciseId: slotId, exerciseId: squatId, setNumber: 1, type: "working", weightKg: 80, reps: 5 }],
  });

  test("readiness and flags round-trip through POST and GET", async () => {
    const flags = [
      { programExerciseId: slotId, exerciseId: squatId, kind: "technique", note: "hips shoot up" },
      { programExerciseId: null, exerciseId: squatId, kind: "skipped", reason: "equipment" },
    ];
    const res = await call("POST", "/v1/logs/sessions", { ...base(), perceivedEnergy: 6, readiness: { sleep: 2, soreness: 4 }, flags });
    expect(res.status).toBe(201);
    expect(res.body.readiness).toEqual({ sleep: 2, soreness: 4 });
    expect(res.body.flags).toEqual(flags);
    const list = await call("GET", `/v1/logs/sessions?clientId=${clientId}`);
    const got = list.body.find((l: any) => l.id === res.body.id);
    expect(got.readiness).toEqual({ sleep: 2, soreness: 4 });
    expect(got.flags).toEqual(flags);
    expect(got.perceivedEnergy).toBe(6);
  });

  test("bad readiness or flags are a 422", async () => {
    const bad = [
      { readiness: { sleep: 6 } },
      { readiness: { soreness: 0 } },
      { readiness: { stress: 3 } },
      { flags: [{ programExerciseId: null, exerciseId: squatId, kind: "ouch" }] },
      { flags: [{ programExerciseId: null, exerciseId: squatId, kind: "pain", reason: "time" }] },
      { flags: [{ programExerciseId: null, exerciseId: squatId, kind: "skipped", reason: "bored" }] },
      { flags: [{ programExerciseId: null, exerciseId: squatId, kind: "pain", note: "x".repeat(281) }] },
      { flags: [{ programExerciseId: null, exerciseId: "nope", kind: "pain" }] },
    ];
    for (const extra of bad) {
      const res = await call("POST", "/v1/logs/sessions", { ...base(), ...extra });
      expect(res.status).toBe(422);
    }
  });

  test("a log without them, an empty readiness or an empty flag list reads as null", async () => {
    const plain = await call("POST", "/v1/logs/sessions", base());
    expect(plain.status).toBe(201);
    expect(plain.body.readiness).toBeNull();
    expect(plain.body.flags).toBeNull();
    const empty = await call("POST", "/v1/logs/sessions", { ...base(), readiness: {}, flags: [] });
    expect(empty.body.readiness).toBeNull();
    expect(empty.body.flags).toBeNull();
    // An old row written before the columns existed.
    const [old] = await db.insert(sessionLogs).values({ clientId, programId, date: "2020-02-02" }).returning();
    const list = await call("GET", `/v1/logs/sessions?clientId=${clientId}`);
    const got = list.body.find((l: any) => l.id === old.id);
    expect(got.readiness).toBeNull();
    expect(got.flags).toBeNull();
  });

  test("replace keeps the new log's readiness and flags", async () => {
    const first = await call("POST", "/v1/logs/sessions", {
      ...base(),
      programSessionId,
      readiness: { sleep: 4 },
      flags: [{ programExerciseId: slotId, exerciseId: squatId, kind: "technique" }],
    });
    expect(first.status).toBe(201);
    const flags = [{ programExerciseId: slotId, exerciseId: squatId, kind: "pain", note: "knee twinge" }];
    const replaced = await call("POST", "/v1/logs/sessions", {
      ...base(),
      programSessionId,
      onDuplicate: "replace",
      readiness: { soreness: 5 },
      flags,
    });
    expect(replaced.status).toBe(201);
    const mine = (await call("GET", `/v1/logs/sessions?programId=${programId}`)).body.filter(
      (l: any) => l.programSessionId === programSessionId
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].readiness).toEqual({ soreness: 5 });
    expect(mine[0].flags).toEqual(flags);
  });

  test("a pain flag raises a pain-flag signal and queues it for the outbox", async () => {
    const feed = await call("GET", "/v1/notifications");
    const pain = feed.body.signals.find((s: any) => s.kind === "pain-flag" && s.clientId === clientId);
    expect(pain).toBeDefined();
    expect(pain.id).toBe(`pain-flag:${clientId}:${squatId}:${today()}`);
    expect(pain.title).toContain("Pain flagged");
    expect(pain.evidence).toContain("“knee twinge”");
    expect(pain.programId).toBe(programId);
    const [queued] = await db.select().from(signalOutbox).where(eq(signalOutbox.signalId, pain.id));
    expect(queued?.kind).toBe("pain-flag");

    // Snoozing hides it, like any other signal.
    const until = new Date(Date.now() + 7 * 86400_000).toISOString();
    expect((await call("PUT", `/v1/notifications/${encodeURIComponent(pain.id)}/snooze`, { until })).status).toBe(200);
    const after = await call("GET", "/v1/notifications");
    expect(after.body.signals.some((s: any) => s.id === pain.id)).toBe(false);
  });

  test("cleanup outbox rows", async () => {
    await db.delete(signalOutbox).where(like(signalOutbox.signalId, `pain-flag:${clientId}:%`));
  });
});
