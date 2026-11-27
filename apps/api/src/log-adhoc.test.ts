import { describe, expect, test } from "bun:test";
import { db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";
import { getDefaultTrainerId } from "./lib/trainer";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping ad-hoc log tests");
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

/** FB-029: the trainer adds an exercise the program session doesn't have; it saves with no program slot. */
describe.skipIf(!dbUp)("ad-hoc exercise on a session log", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  let flyId = "";
  const programSessionId = crypto.randomUUID();
  const slotId = crypto.randomUUID();

  test("setup: client, active program, an exercise outside the session", async () => {
    expect(await getDefaultTrainerId()).toBeTruthy();
    const c = await call("POST", "/v1/clients", { name: "Adhoc Client", email: `adhoc-${Date.now()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    // a library exercise made on the spot, like the picker's "New exercise"
    const fly = await call("POST", "/v1/exercises", { name: `Adhoc fly ${Date.now()}`, primaryMuscleGroup: "chest", equipment: "cable" });
    expect(fly.status).toBe(201);
    flyId = fly.body.id;
    const p = await call("POST", "/v1/programs", {
      name: "Adhoc Block",
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
              kind: "exercises",
              exercises: [{ id: slotId, exerciseId: squatId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
            },
          ],
        },
      ],
    });
    expect(p.status).toBe(201);
    programId = p.body.id;
    expect((await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" })).status).toBe(200);
  });

  test("programmed and ad-hoc sets save together and read back, the ad-hoc ones by exercise with no slot", async () => {
    const saved = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId,
      date: today(),
      flags: [{ programExerciseId: null, exerciseId: flyId, kind: "technique", note: "elbows" }],
      sets: [
        { programExerciseId: slotId, exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5 },
        { programExerciseId: null, exerciseId: flyId, setNumber: 1, type: "working", weightKg: 17.5, reps: 12, rpe: 8 },
        { programExerciseId: null, exerciseId: flyId, setNumber: 2, type: "working", reps: 10 },
      ],
    });
    expect(saved.status).toBe(201);

    const list = await call("GET", `/v1/logs/sessions?clientId=${clientId}`);
    const got = list.body.find((l: any) => l.id === saved.body.id);
    expect(got.sets).toHaveLength(3);
    const fly = got.sets.filter((s: any) => s.exerciseId === flyId).sort((a: any, b: any) => a.setNumber - b.setNumber);
    expect(fly.map((s: any) => [s.programExerciseId, s.setNumber, s.reps])).toEqual([
      [null, 1, 12],
      [null, 2, 10],
    ]);
    expect(Number(fly[0].weightKg)).toBe(17.5);
    expect(Number(fly[0].rpe)).toBe(8);
    expect(fly[1].weightKg ?? null).toBeNull();
    // the programmed set keeps its slot
    expect(got.sets.find((s: any) => s.exerciseId === squatId).programExerciseId).toBe(slotId);
    expect(got.flags).toEqual([{ programExerciseId: null, exerciseId: flyId, kind: "technique", note: "elbows" }]);
  });

  test("the program itself is untouched by an ad-hoc log", async () => {
    const p = await call("GET", `/v1/programs/${programId}`);
    expect(p.status).toBe(200);
    expect(p.body.weeks[0].sessions[0].exercises.map((e: any) => e.exerciseId)).toEqual([squatId]);
  });
});
