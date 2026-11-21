import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { clientHrProfiles, clients, db, programs, sessionLogs, trainers } from "@pt/db";
import { computeHrZones } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping cardio log tests");
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

const clientIds: string[] = [];
const trainerIds: string[] = [];
afterAll(async () => {
  for (const id of clientIds) await db.delete(clients).where(eq(clients.id, id));
  for (const id of trainerIds) await db.delete(trainers).where(eq(trainers.id, id));
});

describe.skipIf(!dbUp)("log snapshot", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const liftId = crypto.randomUUID();
  const slotId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const intervals = [
    { id: "w", type: "warmup", durationSec: 600, hrZone: 2 },
    { id: "r", type: "work", repeat: 4, durationSec: 180, hrZone: 4, recovery: { durationSec: 120 } },
  ];
  const weeks = (reps: number, workSec: number) => [
    {
      week: 1,
      sessions: [
        {
          id: liftId,
          name: "Lower",
          seq: 1,
          order: 0,
          weekday: 1,
          kind: "exercises",
          exercises: [{ id: slotId, exerciseId: squatId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps }] }],
        },
        {
          id: runId,
          name: "Intervals",
          seq: 1,
          order: 0,
          weekday: 3,
          kind: "cardio",
          exercises: [],
          cardio: { modality: "Running", intervals: intervals.map((iv) => (iv.id === "r" ? { ...iv, durationSec: workSec } : iv)) },
        },
      ],
    },
  ];

  test("setup: client with an HR profile, program with a lift and an interval run", async () => {
    const c = await call("POST", "/v1/clients", { name: "ZZ Snapshot", sessionsPerWeek: 1 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    clientIds.push(clientId);
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    const p = await call("POST", "/v1/programs", { name: "ZZ Snapshot block", clientId, weeks: weeks(5, 180) });
    expect(p.status).toBe(201);
    programId = p.body.id;
    const zones = (max: number) => computeHrZones("hrmax", { maxHr: max })!;
    await db.insert(clientHrProfiles).values([
      { clientId, version: 1, effectiveFrom: "2026-09-01", method: "hrmax", maxHr: 190, zones: zones(190) },
      { clientId, version: 2, effectiveFrom: "2026-11-10", method: "hrmax", maxHr: 186, zones: zones(186) },
    ]);
  });

  test("a log stores the session it fulfils, and a later program edit doesn't change it", async () => {
    const lift = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: liftId,
      date: "2026-11-03",
      sets: [{ programExerciseId: slotId, exerciseId: squatId, setNumber: 1, weightKg: 100, reps: 5 }],
    });
    expect(lift.status).toBe(201);
    expect(lift.body.prescription).toMatchObject({ programVersion: 1, session: { id: liftId, name: "Lower" } });
    expect(lift.body.prescription.zonesBpm).toBeUndefined();

    const edit = await call("PUT", `/v1/programs/${programId}`, { weeks: weeks(8, 240) });
    expect(edit.status).toBe(200);

    const logs = (await call("GET", `/v1/logs/sessions?clientId=${clientId}`)).body;
    const saved = logs.find((l: any) => l.id === lift.body.id);
    expect(saved.prescription.session.exercises[0].prescribedSets[0].reps).toBe(5);
  });

  test("a cardio log takes the zones of the HR profile in effect on its date", async () => {
    const early = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: runId,
      date: "2026-11-05",
      kind: "cardio",
      cardio: { modality: "Running", durationSec: 1980, rpe: 7 },
      sets: [],
    });
    expect(early.status).toBe(201);
    expect(early.body.prescription.hrProfileVersion).toBe(1);
    expect(early.body.prescription.zonesBpm[1]).toEqual({ zone: 2, min: 114, max: 132 });
    expect(early.body.prescription.session.cardio.intervals[1].durationSec).toBe(240);

    const late = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: runId,
      date: "2026-11-12",
      kind: "cardio",
      cardio: { modality: "Running", durationSec: 1980, rpe: 7 },
      sets: [],
      onDuplicate: "add",
    });
    expect(late.status).toBe(201);
    expect(late.body.prescription.hrProfileVersion).toBe(2);
  });

  test("a freestyle log has no snapshot", async () => {
    const free = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: "2026-11-06",
      kind: "cardio",
      cardio: { modality: "Walking", durationSec: 1200, rpe: 3 },
      sets: [],
    });
    expect(free.status).toBe(201);
    expect(free.body.prescription).toBeNull();
  });
});

