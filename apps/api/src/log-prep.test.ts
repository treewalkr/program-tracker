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
  console.warn("Postgres unreachable — skipping movement prep log tests");
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
const set1 = [{ setNumber: 1, type: "working", reps: 5, amrap: false }];

describe.skipIf(!dbUp)("movement prep on a session log", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const programSessionId = crypto.randomUUID();
  const prepA = crypto.randomUUID();
  const prepB = crypto.randomUUID();
  const legacyPrep = crypto.randomUUID();
  const mainSlot = crypto.randomUUID();

  test("setup: a session with two prep items, a legacy movement_prep slot and one main lift", async () => {
    expect(await getDefaultTrainerId()).toBeTruthy();
    const c = await call("POST", "/v1/clients", { name: "Prep Client", email: `prep-${Date.now()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    const p = await call("POST", "/v1/programs", {
      name: "Prep Block",
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
              exercises: [
                { id: mainSlot, exerciseId: squatId, order: 0, prescribedSets: set1 },
                { id: prepA, exerciseId: squatId, order: 1, block: "prep", prescribedSets: set1 },
                { id: prepB, exerciseId: squatId, order: 2, block: "prep", prescribedSets: set1 },
                { id: legacyPrep, exerciseId: squatId, order: 3, role: "movement_prep", prescribedSets: set1 },
              ],
            },
          ],
        },
      ],
    });
    expect(p.status).toBe(201);
    programId = p.body.id;
    // Prep sorted first on the way in.
    expect(p.body.weeks[0].sessions[0].exercises.map((e: any) => e.id)).toEqual([prepA, prepB, legacyPrep, mainSlot]);
  });

  const base = () => ({
    clientId,
    programId,
    programSessionId,
    date: today(),
    onDuplicate: "add",
    sets: [{ programExerciseId: mainSlot, exerciseId: squatId, setNumber: 1, type: "working", weightKg: 80, reps: 5 }],
  });

  test("a set on a prep slot is a 422", async () => {
    for (const slot of [prepA, legacyPrep]) {
      const res = await call("POST", "/v1/logs/sessions", {
        ...base(),
        sets: [...base().sets, { programExerciseId: slot, exerciseId: squatId, setNumber: 1, type: "working", reps: 10 }],
      });
      expect(res.status).toBe(422);
      expect(res.body.ids).toEqual([slot]);
    }
  });

  test("a prep-only log is refused: it needs at least one main set", async () => {
    const res = await call("POST", "/v1/logs/sessions", { ...base(), sets: [], prepDone: [prepA, prepB] });
    expect(res.status).toBe(422);
  });

  test("prep_done keeps only the session's prep slot ids, in session order", async () => {
    const res = await call("POST", "/v1/logs/sessions", {
      ...base(),
      prepDone: [legacyPrep, mainSlot, crypto.randomUUID(), prepA],
    });
    expect(res.status).toBe(201);
    expect(res.body.prepDone).toEqual([prepA, legacyPrep]);
    const list = await call("GET", `/v1/logs/sessions?programId=${programId}`);
    expect(list.body.find((l: any) => l.id === res.body.id).prepDone).toEqual([prepA, legacyPrep]);
  });

  test("no ticks, or a freestyle log, stores an empty list", async () => {
    const plain = await call("POST", "/v1/logs/sessions", base());
    expect(plain.body.prepDone).toEqual([]);
    const free = await call("POST", "/v1/logs/sessions", { ...base(), programSessionId: null, prepDone: [prepA] });
    expect(free.status).toBe(201);
    expect(free.body.prepDone).toEqual([]);
  });

  test("a bad prepDone is a 422", async () => {
    expect((await call("POST", "/v1/logs/sessions", { ...base(), prepDone: "all" })).status).toBe(422);
    expect((await call("POST", "/v1/logs/sessions", { ...base(), prepDone: [""] })).status).toBe(422);
  });
});
