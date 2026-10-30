import { describe, expect, test } from "bun:test";
import { db, trainers, signalOutbox } from "@pt/db";
import { EXERCISE_ROLES } from "@pt/shared";
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

  let programSessionId = "";

  test("create + activate program", async () => {
    programSessionId = crypto.randomUUID();
    const { status, body } = await call("POST", "/v1/programs", {
      name: "E2E Block 1",
      clientId,
      weeks: [
        {
          week: 1,
          days: [
            {
              id: crypto.randomUUID(),
              day: 1,
              sessions: [
                {
                  id: programSessionId,
                  name: "Day A",
                  order: 0,
                  kind: "lifting",
                  exercises: [
                    {
                      id: crypto.randomUUID(),
                      exerciseId: squatId,
                      order: 0,
                      prescribedSets: [
                        { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(status).toBe(201);
    expect(body.weeks).toBeDefined();
    programId = body.id;

    const act = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(act.body.status).toBe("active");
  });

  test("log a session on behalf of the client", async () => {
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId,
      date: new Date().toISOString().slice(0, 10),
      perceivedEnergy: 7,
      sets: [
        { exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8 },
        { exerciseId: benchId, setNumber: 1, type: "working", weightKg: 80, reps: 5, rpe: 8 },
      ],
    });
    expect(status).toBe(201);
    expect(body.sets).toHaveLength(2);
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

  test("GET /v1/ai/generations/:id returns the generation", async () => {
    const genId = (globalThis as any).__genId;
    const { status, body } = await call("GET", `/v1/ai/generations/${genId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(genId);
    expect(body.status).toBe("validated");
    expect(body.draft).toBeDefined();
    expect(body.draft.sessions.length).toBeGreaterThan(0);
  });

  test("GET /v1/ai/generations/:id 404s for unknown id", async () => {
    const { status, body } = await call("GET", `/v1/ai/generations/${crypto.randomUUID()}`);
    expect(status).toBe(404);
    expect(body.error).toBe("generation not found");
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
    // every week's days include the cardio day
    for (const w of body.weeks) {
      expect(w.days).toHaveLength(3);
      const cardio = w.days[2].sessions[0];
      expect(cardio.kind).toBe("cardio");
      expect(cardio.cardio?.modality).toBe("Bike");
      expect(cardio.exercises).toEqual([]);
    }
    // every exercise carries its display name — the UI renders it directly
    expect(body.weeks).toHaveLength(4);
    for (const w of body.weeks) {
      for (const d of w.days) {
        for (const s of d.sessions) {
          for (const e of s.exercises) {
            expect(e.exerciseName, `exercise ${e.exerciseId} must have a display name`).toBeTruthy();
          }
          // the mock draft roles every exercise and approve sorts by role rank
          const ranks = s.exercises.map((e: any) => EXERCISE_ROLES.indexOf(e.role));
          expect(ranks.every((r: number) => r >= 0), "every exercise must carry a role").toBe(true);
          expect(
            ranks.every((r: number, i: number) => i === 0 || r >= ranks[i - 1]),
            "session exercises must be sorted power → primary → strength → accessory → core"
          ).toBe(true);
        }
      }
    }

    // original program stays active until the trainer promotes the draft
    const original = await call("GET", `/v1/programs/${programId}`);
    expect(original.body.status).toBe("active");
  });

  test("generate with direction stores it; approve copies it onto the program", async () => {
    const genRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
      direction: "Build squat volume; keep upper body at maintenance.",
    });
    expect(genRes.status).toBe(201);
    expect(genRes.body.direction).toBe("Build squat volume; keep upper body at maintenance.");

    const approveRes = await call("POST", `/v1/ai/generations/${genRes.body.id}/approve`, {});
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.direction).toBe("Build squat volume; keep upper body at maintenance.");
  });

  test("approve assigns weekday defaults from client trainingDays", async () => {
    const cRes = await call("POST", "/v1/clients", {
      name: "TrainingDays Client",
      email: `td-${Date.now()}@test.dev`,
      trainingDays: [1, 2],
    });
    expect(cRes.status).toBe(201);
    const cId = cRes.body.id;

    const genRes = await call("POST", "/v1/ai/generate", {
      clientId: cId,
      providerId: "mock",
    });
    expect(genRes.status).toBe(201);

    const appRes = await call("POST", `/v1/ai/generations/${genRes.body.id}/approve`, {});
    expect(appRes.status).toBe(201);
    const approved = appRes.body;
    expect(approved.weeks[0].days).toHaveLength(3);
    const weekdays = approved.weeks[0].days.map((d: any) => d.weekday);
    expect(weekdays).toEqual([1, 2, null]);
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

  let revisionParentId = "";
  let revisionChildId = "";

  test("revise creates a validated child generation (mock)", async () => {
    const genRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
    });
    expect(genRes.status).toBe(201);
    expect(genRes.body.status).toBe("validated");
    revisionParentId = genRes.body.id;

    const message = "swap bench for incline DB; cut one RDL set";
    const { status, body } = await call("POST", `/v1/ai/generations/${revisionParentId}/revise`, {
      message,
    });
    expect(status).toBe(201);
    expect(body.parentGenerationId).toBe(revisionParentId);
    expect(body.revisionMessage).toBe(message);
    expect(body.status).toBe("validated");
    expect(body.draft.rationale).toContain(message);
    revisionChildId = body.id;

    const list = await call("GET", `/v1/ai/generations?clientId=${clientId}`);
    expect(list.body.some((g: any) => g.id === body.id)).toBe(true);
  });

  test("revise error paths: 404 unknown id, 409 non-validated, 422 blank message", async () => {
    const notFound = await call("POST", `/v1/ai/generations/${crypto.randomUUID()}/revise`, {
      message: "some note",
    });
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toBe("generation not found");

    const nonValidated = await call("POST", `/v1/ai/generations/${(globalThis as any).__genId}/revise`, {
      message: "some note",
    });
    expect(nonValidated.status).toBe(409);
    expect(nonValidated.body.error).toBe("generation is approved, not validated");

    const blank = await call("POST", `/v1/ai/generations/${revisionParentId}/revise`, {
      message: "   ",
    });
    expect(blank.status).toBe(422);
    expect(blank.body.error).toBe("message must not be empty");
  });

  test("revise chains: a revised child can be revised again (v3)", async () => {
    const message = "v3: increase squat weight";
    const { status, body } = await call("POST", `/v1/ai/generations/${revisionChildId}/revise`, {
      message,
    });
    expect(status).toBe(201);
    expect(body.parentGenerationId).toBe(revisionChildId);
    expect(body.revisionMessage).toBe(message);
    expect(body.status).toBe("validated");
    expect(body.draft.rationale).toContain(message);

    const list = await call("GET", `/v1/ai/generations?clientId=${clientId}`);
    expect(list.body.some((g: any) => g.id === revisionChildId)).toBe(true);
    expect(list.body.some((g: any) => g.id === body.id)).toBe(true);
  });
});

describe.skipIf(!dbUp)("phase L endpoints", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const weeksDoc = () => [
    {
      week: 1,
      days: [
        {
          id: crypto.randomUUID(),
          day: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day A",
              order: 0,
              kind: "lifting",
              exercises: [
                {
                  id: crypto.randomUUID(),
                  exerciseId: squatId,
                  order: 0,
                  prescribedSets: [{ setNumber: 1, type: "working", reps: 5 }],
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  test("non-contiguous weeks document is a 422", async () => {
    const { status, body } = await call("POST", "/v1/programs", {
      name: "Non-contiguous",
      clientId,
      weeks: [
        {
          week: 1,
          days: [
            {
              id: crypto.randomUUID(),
              day: 1,
              sessions: [
                {
                  id: crypto.randomUUID(),
                  name: "Day A",
                  order: 0,
                  kind: "lifting",
                  exercises: [
                    {
                      id: crypto.randomUUID(),
                      exerciseId: squatId,
                      order: 0,
                      prescribedSets: [{ setNumber: 1, type: "working", reps: 5 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          week: 3,
          days: [
            {
              id: crypto.randomUUID(),
              day: 1,
              sessions: [
                {
                  id: crypto.randomUUID(),
                  name: "Day B",
                  order: 0,
                  kind: "lifting",
                  exercises: [
                    {
                      id: crypto.randomUUID(),
                      exerciseId: squatId,
                      order: 0,
                      prescribedSets: [{ setNumber: 1, type: "working", reps: 5 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(status).toBe(422);
    expect(body.error).toBe("invalid weeks document");
  });

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
        weeks: [{ week: 1, directive: "base" }],
      },
      weeks: weeksDoc(),
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
      weeks: weeksDoc(),
    });
    expect(status).toBe(422);
  });

  test("PUT replaces phasing; explicit null clears it", async () => {
    const replaced = await call("PUT", `/v1/programs/${programId}`, {
      weeks: weeksDoc(),
      phasing: {
        plannedWeeks: 3,
        phase: "intensification",
        weeks: [{ week: 1, directive: "base" }],
      },
    });
    expect(replaced.body.phasing.plannedWeeks).toBe(3);

    const cleared = await call("PUT", `/v1/programs/${programId}`, {
      weeks: weeksDoc(),
      phasing: null,
    });
    expect(cleared.body.phasing).toBeNull();

    // restore the 1-week phasing for the notification tests below
    const restored = await call("PUT", `/v1/programs/${programId}`, {
      weeks: weeksDoc(),
      phasing: {
        plannedWeeks: 1,
        phase: "accumulation",
        nextPhase: "intensification",
        weeks: [{ week: 1, directive: "base" }],
      },
    });
    expect(restored.body.phasing.plannedWeeks).toBe(1);
  });

  test("program direction round-trips through POST, PUT and PATCH", async () => {
    const postRes = await call("POST", "/v1/programs", {
      name: "Direction Program",
      clientId,
      direction: "Build squat volume; keep upper body at maintenance.",
      weeks: weeksDoc(),
    });
    expect(postRes.status).toBe(201);
    expect(postRes.body.direction).toBe("Build squat volume; keep upper body at maintenance.");
    const progId = postRes.body.id;
    const initialVersion = postRes.body.version;

    // weeks-only PUT leaves direction untouched
    const putWeeksRes = await call("PUT", `/v1/programs/${progId}`, {
      weeks: weeksDoc(),
    });
    expect(putWeeksRes.status).toBe(200);
    expect(putWeeksRes.body.direction).toBe("Build squat volume; keep upper body at maintenance.");
    expect(putWeeksRes.body.version).toBe(initialVersion + 1);

    // PUT direction: null clears it
    const putNullRes = await call("PUT", `/v1/programs/${progId}`, {
      weeks: weeksDoc(),
      direction: null,
    });
    expect(putNullRes.status).toBe(200);
    expect(putNullRes.body.direction).toBeNull();

    // PATCH sets it without version bump
    const versionBeforePatch = putNullRes.body.version;
    const patchRes = await call("PATCH", `/v1/programs/${progId}/direction`, {
      direction: "Focus on deadlift speed.",
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.direction).toBe("Focus on deadlift speed.");
    expect(patchRes.body.version).toBe(versionBeforePatch);
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
        { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
        { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
        { week: 4, directive: "deload" },
      ],
    });
    expect(created.status).toBe(201);
    const schemeId = created.body.id;

    const list = await call("GET", "/v1/schemes");
    const found = list.body.schemes.find((s: any) => s.id === schemeId);
    expect(found).toBeDefined();
    expect(found.weeks[1].target).toEqual({ metric: "overall_volume", deltaPercent: 5 });

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

  test("POST /v1/exercises accepts taxonomy fields and echoes them", async () => {
    const { status, body } = await call("POST", "/v1/exercises", {
      name: "Custom Landmine Press",
      primaryMuscleGroup: "shoulders",
      equipment: "barbell",
      movementPattern: "vertical_push",
      functionalMovement: "push",
    });
    expect(status).toBe(201);
    expect(body.movementPattern).toBe("vertical_push");
    expect(body.functionalMovement).toBe("push");
  });

  test("PATCH /v1/exercises/:id reclassifies and can clear", async () => {
    const create = await call("POST", "/v1/exercises", {
      name: "Custom Cable Press",
      primaryMuscleGroup: "chest",
      equipment: "cable",
      movementPattern: "horizontal_push",
      functionalMovement: "push",
    });
    const id = create.body.id;

    // reclassify
    const patch1 = await call("PATCH", `/v1/exercises/${id}`, {
      movementPattern: "vertical_push",
    });
    expect(patch1.status).toBe(200);
    expect(patch1.body.movementPattern).toBe("vertical_push");
    expect(patch1.body.functionalMovement).toBe("push");

    // clear back to null
    const patch2 = await call("PATCH", `/v1/exercises/${id}`, {
      movementPattern: null,
      functionalMovement: null,
    });
    expect(patch2.status).toBe(200);
    expect(patch2.body.movementPattern).toBeNull();
    expect(patch2.body.functionalMovement).toBeNull();
  });

  test("PATCH /v1/exercises/:id rejects an unknown pattern with 422", async () => {
    const { status, body } = await call("PATCH", `/v1/exercises/${crypto.randomUUID()}`, {
      movementPattern: "bogus_pattern",
    });
    expect(status).toBe(422);
    expect(body.error).toBe("invalid movementPattern");
    expect(body.issues).toBeDefined();
  });
});

describe.skipIf(!dbUp)("kinetic chains", () => {
  test("GET /v1/chains seeds the five chains", async () => {
    const { status, body } = await call("GET", "/v1/chains");
    expect(status).toBe(200);
    expect(body.chains).toHaveLength(5);
    expect(body.chains.map((c: any) => c.name)).toEqual([
      "Intrinsic",
      "Deep Longitudinal",
      "Lateral",
      "Posterior Spiral",
      "Anterior Spiral",
    ]);
    for (const c of body.chains) {
      expect(c.muscleGroups.length).toBeGreaterThan(0);
    }
  });

  test("PUT /v1/chains/:id updates muscle groups", async () => {
    const listRes = await call("GET", "/v1/chains");
    const target = listRes.body.chains[0];
    const putRes = await call("PUT", `/v1/chains/${target.id}`, {
      muscleGroups: ["back", "biceps"],
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.muscleGroups).toEqual(["back", "biceps"]);
    expect(putRes.body.name).toBe(target.name);

    const followUp = await call("GET", "/v1/chains");
    const reloaded = followUp.body.chains.find((c: any) => c.id === target.id);
    expect(reloaded.muscleGroups).toEqual(["back", "biceps"]);
  });

  test("PUT rejects invalid body and unknown id", async () => {
    const listRes = await call("GET", "/v1/chains");
    const target = listRes.body.chains[0];
    const emptyRes = await call("PUT", `/v1/chains/${target.id}`, {
      muscleGroups: [],
    });
    expect(emptyRes.status).toBe(422);
    expect(emptyRes.body.error).toBe("invalid chain");

    const cardioRes = await call("PUT", `/v1/chains/${target.id}`, {
      muscleGroups: ["cardio"],
    });
    expect(cardioRes.status).toBe(422);
    expect(cardioRes.body.error).toBe("invalid chain");

    const unknownRes = await call("PUT", `/v1/chains/${crypto.randomUUID()}`, {
      muscleGroups: ["back"],
    });
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.error).toBe("chain not found");
  });

  test("GET /v1/chains/week counts working sets", async () => {
    const badClient = await call("GET", "/v1/chains/week?clientId=not-a-uuid");
    expect(badClient.status).toBe(422);

    const clientRes = await call("POST", "/v1/clients", {
      name: "Chains Week Client",
      email: `chains-${Date.now()}@test.dev`,
      goals: "hypertrophy",
      daysPerWeek: 3,
    });
    const cId = clientRes.body.id;

    const exRes = await call("POST", "/v1/exercises", {
      name: `Chains Test Squat ${Date.now()}`,
      primaryMuscleGroup: "quads",
      secondaryMuscleGroups: ["glutes"],
      equipment: "barbell",
    });
    const exerciseId = exRes.body.id;

    const progRes = await call("POST", "/v1/programs", {
      clientId: cId,
      name: "Chains Test Program",
      weeks: [
        {
          week: 1,
          days: [
            {
              id: crypto.randomUUID(),
              day: 1,
              sessions: [
                {
                  id: crypto.randomUUID(),
                  name: "Day 1",
                  order: 0,
                  kind: "lifting",
                  exercises: [
                    {
                      id: crypto.randomUUID(),
                      exerciseId,
                      order: 0,
                      prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(progRes.status).toBe(201);
    const pId = progRes.body.id;
    await call("PATCH", `/v1/programs/${pId}/status`, { status: "active" });

    const today = new Date().toISOString().slice(0, 10);
    const logRes = await call("POST", "/v1/logs/sessions", {
      clientId: cId,
      programId: pId,
      date: today,
      sets: [
        { exerciseId, setNumber: 1, type: "working", reps: 5 },
        { exerciseId, setNumber: 2, type: "working", reps: 5 },
        { exerciseId, setNumber: 3, type: "working", reps: 5 },
        { exerciseId, setNumber: 4, type: "backoff", reps: 10 },
      ],
    });
    expect(logRes.status).toBe(201);

    const weekRes = await call("GET", `/v1/chains/week?clientId=${cId}`);
    expect(weekRes.status).toBe(200);

    const d = new Date();
    const dayOffset = (d.getDay() + 6) % 7;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOffset);
    const expectedMonday = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    expect(weekRes.body.weekStart).toBe(expectedMonday);

    for (const c of weekRes.body.chains) {
      const hasOverlap = c.muscleGroups.some((g: string) => g === "quads" || g === "glutes");
      if (hasOverlap) {
        expect(c.sets).toBe(3);
      } else {
        expect(c.sets).toBe(0);
      }
    }
  });
});