describe.skipIf(!dbUp)("cardio log rules and review", () => {
  let clientId = "";
  let programId = "";
  const runId = crypto.randomUUID();
  const log = (cardio: unknown, extra: object = {}) =>
    call("POST", "/v1/logs/sessions", { clientId, programId, programSessionId: runId, date: "2026-11-05", kind: "cardio", cardio, sets: [], onDuplicate: "add", ...extra });

  test("setup", async () => {
    const c = await call("POST", "/v1/clients", { name: "ZZ Rules", sessionsPerWeek: 1 });
    clientId = c.body.id;
    clientIds.push(clientId);
    const p = await call("POST", "/v1/programs", {
      name: "ZZ Rules block",
      clientId,
      weeks: [{ week: 1, sessions: [{ id: runId, name: "Easy", seq: 1, order: 0, kind: "cardio", exercises: [], cardio: { modality: "Running", durationMin: 40 } }] }],
    });
    programId = p.body.id;
  });

  test("a completed log needs its time and session RPE; a skipped one only a reason", async () => {
    expect((await log({ modality: "Running", durationSec: 2400 })).status).toBe(422);
    expect((await log({ modality: "Running", rpe: 4 })).status).toBe(422);
    expect((await log({ modality: "Running", durationSec: 2400, rpe: 4, avgHr: 150, maxHr: 140 })).status).toBe(422);
    expect((await log({ modality: "Running", skipped: { reason: "nope" } })).status).toBe(422);
    const skipped = await log({ modality: "Running", skipped: { reason: "time" } });
    expect(skipped.status).toBe(201);
    expect(skipped.body.cardio).toEqual({ modality: "Running", skipped: { reason: "time" } });
  });

  test("a completed log stores seconds and mirrors rounded minutes", async () => {
    const r = await log({
      modality: "Running",
      durationSec: 42 * 60 + 15,
      rpe: 4,
      distanceKm: 6.2,
      avgHr: 148,
      maxHr: 171,
      pain: { reported: true, note: "left calf" },
      intervals: [{ intervalId: "w", rep: 1, durationSec: 600 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.cardio).toMatchObject({ durationSec: 2535, durationMin: 42, avgHr: 148, maxHr: 171, pain: { reported: true } });
  });

  test("review stamps the log and sets feedback; un-review clears the stamp", async () => {
    const r = await log({ modality: "Running", durationSec: 1800, rpe: 5 });
    const id = r.body.id;
    expect(r.body.reviewedAt).toBeNull();
    const rev = await call("PATCH", `/v1/logs/sessions/${id}/review`, { reviewed: true, feedback: "  Nice even pacing.  " });
    expect(rev.status).toBe(200);
    expect(rev.body.trainerFeedback).toBe("Nice even pacing.");
    expect(rev.body.reviewedAt).toBeTruthy();
    expect(rev.body.reviewedBy).toBeTruthy();
    const listed = (await call("GET", `/v1/logs/sessions?clientId=${clientId}`)).body.find((l: any) => l.id === id);
    expect(listed).toMatchObject({ trainerFeedback: "Nice even pacing.", reviewedBy: rev.body.reviewedBy });
    const keep = await call("PATCH", `/v1/logs/sessions/${id}/review`, { reviewed: false });
    expect(keep.body).toMatchObject({ reviewedAt: null, reviewedBy: null, trainerFeedback: "Nice even pacing." });
    const clear = await call("PATCH", `/v1/logs/sessions/${id}/review`, { reviewed: true, feedback: null });
    expect(clear.body.trainerFeedback).toBeNull();
  });

  test("review refuses a bad body (422) and another trainer's log (404)", async () => {
    const r = await log({ modality: "Running", durationSec: 1800, rpe: 5 });
    const path = `/v1/logs/sessions/${r.body.id}/review`;
    expect((await call("PATCH", path, {})).status).toBe(422);
    expect((await call("PATCH", path, { reviewed: "yes" })).status).toBe(422);
    expect((await call("PATCH", path, { reviewed: true, feedback: "x".repeat(2001) })).status).toBe(422);
    expect((await call("PATCH", "/v1/logs/sessions/not-a-uuid/review", { reviewed: true })).status).toBe(422);
    expect((await call("PATCH", `/v1/logs/sessions/${crypto.randomUUID()}/review`, { reviewed: true })).status).toBe(404);

    const [other] = await db.insert(trainers).values({ name: "ZZ Other", email: `zz-other-review-${Date.now()}@test.dev` }).returning();
    trainerIds.push(other.id);
    const [otherClient] = await db.insert(clients).values({ trainerId: other.id, name: "ZZ Theirs" }).returning();
    const [otherProgram] = await db.insert(programs).values({ trainerId: other.id, clientId: otherClient.id, name: "Theirs", sessions: [] }).returning();
    const [theirs] = await db.insert(sessionLogs).values({ clientId: otherClient.id, programId: otherProgram.id, date: "2026-11-05" }).returning();
    expect((await call("PATCH", `/v1/logs/sessions/${theirs.id}/review`, { reviewed: true, feedback: "mine now" })).status).toBe(404);
    const [still] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, theirs.id));
    expect(still.reviewedAt).toBeNull();
    expect(still.trainerFeedback).toBeNull();
  });
});
