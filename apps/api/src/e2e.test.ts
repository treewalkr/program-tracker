import { describe, expect, test } from "bun:test";
import { db, trainers } from "@pt/db";
import { app } from "./app";

/** Integration tests need a live Postgres (bun run db:up). Skip otherwise. */
let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping e2e tests");
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

describe.skipIf(!dbUp)("full trainer loop (mock provider)", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  let benchId = "";

  test("health", async () => {
    const { status, body } = await call("GET", "/health");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("create client", async () => {
    const { status, body } = await call("POST", "/v1/clients", {
      name: "E2E Client",
      email: `e2e-${Date.now()}@test.dev`,
      goals: "press 100kg",
      daysPerWeek: 2,
    });
    expect(status).toBe(201);
    clientId = body.id;
  });

  test("find seeded exercises", async () => {
    const { body } = await call("GET", "/v1/exercises?q=squat");
    expect(body.length).toBeGreaterThan(0);
    squatId = body[0].id;
    const bench = await call("GET", "/v1/exercises?q=bench%20press");
    expect(bench.body.length).toBeGreaterThan(0);
    benchId = bench.body[0].id;
  });

  test("create + activate program", async () => {
    const { status, body } = await call("POST", "/v1/programs", {
      name: "E2E Block 1",
      clientId,
      sessions: [
        {
          id: crypto.randomUUID(),
          name: "Day A",
          order: 0,
          exercises: [
            {
              id: crypto.randomUUID(),
              exerciseId: squatId,
              order: 0,
              prescribedSets: [
                { setNumber: 1, type: "warm_up", reps: 5, amrap: false },
                { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8 },
              ],
            },
          ],
        },
      ],
    });
    expect(status).toBe(201);
    programId = body.id;

    const act = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(act.body.status).toBe("active");
  });

  test("log a session on behalf of the client", async () => {
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: new Date().toISOString().slice(0, 10),
      perceivedEnergy: 7,
      sets: [
        { exerciseId: squatId, setNumber: 1, type: "warm_up", weightKg: 60, reps: 5 },
        { exerciseId: squatId, setNumber: 2, type: "working", weightKg: 100, reps: 5, rpe: 8 },
        { exerciseId: benchId, setNumber: 1, type: "working", weightKg: 80, reps: 5, rpe: 8 },
      ],
    });
    expect(status).toBe(201);
    expect(body.sets).toHaveLength(3);
  });

  test("history aggregates e1RM and set strings", async () => {
    const { body } = await call("GET", `/v1/logs/history?clientId=${clientId}`);
    const squat = body.history.find((h: any) => h.exerciseId === squatId);
    expect(squat).toBeDefined();
    expect(squat.bestE1rm).toBeGreaterThan(0);
    expect(squat.recentSets.some((s: string) => s.includes("100kg × 5 @ RPE 8"))).toBe(true);
  });

  test("generate (mock) → validate → store draft", async () => {
    const { status, body } = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
    });
    expect(status).toBe(201);
    expect(body.status).toBe("validated");
    expect(body.draft.sessions.length).toBeGreaterThan(0);
    (globalThis as any).__genId = body.id;
  });

  test("approve creates an AI-assisted DRAFT program (not client-visible)", async () => {
    const { status, body } = await call("POST", `/v1/ai/generations/${(globalThis as any).__genId}/approve`, {});
    expect(status).toBe(201);
    expect(body.aiAssisted).toBe(true);
    expect(body.status).toBe("draft");
    expect(body.createdFromProgramId).toBe(programId);
    expect(body.clientId).toBe(clientId);

    // original program stays active until the trainer promotes the draft
    const original = await call("GET", `/v1/programs/${programId}`);
    expect(original.body.status).toBe("active");
  });

  test("reject on non-validated generation is a 409", async () => {
    const { status } = await call("POST", `/v1/ai/generations/${(globalThis as any).__genId}/approve`, {});
    expect(status).toBe(409); // already approved
  });

  test("bad log payload is rejected 422", async () => {
    const { status } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: "not-a-date",
      sets: [],
    });
    expect(status).toBe(422);
  });
});
