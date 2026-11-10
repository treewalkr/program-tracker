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
});
