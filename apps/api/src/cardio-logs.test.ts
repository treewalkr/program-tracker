import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { clientHrProfiles, clients, db, trainers } from "@pt/db";
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
afterAll(async () => {
  for (const id of clientIds) await db.delete(clients).where(eq(clients.id, id));
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
