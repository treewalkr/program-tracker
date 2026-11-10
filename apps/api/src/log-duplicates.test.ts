import { describe, expect, test } from "bun:test";
import { db, trainers } from "@pt/db";
import { logToInput } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";
import { getDefaultTrainerId } from "./lib/trainer";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping log duplicate tests");
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

describe.skipIf(!dbUp)("session log duplicates", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const sessionA = crypto.randomUUID();
  const sessionB = crypto.randomUUID();
  const slotA = crypto.randomUUID();
  const slotB = crypto.randomUUID();

  const session = (id: string, slot: string, name: string, seq: number) => ({
    id,
    name,
    seq,
    order: seq - 1,
    kind: "lifting",
    exercises: [
      { id: slot, exerciseId: squatId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
    ],
  });

  const mine = (programSessionId: string) =>
    call("GET", `/v1/logs/sessions?clientId=${clientId}`).then((r) =>
      r.body.filter((l: any) => l.programSessionId === programSessionId)
    );

  test("setup: client, active program", async () => {
    expect(await getDefaultTrainerId()).toBeTruthy();
    const c = await call("POST", "/v1/clients", { name: "Dupe Client", email: `dupes-${Date.now()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    const p = await call("POST", "/v1/programs", {
      name: "Dupe Block",
      clientId,
      weeks: [{ week: 1, sessions: [session(sessionA, slotA, "Day A", 1), session(sessionB, slotB, "Day B", 2)] }],
    });
    expect(p.status).toBe(201);
    programId = p.body.id;
  });

  test("two concurrent reject-mode saves of one session: one lands, one is a 409", async () => {
    const body = {
      clientId,
      programId,
      programSessionId: sessionA,
      date: "2026-11-07",
      sets: [{ programExerciseId: slotA, exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5 }],
    };
    const results = await Promise.all([call("POST", "/v1/logs/sessions", body), call("POST", "/v1/logs/sessions", body)]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    const created = results.find((r) => r.status === 201)!;
    const conflict = results.find((r) => r.status === 409)!;
    expect(conflict.body).toEqual({ error: "already logged", existing: { id: created.body.id, date: "2026-11-07", setCount: 1 } });
    expect(await mine(sessionA)).toHaveLength(1);
  });

  test("replace returns the removed log; posting it back with logToInput restores every field", async () => {
    const strip = (l: any) => {
      const { id, createdAt, sets, ...rest } = l;
      return { ...rest, sets: sets.map(({ id, sessionLogId, createdAt, ...s }: any) => s) };
    };
    const original = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: sessionB,
      date: "2026-11-05",
      notes: "grindy last set",
      perceivedEnergy: 6,
      readiness: { sleep: 2, soreness: 4 },
      flags: [
        { programExerciseId: slotB, exerciseId: squatId, kind: "pain", note: "left knee" },
        { programExerciseId: null, exerciseId: squatId, kind: "skipped", reason: "time" },
      ],
      sets: [
        { programExerciseId: slotB, exerciseId: squatId, setNumber: 1, type: "backoff", weightKg: 60, reps: 5 },
        { programExerciseId: slotB, exerciseId: squatId, setNumber: 2, type: "working", weightKg: 102.5, reps: 4, rpe: 8.5 },
        { programExerciseId: null, exerciseId: squatId, setNumber: 3, type: "working", reps: 12, rpe: 7 },
      ],
    });
    expect(original.status).toBe(201);
    expect(original.body.replaced).toEqual([]);
    const [before] = await mine(sessionB);

    const replacing = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: sessionB,
      onDuplicate: "replace",
      date: "2026-11-07",
      sets: [{ programExerciseId: slotB, exerciseId: squatId, setNumber: 1, type: "working", weightKg: 110, reps: 3 }],
    });
    expect(replacing.status).toBe(201);
    expect(replacing.body.replaced).toHaveLength(1);
    expect(replacing.body.replaced[0].id).toBe(original.body.id);
    expect(strip(replacing.body.replaced[0])).toEqual(strip(before));

    // Undo: write the replaced log back, then remove the new one.
    const restored = await call("POST", "/v1/logs/sessions", logToInput(replacing.body.replaced[0]));
    expect(restored.status).toBe(201);
    expect((await call("DELETE", `/v1/logs/sessions/${replacing.body.id}`)).status).toBe(204);

    const after = await mine(sessionB);
    expect(after).toHaveLength(1);
    const byKey = (l: any) => ({ ...strip(l), sets: [...strip(l).sets].sort((a: any, b: any) => a.setNumber - b.setNumber) });
    expect(byKey(after[0])).toEqual(byKey(before));
  });

  test("a cardio log round-trips too", async () => {
    const cardio = { modality: "Bike", durationMin: 30, hrZone: 2, distanceKm: 12.5, rpe: 6 };
    const first = await call("POST", "/v1/logs/sessions", { clientId, programId, date: "2026-11-04", kind: "cardio", cardio, sets: [] });
    expect(first.status).toBe(201);
    const again = await call("POST", "/v1/logs/sessions", logToInput(first.body));
    expect(again.status).toBe(201);
    expect(again.body.kind).toBe("cardio");
    expect(again.body.cardio).toEqual(cardio);
    expect(again.body.date).toBe("2026-11-04");
  });
});
