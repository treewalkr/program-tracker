import { describe, expect, test } from "bun:test";
import { db, trainers, signalOutbox } from "@pt/db";
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

  test("model override: unknown model for the provider is a 400", async () => {
    const { status, body } = await call("POST", "/v1/ai/generate", {
      clientId,
      providerId: "mock",
      model: "gpt-not-real",
    });
    expect(status).toBe(400);
    expect(body.error).toContain("not available");
  });

  test("model override: listed model is accepted and recorded", async () => {
    const { status, body } = await call("POST", "/v1/ai/generate", {
      clientId,
      providerId: "mock",
      model: "mock-draft-v1",
    });
    expect(status).toBe(201);
    expect(body.model).toBe("mock-draft-v1");
  });

  test("approve creates an AI-assisted DRAFT program (not client-visible)", async () => {
    const { status, body } = await call("POST", `/v1/ai/generations/${(globalThis as any).__genId}/approve`, {});
    expect(status).toBe(201);
    expect(body.aiAssisted).toBe(true);
    expect(body.status).toBe("draft");
    expect(body.createdFromProgramId).toBe(programId);
    expect(body.clientId).toBe(clientId);
    // mock draft proposes phasing — approve carries it into the program
    expect(body.phasing?.plannedWeeks).toBe(4);
    expect(body.phasing?.weeks?.some((w: any) => w.directive === "deload")).toBe(true);
    // every exercise carries its display name — the UI renders it directly
    for (const s of body.sessions) {
      for (const e of s.exercises) {
        expect(e.exerciseName, `exercise ${e.exerciseId} must have a display name`).toBeTruthy();
      }
    }

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

describe.skipIf(!dbUp)("phase L endpoints", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const sessions = () => [
    {
      id: crypto.randomUUID(),
      name: "Day A",
      order: 0,
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId: squatId,
          order: 0,
          prescribedSets: [{ setNumber: 1, type: "working", reps: 5 }],
        },
      ],
    },
  ];

  test("client created with trainingDays; program with phasing; activation stamps activatedAt once", async () => {
    const c = await call("POST", "/v1/clients", {
      name: "Phase L Client",
      email: `l-${Date.now()}@test.dev`,
      trainingDays: [1, 4],
    });
    expect(c.status).toBe(201);
    expect(c.body.trainingDays).toEqual([1, 4]);
    clientId = c.body.id;

    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;

    // 1-week block so block-ending fires deterministically at week 1
    const p = await call("POST", "/v1/programs", {
      name: "L Block",
      clientId,
      phasing: {
        plannedWeeks: 1,
        phase: "accumulation",
        nextPhase: "intensification",
        deloadWeeks: [],
        weeks: [{ week: 1, directive: "base" }],
      },
      sessions: sessions(),
    });
    expect(p.status).toBe(201);
    expect(p.body.phasing.plannedWeeks).toBe(1);
    expect(p.body.activatedAt).toBeNull();
    programId = p.body.id;

    const act = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(act.body.status).toBe("active");
    expect(act.body.activatedAt).toBeTruthy();
    const firstActivation = act.body.activatedAt;

    // archive + reactivate: first activation is the block anchor, never restamped
    await call("PATCH", `/v1/programs/${programId}/status`, { status: "archived" });
    const reactivated = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(reactivated.body.activatedAt).toBe(firstActivation);
  });

  test("invalid phasing document is a 422", async () => {
    const { status } = await call("POST", "/v1/programs", {
      name: "Bad Phasing",
      clientId,
      phasing: { plannedWeeks: 99, phase: "x" },
      sessions: sessions(),
    });
    expect(status).toBe(422);
  });

  test("PUT replaces phasing; explicit null clears it", async () => {
    const replaced = await call("PUT", `/v1/programs/${programId}`, {
      sessions: sessions(),
      phasing: {
        plannedWeeks: 3,
        phase: "intensification",
        deloadWeeks: [3],
        weeks: [{ week: 1, directive: "base" }],
      },
    });
    expect(replaced.body.phasing.plannedWeeks).toBe(3);

    const cleared = await call("PUT", `/v1/programs/${programId}`, {
      sessions: sessions(),
      phasing: null,
    });
    expect(cleared.body.phasing).toBeNull();

    // restore the 1-week phasing for the notification tests below
    const restored = await call("PUT", `/v1/programs/${programId}`, {
      sessions: sessions(),
      phasing: {
        plannedWeeks: 1,
        phase: "accumulation",
        nextPhase: "intensification",
        deloadWeeks: [],
        weeks: [{ week: 1, directive: "base" }],
      },
    });
    expect(restored.body.phasing.plannedWeeks).toBe(1);
  });

  test("client PATCH accepts trainingDays", async () => {
    const { body } = await call("PATCH", `/v1/clients/${clientId}`, { trainingDays: [2, 4, 6] });
    expect(body.trainingDays).toEqual([2, 4, 6]);
  });

  test("periodization schemes CRUD", async () => {
    const created = await call("POST", "/v1/schemes", {
      name: "3:1 block (e2e)",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "deload" },
      ],
    });
    expect(created.status).toBe(201);
    const schemeId = created.body.id;

    const list = await call("GET", "/v1/schemes");
    expect(list.body.schemes.some((s: any) => s.id === schemeId)).toBe(true);

    // non-contiguous weeks are rejected
    const bad = await call("POST", "/v1/schemes", {
      name: "gappy",
      weeks: [
        { week: 1, directive: "base" },
        { week: 3, directive: "deload" },
      ],
    });
    expect(bad.status).toBe(422);

    const del = await call("DELETE", `/v1/schemes/${schemeId}`);
    expect(del.status).toBe(204);
    expect((await call("DELETE", `/v1/schemes/${schemeId}`)).status).toBe(404);
  });

  test("instruction templates CRUD", async () => {
    const created = await call("POST", "/v1/ai/prompt-templates", {
      name: "RPE cap 8",
      content: "Never prescribe working sets above RPE 8.",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await call("GET", "/v1/ai/prompt-templates");
    expect(list.body.templates.some((t: any) => t.id === id)).toBe(true);

    const updated = await call("PUT", `/v1/ai/prompt-templates/${id}`, {
      name: "RPE cap 7",
      content: "Never prescribe working sets above RPE 7.",
    });
    expect(updated.body.name).toBe("RPE cap 7");
    expect(updated.body.updatedAt).toBeTruthy();

    const missing = await call("PUT", `/v1/ai/prompt-templates/${crypto.randomUUID()}`, {
      name: "x",
      content: "y",
    });
    expect(missing.status).toBe(404);

    expect((await call("DELETE", `/v1/ai/prompt-templates/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/v1/ai/prompt-templates/${id}`)).status).toBe(404);
  });

  test("log write queues new signals into the outbox (deduped)", async () => {
    const log = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: new Date().toISOString().slice(0, 10),
      sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8 }],
    });
    expect(log.status).toBe(201);

    const rows = await db.select().from(signalOutbox);
    const queued = rows.filter((r) => (r.payload as any).programId === programId);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.some((r) => r.signalId === `block-ending:${programId}`)).toBe(true);

    // second log of the same state → PK conflict dedupes, no new row for the same id
    await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: new Date().toISOString().slice(0, 10),
      sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8 }],
    });
    const after = (await db.select().from(signalOutbox)).filter(
      (r) => (r.payload as any).programId === programId
    );
    expect(after.filter((r) => r.signalId === `block-ending:${programId}`)).toHaveLength(1);
  });

  test("notifications: read computes signals, snooze filters them", async () => {
    const feed = await call("GET", "/v1/notifications");
    expect(feed.status).toBe(200);
    const signal = feed.body.signals.find((s: any) => s.id === `block-ending:${programId}`);
    expect(signal).toBeDefined();
    expect(signal.clientId).toBe(clientId);
    expect(signal.severity).toBe("urgent");

    const until = new Date(Date.now() + 7 * 86400_000).toISOString();
    expect((await call("PUT", `/v1/notifications/${encodeURIComponent(`block-ending:${programId}`)}/snooze`, { until })).status).toBe(200);
    expect((await call("PUT", `/v1/notifications/${encodeURIComponent("bogus")}/snooze`, { until: "nope" })).status).toBe(422);

    const filtered = await call("GET", "/v1/notifications");
    expect(filtered.body.signals.some((s: any) => s.id === `block-ending:${programId}`)).toBe(false);
  });
});
