import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db, trainers, signalOutbox, aiGenerations, chatMessages, programs, exercises, clients } from "@pt/db";
import { EXERCISE_ROLES, draftNoticeText, mockChatReply, stampWeeks, type AiProgramDraft } from "@pt/shared";
import { mockWeekDraft } from "./ai/mock";
import { loadRevisionConversation } from "./lib/revision";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

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
      sessionsPerWeek: 2,
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
          sessions: [
            {
              id: programSessionId,
              name: "Day A",
              seq: 1,
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

  test("a swapped slot and an extra set keep their program slot", async () => {
    const programExerciseId = crypto.randomUUID();
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId,
      date: new Date().toISOString().slice(0, 10),
      sets: [
        { programExerciseId, exerciseId: benchId, setNumber: 1, type: "working", weightKg: 60, reps: 8 },
        { programExerciseId, exerciseId: benchId, setNumber: 2, type: "working", reps: 6 },
      ],
    });
    expect(status).toBe(201);
    expect(body.sets.map((s: any) => [s.programExerciseId, s.exerciseId, s.setNumber, s.rpe])).toEqual([
      [programExerciseId, benchId, 1, null],
      [programExerciseId, benchId, 2, null],
    ]);
  });

  test("an exercise from another trainer's catalog is a 422", async () => {
    const [other] = await db
      .insert(trainers)
      .values({ name: "ZZ-TEST Other", email: `zz-other-${Date.now()}@test.dev` })
      .returning();
    const [foreign] = await db
      .insert(exercises)
      .values({ name: "ZZ-TEST Foreign Lift", primaryMuscleGroup: "chest", equipment: "barbell", trainerId: other.id })
      .returning();
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: new Date().toISOString().slice(0, 10),
      sets: [{ exerciseId: foreign.id, setNumber: 1, type: "working", reps: 5 }],
    });
    expect(status).toBe(422);
    expect(body.ids).toEqual([foreign.id]);
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
    // every week holds the two lifting sessions and the cardio session on its own track
    for (const w of body.weeks) {
      expect(w.sessions).toHaveLength(3);
      expect(w.sessions.map((s: any) => `${s.kind}:${s.seq}`).sort()).toEqual(["cardio:1", "lifting:1", "lifting:2"]);
      const cardio = w.sessions.find((s: any) => s.kind === "cardio");
      expect(cardio.kind).toBe("cardio");
      expect(cardio.cardio?.modality).toBe("Bike");
      expect(cardio.exercises).toEqual([]);
    }
    // every exercise carries its display name — the UI renders it directly
    expect(body.weeks).toHaveLength(4);
    for (const w of body.weeks) {
      for (const s of w.sessions) {
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

  test("approve places sessions on the client's trainingDays", async () => {
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
    // 2 lifting sessions take Mon + Tue; cardio stacks on the lighter day (never left off)
    const at = (w: any) => Object.fromEntries(w.sessions.map((s: any) => [`${s.kind}:${s.seq}`, s.weekday]));
    const w1 = at(approved.weeks[0]);
    expect([w1["lifting:1"], w1["lifting:2"]]).toEqual([1, 2]);
    expect([1, 2]).toContain(w1["cardio:1"]);
    // every week shares week 1's placement
    for (const w of approved.weeks) expect(at(w)).toEqual(w1);
  });

  test("generate persists merged instructions on the audit row", async () => {
    const sentInstructions = "prefer free weights; cap RPE at 8";
    const { status, body } = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
      instructions: sentInstructions,
    });
    expect(status).toBe(201);
    expect(body.instructions).toBe(sentInstructions);
    expect(body.rejectReason).toBeNull();
    expect(body.approvedProgramId).toBeNull();

    const getRes = await call("GET", `/v1/ai/generations/${body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.instructions).toBe(sentInstructions);
    expect(getRes.body.rejectReason).toBeNull();
    expect(getRes.body.approvedProgramId).toBeNull();
  });

  test("reject persists an optional reason", async () => {
    const genRes1 = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
    });
    expect(genRes1.status).toBe(201);

    const rejRes1 = await call("POST", `/v1/ai/generations/${genRes1.body.id}/reject`, {
      reason: "too much volume",
    });
    expect(rejRes1.status).toBe(200);
    expect(rejRes1.body.status).toBe("rejected");
    expect(rejRes1.body.rejectReason).toBe("too much volume");

    // body-less reject
    const genRes2 = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
    });
    expect(genRes2.status).toBe(201);

    const rejRes2 = await call("POST", `/v1/ai/generations/${genRes2.body.id}/reject`);
    expect(rejRes2.status).toBe(200);
    expect(rejRes2.body.status).toBe("rejected");
    expect(rejRes2.body.rejectReason).toBeNull();
  });

  test("approve stamps approvedProgramId on the audit row", async () => {
    const genRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
    });
    expect(genRes.status).toBe(201);

    const appRes = await call("POST", `/v1/ai/generations/${genRes.body.id}/approve`, {});
    expect(appRes.status).toBe(201);
    const approvedProgram = appRes.body;

    const getRes = await call("GET", `/v1/ai/generations/${genRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.approvedProgramId).toBe(approvedProgram.id);
  });

  test("approve 422s and fails validation when the draft maps to more than 14 sessions", async () => {
    const [trainer] = await db.select().from(trainers).limit(1);
    const breachDraft: AiProgramDraft = {
      name: "Breach Block",
      rationale: "15 sessions exceeds the 14-session week limit",
      clientSummary: "boundary test",
      sessions: Array.from({ length: 15 }, (_, i) => ({
        name: `Day ${i + 1}`,
        kind: "lifting",
        exercises: [
          {
            exerciseName: `Breach Lift ${i + 1}`,
            prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }],
          },
        ],
      })),
    };

    const [gen] = await db
      .insert(aiGenerations)
      .values({
        trainerId: trainer.id,
        clientId,
        kind: "block",
        providerId: "mock",
        model: "mock-draft-v1",
        status: "validated",
        draft: breachDraft,
      })
      .returning();

    const programsBefore = (await db.select().from(programs)).length;
    const exercisesBefore = (await db.select().from(exercises)).length;

    const { status, body } = await call("POST", `/v1/ai/generations/${gen.id}/approve`, {});
    expect(status).toBe(422);
    expect(body.error).toBe("invalid weeks document");

    const getRes = await call("GET", `/v1/ai/generations/${gen.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("failed_validation");
    expect(getRes.body.error).toBeTruthy();
    expect(getRes.body.approvedProgramId).toBeNull();

    const programsAfter = (await db.select().from(programs)).length;
    expect(programsAfter).toBe(programsBefore);

    const exercisesAfter = (await db.select().from(exercises)).length;
    expect(exercisesAfter).toBe(exercisesBefore);

    const breachExercises = (await db.select().from(exercises)).filter((e) =>
      e.name.startsWith("Breach Lift")
    );
    expect(breachExercises).toHaveLength(0);
  });

  test("reject on non-validated generation is a 409", async () => {
    const { status } = await call("POST", `/v1/ai/generations/${(globalThis as any).__genId}/approve`, {});
    expect(status).toBe(409); // already approved
  });

  test("cancel marks a pending generation cancelled", async () => {
    const trainerId = (await db.select().from(trainers).limit(1))[0].id;
    const [pendingGen] = await db
      .insert(aiGenerations)
      .values({
        trainerId,
        clientId,
        basedOnProgramId: programId,
        kind: "block",
        providerId: "mock",
        model: "mock-draft-v1",
        status: "pending",
      })
      .returning();

    const { status, body } = await call("POST", `/v1/ai/generations/${pendingGen.id}/cancel`);
    expect(status).toBe(200);
    expect(body.status).toBe("cancelled");
    expect(body.draft).toBeNull();
    expect(body.error).toBeNull();

    const getRes = await call("GET", `/v1/ai/generations/${pendingGen.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("cancelled");
  });

  test("cancel 409s for non-pending and 404s for unknown ids", async () => {
    const trainerId = (await db.select().from(trainers).limit(1))[0].id;
    const [pendingGen] = await db
      .insert(aiGenerations)
      .values({
        trainerId,
        clientId,
        basedOnProgramId: programId,
        kind: "block",
        providerId: "mock",
        model: "mock-draft-v1",
        status: "pending",
      })
      .returning();

    const cancel1 = await call("POST", `/v1/ai/generations/${pendingGen.id}/cancel`);
    expect(cancel1.status).toBe(200);
    expect(cancel1.body.status).toBe("cancelled");

    const cancel2 = await call("POST", `/v1/ai/generations/${pendingGen.id}/cancel`);
    expect(cancel2.status).toBe(409);
    expect(cancel2.body.error).toBe("generation is cancelled, not pending");

    const randomId = crypto.randomUUID();
    const cancelMissing = await call("POST", `/v1/ai/generations/${randomId}/cancel`);
    expect(cancelMissing.status).toBe(404);
    expect(cancelMissing.body.error).toBe("generation not found");
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

  test("free-text revise keeps the block plan unless the message is about it (F04)", async () => {
    const parent = await call("GET", `/v1/ai/generations/${revisionChildId}`);
    const revise = async (message: string) => {
      process.env.MOCK_ROGUE = "1";
      try {
        return await call("POST", `/v1/ai/generations/${revisionChildId}/revise`, { message });
      } finally {
        delete process.env.MOCK_ROGUE;
      }
    };
    const locked = await revise("more rest on the bench");
    expect(locked.status).toBe(201);
    expect(locked.body.draft.phasing).toEqual(parent.body.draft.phasing);
    expect(locked.body.discardedChanges.map((c: any) => c.kind)).toContain("plan");
    // The rogue mock's cardio edit is not phasing: it stays and shows in the diff.
    expect(locked.body.draft.sessions).not.toEqual(parent.body.draft.sessions);

    const asked = await revise("make week 4 a lighter deload");
    expect(asked.status).toBe(201);
    expect(asked.body.draft.phasing).not.toEqual(parent.body.draft.phasing);
    expect(asked.body.discardedChanges).toEqual([]);
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

  test("trainer edits after approval become a distill signal", async () => {
    const genRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      providerId: "mock",
    });
    expect(genRes.status).toBe(201);
    const approvedRes = await call("POST", `/v1/ai/generations/${genRes.body.id}/approve`, {});
    expect(approvedRes.status).toBe(201);
    const approvedProg = approvedRes.body;

    const firstLift = (w: any) => w.sessions.find((s: any) => s.kind === "lifting" && s.seq === 1);
    const session = firstLift(approvedProg.weeks[0]);
    expect(session.exercises.length).toBeGreaterThanOrEqual(2);
    const removedExercise = session.exercises[session.exercises.length - 1];
    const removedName = removedExercise.exerciseName ?? removedExercise.exerciseId;
    const editedWeeks = structuredClone(approvedProg.weeks);
    for (const w of editedWeeks) {
      firstLift(w).exercises = firstLift(w).exercises.filter(
        (e: any) => (e.exerciseName ?? e.exerciseId) !== removedName
      );
    }

    const putRes = await call("PUT", `/v1/programs/${approvedProg.id}`, {
      weeks: editedWeeks,
      version: approvedProg.version,
    });
    expect(putRes.status).toBe(200);

    const distillRes = await call("POST", "/v1/ai/preferences/distill", {
      clientId,
      providerId: "mock",
    });
    expect(distillRes.status).toBe(201);
    expect(distillRes.body.document).toContain("removed");
    expect(distillRes.body.document).toContain(removedName);
  });

  let trainerPrefId = "";
  test("distill upserts a trainer-wide preferences document (mock)", async () => {
    const existingList = await call("GET", "/v1/ai/preferences");
    for (const p of existingList.body.preferences) {
      if (p.clientId === null) {
        await call("DELETE", `/v1/ai/preferences/${p.id}`);
      }
    }

    const res1 = await call("POST", "/v1/ai/preferences/distill", {
      providerId: "mock",
    });
    expect(res1.status).toBe(201);
    expect(res1.body.clientId).toBeNull();
    expect(res1.body.providerId).toBe("mock");
    expect(res1.body.document).toContain("Mock distilled preferences:");
    expect(res1.body.document).toContain("prefer free weights; cap RPE at 8");
    expect(res1.body.document).toContain("swap bench for incline DB");
    expect(res1.body.document).toContain("too much volume");
    trainerPrefId = res1.body.id;

    const res2 = await call("POST", "/v1/ai/preferences/distill", {
      providerId: "mock",
    });
    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(trainerPrefId);

    const listRes = await call("GET", "/v1/ai/preferences");
    expect(listRes.status).toBe(200);
    const trainerWideRows = listRes.body.preferences.filter((p: any) => p.clientId === null);
    expect(trainerWideRows).toHaveLength(1);
    expect(trainerWideRows[0].id).toBe(trainerPrefId);
  });

  test("distill: client scope, unknown client 404, no signals 422", async () => {
    const clientBRes = await call("POST", "/v1/clients", {
      name: "Client B",
      email: `client-b-${Date.now()}@test.dev`,
    });
    expect(clientBRes.status).toBe(201);
    const clientBId = clientBRes.body.id;

    const genBRes = await call("POST", "/v1/ai/generate", {
      clientId: clientBId,
      providerId: "mock",
      instructions: "client B only unique signal instruction",
    });
    expect(genBRes.status).toBe(201);

    const distillClientARes = await call("POST", "/v1/ai/preferences/distill", {
      clientId,
      providerId: "mock",
    });
    expect([200, 201]).toContain(distillClientARes.status);
    expect(distillClientARes.body.document).not.toContain("client B only unique signal instruction");

    const unknownRes = await call("POST", "/v1/ai/preferences/distill", {
      clientId: crypto.randomUUID(),
      providerId: "mock",
    });
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.error).toBe("client not found");

    const freshClientRes = await call("POST", "/v1/clients", {
      name: "Fresh Client",
      email: `fresh-${Date.now()}@test.dev`,
    });
    expect(freshClientRes.status).toBe(201);
    const freshDistill = await call("POST", "/v1/ai/preferences/distill", {
      clientId: freshClientRes.body.id,
      providerId: "mock",
    });
    expect(freshDistill.status).toBe(422);
    expect(freshDistill.body.error).toBe("no feedback signals to distill");
  });

  test("preference list (trainer first) and delete", async () => {
    const listBefore = await call("GET", "/v1/ai/preferences");
    expect(listBefore.status).toBe(200);
    const prefs = listBefore.body.preferences;
    expect(prefs.length).toBeGreaterThanOrEqual(2);
    expect(prefs[0].clientId).toBeNull();
    expect(prefs[0].clientName).toBeNull();
    const clientRow = prefs.find((p: any) => p.clientId !== null);
    expect(clientRow).toBeDefined();
    expect(clientRow.clientName).toBeTruthy();

    const delRes = await call("DELETE", `/v1/ai/preferences/${clientRow.id}`);
    expect(delRes.status).toBe(204);

    const listAfter = await call("GET", "/v1/ai/preferences");
    expect(listAfter.body.preferences).toHaveLength(prefs.length - 1);
    expect(listAfter.body.preferences.some((p: any) => p.id === clientRow.id)).toBe(false);

    const delAgain = await call("DELETE", `/v1/ai/preferences/${clientRow.id}`);
    expect(delAgain.status).toBe(404);
    expect(delAgain.body.error).toBe("preference not found");
  });
});

describe.skipIf(!dbUp)("phase L endpoints", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const weeksDoc = () => [
    {
      week: 1,
      sessions: [
        {
          id: crypto.randomUUID(),
          name: "Day A",
          seq: 1,
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
  ];

  test("non-contiguous weeks document is a 422", async () => {
    const { status, body } = await call("POST", "/v1/programs", {
      name: "Non-contiguous",
      clientId,
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day A",
              seq: 1,
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
        {
          week: 3,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day B",
              seq: 1,
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

  test("client PATCH corrects name and email, rejects a malformed email", async () => {
    const before = await call("GET", `/v1/clients/${clientId}`);
    const original = before.body.client ?? before.body;
    const fixed = await call("PATCH", `/v1/clients/${clientId}`, { name: "Renamed Client", email: "renamed@example.com" });
    expect(fixed.body.name).toBe("Renamed Client");
    expect(fixed.body.email).toBe("renamed@example.com");
    const bad = await call("PATCH", `/v1/clients/${clientId}`, { email: "not-an-email" });
    expect(bad.status).toBe(422);
    await call("PATCH", `/v1/clients/${clientId}`, { name: original.name, email: original.email });
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
    expect(status).toBe(422); // schema validation rejects it before the handler runs
    expect(body).toBeDefined();
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
      "Posterior Oblique",
      "Anterior Oblique",
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

  test("GET /v1/chains/week counts working and back-off sets", async () => {
    const badClient = await call("GET", "/v1/chains/week?clientId=not-a-uuid");
    expect(badClient.status).toBe(422);

    const clientRes = await call("POST", "/v1/clients", {
      name: "Chains Week Client",
      email: `chains-${Date.now()}@test.dev`,
      goals: "hypertrophy",
      sessionsPerWeek: 3,
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
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day 1",
              seq: 1,
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
        expect(c.sets).toBe(4);
      } else {
        expect(c.sets).toBe(0);
      }
    }
  });
});

describe.skipIf(!dbUp)("cardio logging and weekly target", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const today = new Date().toISOString().slice(0, 10);

  test("client PATCH accepts cardioTarget and clears it with null", async () => {
    const created = await call("POST", "/v1/clients", {
      name: "Cardio Client",
      email: `cardio-${Date.now()}@test.dev`,
    });
    expect(created.status).toBe(201);
    clientId = created.body.id;

    const set = await call("PATCH", `/v1/clients/${clientId}`, {
      cardioTarget: { unit: "minutes", value: 150 },
    });
    expect(set.status).toBe(200);
    expect(set.body.cardioTarget).toEqual({ unit: "minutes", value: 150 });

    const cleared = await call("PATCH", `/v1/clients/${clientId}`, { cardioTarget: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.cardioTarget).toBeNull();

    // restore for the signal test below
    await call("PATCH", `/v1/clients/${clientId}`, {
      cardioTarget: { unit: "minutes", value: 150 },
    });

    const bad = await call("PATCH", `/v1/clients/${clientId}`, {
      cardioTarget: { unit: "km", value: 1 },
    });
    expect(bad.status).toBe(422);
  });

  test("client PATCH sets and clears cardioDays and longRunDay", async () => {
    const set = await call("PATCH", `/v1/clients/${clientId}`, { cardioDays: [2, 3, 5, 7], longRunDay: 7 });
    expect(set.status).toBe(200);
    expect([set.body.cardioDays, set.body.longRunDay]).toEqual([[2, 3, 5, 7], 7]);
    expect((await call("PATCH", `/v1/clients/${clientId}`, { longRunDay: 8 })).status).toBe(422);
    expect((await call("PATCH", `/v1/clients/${clientId}`, { cardioDays: [2, 2] })).status).toBe(422);
    const cleared = await call("PATCH", `/v1/clients/${clientId}`, { cardioDays: null, longRunDay: null });
    expect([cleared.body.cardioDays, cleared.body.longRunDay]).toEqual([null, null]);
  });

  test("client PATCH sets and clears oneRepMaxes (exerciseId → kg + date)", async () => {
    const set = await call("PATCH", `/v1/clients/${clientId}`, { oneRepMaxes: { "ex-squat": { kg: 140, date: "2026-10-01" } } });
    expect(set.status).toBe(200);
    expect(set.body.oneRepMaxes).toEqual({ "ex-squat": { kg: 140, date: "2026-10-01" } });
    expect((await call("PATCH", `/v1/clients/${clientId}`, { oneRepMaxes: { "ex-squat": { kg: 0, date: "2026-10-01" } } })).status).toBe(422);
    expect((await call("PATCH", `/v1/clients/${clientId}`, { oneRepMaxes: { "ex-squat": { kg: 140, date: "Oct 1" } } })).status).toBe(422);
    const cleared = await call("PATCH", `/v1/clients/${clientId}`, { oneRepMaxes: null });
    expect(cleared.body.oneRepMaxes).toBeNull();
  });

  test("active program for the cardio client", async () => {
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    const prog = await call("POST", "/v1/programs", {
      name: "Cardio Block",
      clientId,
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day A",
              seq: 1,
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
    });
    expect(prog.status).toBe(201);
    programId = prog.body.id;
    const act = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(act.body.status).toBe("active");
  });

  test("log a cardio session; same day also holds a lifting log", async () => {
    const cardio = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: null,
      date: today,
      kind: "cardio",
      cardio: { modality: "Run", durationMin: 35, hrZone: 2, distanceKm: 5.5 },
      sets: [],
    });
    expect(cardio.status).toBe(201);
    expect(cardio.body.kind).toBe("cardio");
    expect(cardio.body.cardio).toEqual({ modality: "Run", durationMin: 35, hrZone: 2, distanceKm: 5.5 });
    expect(cardio.body.sets).toEqual([]);

    const lifting = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: null,
      date: today,
      sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5 }],
    });
    expect(lifting.status).toBe(201);
    expect(lifting.body.kind).toBe("lifting");

    const list = await call("GET", `/v1/logs/sessions?clientId=${clientId}`);
    expect(list.status).toBe(200);
    const cardioRow = list.body.find((l: any) => l.kind === "cardio");
    const liftingRow = list.body.find((l: any) => l.kind === "lifting");
    expect(cardioRow).toBeDefined();
    expect(cardioRow.cardio.modality).toBe("Run");
    expect(cardioRow.sets).toEqual([]);
    expect(liftingRow).toBeDefined();
    expect(liftingRow.cardio).toBeNull();

    const mine = await call("GET", `/v1/logs/sessions?programId=${programId}`);
    expect(mine.body.length).toBe(list.body.filter((l: any) => l.programId === programId).length);
    expect(mine.body.length).toBeGreaterThan(0);
    // someone else's (or no) program is not found — the ownership guard checks query ids too
    const none = await call("GET", `/v1/logs/sessions?programId=${crypto.randomUUID()}`);
    expect(none.status).toBe(404);
  });

  test("cardio log with sets is a 422", async () => {
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: today,
      kind: "cardio",
      cardio: { modality: "Run", durationMin: 30 },
      sets: [{ exerciseId: squatId, setNumber: 1, type: "working", reps: 5 }],
    });
    expect(status).toBe(422);
    expect(body.error).toBe("invalid log");
  });

  test("lifting log with cardio payload is a 422", async () => {
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: today,
      cardio: { modality: "Run", durationMin: 30 },
      sets: [{ exerciseId: squatId, setNumber: 1, type: "working", reps: 5 }],
    });
    expect(status).toBe(422);
    expect(body.error).toBe("invalid log");
  });

  test("lifting log with zero sets is a 422 (regression for the dropped .min(1))", async () => {
    const { status, body } = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: today,
      sets: [],
    });
    expect(status).toBe(422);
    expect(body.error).toBe("invalid log");
    expect(JSON.stringify(body.issues)).toContain("lifting log requires at least 1 set");
  });

  test("notifications include cardio-behind when behind", async () => {
    // F18: nothing is due on the client's first day — age the client a month.
    await db.update(clients).set({ createdAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(clients.id, clientId));
    const feed = await call("GET", "/v1/notifications");
    expect(feed.status).toBe(200);
    // target 150 min; only this week's cardio logs count. weekday-dependent —
    // the signal exists only Thu–Sun (unit tests pin the rule with fixed now).
    const wd = (new Date().getDay() + 6) % 7 + 1;
    const find = () =>
      feed.body.signals.find((s: any) => s.id === `cardio-behind:${clientId}`);
    if (wd >= 4) {
      expect(find()).toBeDefined();
    } else {
      expect(find()).toBeUndefined();
    }
  });
});

describe.skipIf(!dbUp)("cardio-behind without an active program (F18)", () => {
  test("a client with a cardio target and no program still gets the signal", async () => {
    const created = await call("POST", "/v1/clients", {
      name: "ZZ-TEST No Program Runner",
      email: `cardio-noprog-${Date.now()}@test.dev`,
    });
    expect(created.status).toBe(201);
    const clientId = created.body.id;
    await call("PATCH", `/v1/clients/${clientId}`, { cardioTarget: { unit: "sessions", value: 4 } });

    const find = async () =>
      (await call("GET", "/v1/notifications")).body.signals.find((s: any) => s.id === `cardio-behind:${clientId}`);
    // Created today → nothing due yet.
    expect(await find()).toBeUndefined();

    await db.update(clients).set({ createdAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(clients.id, clientId));
    const wd = (new Date().getDay() + 6) % 7 + 1;
    const signal = await find();
    if (wd >= 4) {
      expect(signal).toBeDefined();
      expect(signal.programId).toBeNull();
      expect(signal.clientId).toBe(clientId);
    } else {
      expect(signal).toBeUndefined();
    }
  });
});

describe.skipIf(!dbUp)("weekly generation cadence", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  let week2GenId = "";

  const fourWeekDoc = (exerciseId: string) =>
    stampWeeks(
      [
        {
          id: crypto.randomUUID(),
          name: "Session 1",
          seq: 1,
          weekday: 1,
          order: 0,
          kind: "lifting" as const,
          exercises: [
            {
              id: crypto.randomUUID(),
              exerciseId,
              order: 0,
              prescribedSets: [{ setNumber: 1, type: "working" as const, reps: 5, amrap: false }],
            },
          ],
        },
      ],
      4
    );

  test("setup 4-week active program with phasing", async () => {
    const c = await call("POST", "/v1/clients", {
      name: "Weekly Client",
      email: `weekly-${Date.now()}@test.dev`,
      trainingDays: [1, 3],
    });
    expect(c.status).toBe(201);
    clientId = c.body.id;

    const sq = await call("GET", "/v1/exercises?q=squat");
    squatId = sq.body[0].id;

    const p = await call("POST", "/v1/programs", {
      name: "Weekly Cadence Block",
      clientId,
      direction: "Build squat volume",
      phasing: {
        plannedWeeks: 4,
        phase: "accumulation",
        weeks: [
          { week: 1, directive: "base" },
          { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
          { week: 3, directive: "+intensity" },
          { week: 4, directive: "deload" },
        ],
      },
      weeks: fourWeekDoc(squatId),
    });
    expect(p.status).toBe(201);
    programId = p.body.id;

    const act = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(act.status).toBe(200);
    expect(act.body.status).toBe("active");
  });

  test("weekly generate guards: 422s for bad targets and programs", async () => {
    // 1. missing basedOnProgramId
    const missingProg = await call("POST", "/v1/ai/generate", {
      clientId,
      targetWeek: 2,
    });
    expect(missingProg.status).toBe(422);
    expect(missingProg.body.error).toBe("weekly generation requires basedOnProgramId");

    // 2. program not found
    const notFoundProg = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: crypto.randomUUID(),
      targetWeek: 2,
    });
    expect(notFoundProg.status).toBe(404);
    expect(notFoundProg.body.error).toBe("program not found");

    // 3. non-active program
    const draftProg = await call("POST", "/v1/programs", {
      name: "Draft Prog",
      clientId,
      weeks: fourWeekDoc(squatId),
    });
    const nonActiveRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: draftProg.body.id,
      targetWeek: 2,
    });
    expect(nonActiveRes.status).toBe(422);
    expect(nonActiveRes.body.error).toBe("weekly generation requires an active program");

    // 4. targetWeek beyond block
    const beyondRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      targetWeek: 5,
    });
    expect(beyondRes.status).toBe(422);
    expect(beyondRes.body.error).toBe("target week is beyond the block");

    // 5. targetWeek must be upcoming week (current is 1, target 1 is bad)
    const badWeekRes = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      targetWeek: 1,
    });
    expect(badWeekRes.status).toBe(422);
    expect(badWeekRes.body.error).toBe("target week must be the upcoming week (week 1 + 1)");
  });

  test("weekly generate (mock) validates and records kind/targetWeek", async () => {
    const { status, body } = await call("POST", "/v1/ai/generate", {
      clientId,
      basedOnProgramId: programId,
      targetWeek: 2,
      providerId: "mock",
    });
    expect(status).toBe(201);
    expect(body.kind).toBe("week");
    expect(body.targetWeek).toBe(2);
    expect(body.status).toBe("validated");
    expect(body.draft.sessions.length).toBe(3);
    expect(body.draft.phasing).toBeUndefined();
    week2GenId = body.id;
  });

  test("approve weekly generation replaces the week in place", async () => {
    const pre = await call("GET", `/v1/programs/${programId}`);
    const preWeeks = pre.body.weeks;

    const { status, body } = await call("POST", `/v1/ai/generations/${week2GenId}/approve`, {});
    expect(status).toBe(201);
    expect(body.id).toBe(programId);
    expect(body.version).toBe(2);
    expect(body.status).toBe("active");
    expect(body.weeks.length).toBe(4);

    // week-2 sessions = 3 incl. the cardio session (modality "Bike")
    expect(body.weeks[1].sessions).toHaveLength(3);
    const cardioSession = body.weeks[1].sessions.find((s: any) => s.kind === "cardio");
    expect(cardioSession.cardio?.modality).toBe("Bike");

    // week-2 ids != old ids; Session 1 keeps its old weekday (matched by kind:seq)
    const oldS1 = preWeeks[1].sessions.find((s: any) => s.kind === "lifting" && s.seq === 1);
    const newS1 = body.weeks[1].sessions.find((s: any) => s.kind === "lifting" && s.seq === 1);
    expect(newS1.id).not.toBe(oldS1.id);
    expect(newS1.weekday).toBe(oldS1.weekday);

    // weeks 1/3 deep-equal pre-approve snapshots
    expect(body.weeks[0]).toEqual(preWeeks[0]);
    expect(body.weeks[2]).toEqual(preWeeks[2]);

    // phasing unchanged
    expect(body.phasing).toEqual(pre.body.phasing);
  });

  test("a backfilled log before activation moves the current week (F05)", async () => {
    const d = new Date(Date.now() - 8 * 86_400_000);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const log = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date,
      sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5 }],
    });
    expect(log.status).toBe(201);
    // The block now anchors 8 days back → week 2 is current, week 3 is next —
    // the same week the week-ending signal and the client page compute.
    const stale = await call("POST", "/v1/ai/generate", { clientId, basedOnProgramId: programId, targetWeek: 2, providerId: "mock" });
    expect(stale.status).toBe(422);
    expect(stale.body.error).toBe("target week must be the upcoming week (week 2 + 1)");
    const next = await call("POST", "/v1/ai/generate", { clientId, basedOnProgramId: programId, targetWeek: 3, providerId: "mock" });
    expect(next.status).toBe(201);
    expect(next.body.targetWeek).toBe(3);
  });

  test("weekly approve rejects a stale target week", async () => {
    // Program where weekNow has advanced past targetWeek
    // Create an active program activated 25 days ago (weekNow = 4)
    const pastActivated = new Date(Date.now() - 25 * 86400_000).toISOString();
    const [elapsedProgram] = await db
      .insert(programs)
      .values({
        trainerId: (await db.select().from(trainers).limit(1))[0].id,
        clientId,
        name: "Elapsed Block",
        status: "active",
        activatedAt: new Date(pastActivated),
        sessions: fourWeekDoc(squatId),
      })
      .returning();

    // Directly seed a validated generation for targetWeek 2 on this program
    const [staleGen] = await db
      .insert(aiGenerations)
      .values({
        trainerId: elapsedProgram.trainerId,
        clientId,
        basedOnProgramId: elapsedProgram.id,
        kind: "week",
        targetWeek: 2,
        providerId: "mock",
        model: "mock-draft-v1",
        status: "validated",
        draft: mockWeekDraft(2, null),
      })
      .returning();

    const { status, body } = await call("POST", `/v1/ai/generations/${staleGen.id}/approve`, {});
    expect(status).toBe(409);
    expect(body.error).toBe("generation targets a week that is no longer current");
  });
});

describe.skipIf(!dbUp)("example library (gold-standard programs)", () => {
  let clientId = "";
  let programId = "";
  let otherProgramId = "";
  let squatId = "";

  const twoDayWeek = () => [
    {
      week: 1,
      sessions: [
        {
          id: crypto.randomUUID(),
          name: "Day A",
          seq: 1,
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
        {
          id: crypto.randomUUID(),
          name: "Day B",
          seq: 2,
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
  ];

  test("seed client + two programs", async () => {
    const found = await call("GET", "/v1/exercises?q=squat");
    expect(found.body.length).toBeGreaterThan(0);
    squatId = found.body[0].id;

    const c = await call("POST", "/v1/clients", {
      name: "Example Lib Client",
      email: `exlib-${Date.now()}@test.dev`,
      goals: "lean bulk",
      sessionsPerWeek: 2,
    });
    expect(c.status).toBe(201);
    clientId = c.body.id;

    const p1 = await call("POST", "/v1/programs", {
      name: "Gold Standard Block",
      clientId,
      weeks: twoDayWeek(),
    });
    expect(p1.status).toBe(201);
    programId = p1.body.id;

    const p2 = await call("POST", "/v1/programs", {
      name: "Other Block",
      clientId,
      weeks: twoDayWeek(),
    });
    expect(p2.status).toBe(201);
    otherProgramId = p2.body.id;
  });

  test("mark a program as an example: 201, derived days, duplicate 409, unknown program 404", async () => {
    const marked = await call("POST", "/v1/examples", {
      programId,
      goal: "lean bulk hypertrophy",
      level: "intermediate",
    });
    expect(marked.status).toBe(201);
    expect(marked.body.goal).toBe("lean bulk hypertrophy");
    expect(marked.body.level).toBe("intermediate");
    expect(marked.body.programId).toBe(programId);
    // derived from the program's first week (2 lifting sessions)
    expect(marked.body.daysPerWeek).toBe(2);
    expect(marked.body.program.id).toBe(programId);

    const dup = await call("POST", "/v1/examples", {
      programId,
      goal: "again",
      level: "beginner",
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("program is already marked as an example");

    const missing = await call("POST", "/v1/examples", {
      programId: crypto.randomUUID(),
      goal: "ghost",
      level: "beginner",
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("program not found");

    const badLevel = await call("POST", "/v1/examples", {
      programId: otherProgramId,
      goal: "ok",
      level: "expert",
    });
    expect(badLevel.status).toBe(422);
    expect(badLevel.body.error).toBe("invalid example");

    const blankGoal = await call("POST", "/v1/examples", {
      programId: otherProgramId,
      goal: "",
      level: "beginner",
    });
    expect(blankGoal.status).toBe(422);
  });

  test("example tags: patch, note clear, delete, programId filter", async () => {
    const withNote = await call("PATCH", `/v1/examples/${(await call("GET", `/v1/examples?programId=${programId}`)).body.examples[0].id}`, {
      goal: "lean bulk strength",
      level: "advanced",
      note: "revisit tags",
    });
    expect(withNote.status).toBe(200);
    expect(withNote.body.goal).toBe("lean bulk strength");
    expect(withNote.body.level).toBe("advanced");
    expect(withNote.body.note).toBe("revisit tags");

    const cleared = await call("PATCH", `/v1/examples/${withNote.body.id}`, { note: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.note).toBe(null);

    // a second example to assert the filter and newest-first order
    const second = await call("POST", "/v1/examples", {
      programId: otherProgramId,
      goal: "general strength",
      level: "beginner",
      daysPerWeek: 3,
    });
    expect(second.status).toBe(201);

    const filtered = await call("GET", `/v1/examples?programId=${programId}`);
    expect(filtered.body.examples.length).toBe(1);
    expect(filtered.body.examples[0].programId).toBe(programId);

    const all = await call("GET", "/v1/examples");
    const ids = all.body.examples.map((e: any) => e.programId);
    expect(ids).toContain(programId);
    expect(ids).toContain(otherProgramId);
    // newest first: the second mark was created last
    expect(ids.indexOf(otherProgramId)).toBeLessThan(ids.indexOf(programId));

    // patch on unknown id
    expect((await call("PATCH", `/v1/examples/${crypto.randomUUID()}`, { goal: "x" })).status).toBe(404);

    const del = await call("DELETE", `/v1/examples/${second.body.id}`);
    expect(del.status).toBe(204);
    expect((await call("DELETE", `/v1/examples/${second.body.id}`)).status).toBe(404);

    // cleanup the first example so later generate tests see a known library
    expect((await call("DELETE", `/v1/examples/${withNote.body.id}`)).status).toBe(204);
  });
});

describe.skipIf(!dbUp)("example few-shot generation wiring", () => {
  let matchClientId = "";
  let coldClientId = "";
  let daysOnlyClientId = "";
  let beginnerClientId = "";
  let programId = "";

  test("seed matching + non-matching clients and a marked example", async () => {
    const found = await call("GET", "/v1/exercises?q=squat");
    const squatId = found.body[0].id;

    const mk = async (name: string, goals: string, sessionsPerWeek: number, experience?: string) => {
      const c = await call("POST", "/v1/clients", {
        name,
        email: `exgen-${name}-${Date.now()}@test.dev`,
        goals,
        sessionsPerWeek,
        ...(experience ? { experience } : {}),
      });
      expect(c.status).toBe(201);
      return c.body.id as string;
    };
    // "lean bulk" shares words with the tag below; 4 days matches too
    matchClientId = await mk("Matcher", "lean bulk strength", 4);
    // no shared words and 2 days vs 4 → zero score
    coldClientId = await mk("Cold", "marathon endurance running", 2);
    // same 4 days but no shared goal word → days alone never qualify
    daysOnlyClientId = await mk("DaysOnly", "marathon endurance running", 4);
    // shares "lean bulk" but beginner vs the advanced tag below → excluded
    beginnerClientId = await mk("Beginner", "lean bulk strength", 4, "beginner");

    const p = await call("POST", "/v1/programs", {
      name: "Few-shot Gold Block",
      clientId: matchClientId,
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day A",
              seq: 1,
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
    });
    expect(p.status).toBe(201);
    programId = p.body.id;

    const marked = await call("POST", "/v1/examples", {
      programId,
      goal: "lean bulk hypertrophy block",
      level: "advanced",
      daysPerWeek: 4,
    });
    expect(marked.status).toBe(201);
  });

  test("generate with a marked example stamps exampleProgramIds; revision copies them", async () => {
    const gen = await call("POST", "/v1/ai/generate", {
      clientId: matchClientId,
      providerId: "mock",
    });
    expect(gen.status).toBe(201);
    expect(gen.body.status).toBe("validated");
    expect(gen.body.exampleProgramIds).toContain(programId);

    const cold = await call("POST", "/v1/ai/generate", {
      clientId: coldClientId,
      providerId: "mock",
    });
    expect(cold.status).toBe(201);
    expect(cold.body.exampleProgramIds).toEqual([]);

    for (const clientId of [daysOnlyClientId, beginnerClientId]) {
      const none = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
      expect(none.status).toBe(201);
      expect(none.body.exampleProgramIds).toEqual([]);
    }

    const child = await call("POST", `/v1/ai/generations/${gen.body.id}/revise`, {
      message: "trim one set per session",
    });
    expect(child.status).toBe(201);
    expect(child.body.parentGenerationId).toBe(gen.body.id);
    expect(child.body.exampleProgramIds).toEqual(gen.body.exampleProgramIds);

    // cleanup the library marker
    const list = await call("GET", `/v1/examples?programId=${programId}`);
    for (const e of list.body.examples) {
      expect((await call("DELETE", `/v1/examples/${e.id}`)).status).toBe(204);
    }
  });
});

describe.skipIf(!dbUp)("client messages (mock provider)", () => {
  let clientId = "";
  let otherClientId = "";
  let programId = "";
  let squatId = "";
  let editedGenId = "";
  let asIsGenId = "";

  test("setup: client, program, week-1 logs", async () => {
    const c = await call("POST", "/v1/clients", {
      name: "Message Client",
      email: `msg-${Date.now()}@test.dev`,
      sessionsPerWeek: 2,
    });
    expect(c.status).toBe(201);
    clientId = c.body.id;

    const other = await call("POST", "/v1/clients", {
      name: "Other Client",
      email: `other-${Date.now()}@test.dev`,
    });
    otherClientId = other.body.id;

    const ex = await call("GET", "/v1/exercises?q=squat");
    squatId = ex.body[0].id;

    const p = await call("POST", "/v1/programs", {
      name: "Message Block",
      clientId,
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day A",
              seq: 1,
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
    });
    expect(p.status).toBe(201);
    programId = p.body.id;
    const act = await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" });
    expect(act.body.status).toBe("active");

    const log = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      date: new Date().toISOString().slice(0, 10),
      sets: [
        { exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8 },
        { exerciseId: squatId, setNumber: 2, type: "working", weightKg: 100, reps: 5, rpe: 8 },
      ],
    });
    expect(log.status).toBe(201);
  });

  test("client message generate (mock) validates, snapshots stats and audits provider", async () => {
    const { status, body } = await call("POST", "/v1/client-messages/generate", {
      clientId,
      programId,
      week: 1,
      providerId: "mock",
    });
    expect(status).toBe(201);
    expect(body.status).toBe("validated");
    expect(body.providerId).toBe("mock");
    expect(body.model).toBe("mock-draft-v1");
    expect(body.draft.message.length).toBeGreaterThan(0);
    expect(body.draft.message.length).toBeLessThanOrEqual(1200);
    expect(body.stats).not.toBeNull();
    expect(body.stats.week).toBe(1);
    expect(body.stats.sessionsLogged).toBe(1);
    expect(body.stats.overallVolume).toBe(1000);
    expect(body.stats.sets).toBe(2);
    expect(body.finalText).toBeNull();
    editedGenId = body.id;

    // second draft for the same week is free (regeneration, Decision 6)
    const again = await call("POST", "/v1/client-messages/generate", {
      clientId,
      programId,
      week: 1,
      providerId: "mock",
    });
    expect(again.status).toBe(201);
    asIsGenId = again.body.id;
  });

  test("client message generate guards: 404s, wrong-client program 422, unlogged week 422", async () => {
    const noClient = await call("POST", "/v1/client-messages/generate", {
      clientId: "00000000-0000-0000-0000-000000000000",
      programId,
      week: 1,
      providerId: "mock",
    });
    expect(noClient.status).toBe(404);
    expect(noClient.body.error).toBe("client not found");

    const noProgram = await call("POST", "/v1/client-messages/generate", {
      clientId,
      programId: "00000000-0000-0000-0000-000000000000",
      week: 1,
      providerId: "mock",
    });
    expect(noProgram.status).toBe(404);
    expect(noProgram.body.error).toBe("program not found");

    const wrongClient = await call("POST", "/v1/client-messages/generate", {
      clientId: otherClientId,
      programId,
      week: 1,
      providerId: "mock",
    });
    expect(wrongClient.status).toBe(422);
    expect(wrongClient.body.error).toBe("program does not belong to client");

    const unlogged = await call("POST", "/v1/client-messages/generate", {
      clientId,
      programId,
      week: 2,
      providerId: "mock",
    });
    expect(unlogged.status).toBe(422);
    expect(unlogged.body.error).toBe("week 2 has no logged sessions");
  });

  test("approve stores edited text as finalText; copy source is finalText", async () => {
    const edited = await call("POST", `/v1/client-messages/${editedGenId}/approve`, {
      text: `  Edited final text — strong week.  `,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe("approved");
    expect(edited.body.finalText).toBe("Edited final text — strong week.");

    const asIs = await call("POST", `/v1/client-messages/${asIsGenId}/approve`, {});
    expect(asIs.status).toBe(200);
    expect(asIs.body.finalText).toBe(asIs.body.draft.message);
  });

  test("approve guards 409/422; reject marks discarded; list filters by clientId", async () => {
    // approving an already-approved row → 409
    const reApprove = await call("POST", `/v1/client-messages/${editedGenId}/approve`, {});
    expect(reApprove.status).toBe(409);
    expect(reApprove.body.error).toBe("client message is approved, not validated");

    // unknown id → 404
    const missing = await call("POST", "/v1/client-messages/00000000-0000-0000-0000-000000000000/approve", {});
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("client message not found");

    // whitespace-only text → 422
    const fresh = await call("POST", "/v1/client-messages/generate", {
      clientId,
      programId,
      week: 1,
      providerId: "mock",
    });
    const blank = await call("POST", `/v1/client-messages/${fresh.body.id}/approve`, { text: "   " });
    expect(blank.status).toBe(422);
    expect(blank.body.error).toBe("text must not be empty");

    // reject → discarded
    const rejected = await call("POST", `/v1/client-messages/${fresh.body.id}/reject`, {});
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
    expect(rejected.body.finalText).toBeNull();

    // list newest-first, filtered by clientId
    const mine = await call("GET", `/v1/client-messages/?clientId=${clientId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBe(3);
    expect(new Date(mine.body[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(mine.body[1].createdAt).getTime()
    );

    const others = await call("GET", `/v1/client-messages/?clientId=${otherClientId}`);
    expect(others.body).toEqual([]);

    // single fetch + 404
    const one = await call("GET", `/v1/client-messages/${editedGenId}`);
    expect(one.body.id).toBe(editedGenId);
    const none = await call("GET", "/v1/client-messages/00000000-0000-0000-0000-000000000000");
    expect(none.status).toBe(404);
    expect(none.body.error).toBe("client message not found");
  });
});

describe.skipIf(!dbUp)("chat surface (mock provider)", () => {
  let clientId = "";
  let clientName = "Chat Test Client";
  let genId = "";

  test("setup: create client and draft generation", async () => {
    const clientRes = await call("POST", "/v1/clients", {
      name: clientName,
      email: `chat-${Date.now()}@test.dev`,
      goals: "strength & chat test",
      sessionsPerWeek: 3,
    });
    expect(clientRes.status).toBe(201);
    clientId = clientRes.body.id;

    // Generate a draft to revise against
    const genRes = await call("POST", "/v1/ai/generate", {
      clientId,
      trainerInstructions: "Initial test block",
      providerId: "mock",
    });
    expect(genRes.status).toBe(201);
    expect(genRes.body.status).toBe("validated");
    genId = genRes.body.id;
  });

  test("chat: send a message, get the mock reply, transcript persists", async () => {
    const msg1 = "How is Maya doing with squat volume?";
    const send1 = await call("POST", "/v1/ai/chat", {
      clientId,
      message: msg1,
      providerId: "mock",
    });
    expect(send1.status).toBe(201);
    expect(send1.body.messages).toHaveLength(2);
    const [trainer1, ai1] = send1.body.messages;
    expect(trainer1.role).toBe("trainer");
    expect(trainer1.kind).toBe("chat");
    expect(trainer1.content).toBe(msg1);
    expect(trainer1.generationId).toBeNull();
    expect(ai1.role).toBe("assistant");
    expect(ai1.kind).toBe("chat");
    expect(ai1.content).toBe(mockChatReply(msg1, clientName));
    expect(ai1.generationId).toBeNull();

    // GET returns both messages ordered oldest-first
    const list1 = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(list1.status).toBe(200);
    expect(list1.body.messages).toHaveLength(2);
    expect(list1.body.messages[0].id).toBe(trainer1.id);
    expect(list1.body.messages[1].id).toBe(ai1.id);

    // Second send -> 4 messages
    const msg2 = "What should we target next week?";
    const send2 = await call("POST", "/v1/ai/chat", {
      clientId,
      message: msg2,
      providerId: "mock",
    });
    expect(send2.status).toBe(201);
    expect(send2.body.messages).toHaveLength(2);

    const list2 = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(list2.status).toBe(200);
    expect(list2.body.messages).toHaveLength(4);
    expect(list2.body.messages[2].content).toBe(msg2);
    expect(list2.body.messages[3].content).toBe(mockChatReply(msg2, clientName));
  });

  test("chat: 422 blank message, 404 unknown client", async () => {
    const preList = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    const preCount = preList.body.messages.length;

    const blank = await call("POST", "/v1/ai/chat", {
      clientId,
      message: "   ",
      providerId: "mock",
    });
    expect(blank.status).toBe(422);
    expect(blank.body.error).toBe("message must not be empty");

    const postBlank = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(postBlank.body.messages).toHaveLength(preCount);

    const unknown = await call("POST", "/v1/ai/chat", {
      clientId: "00000000-0000-0000-0000-000000000000",
      message: "hello",
      providerId: "mock",
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe("client not found");
  });

  test("chat turn with a change request returns a proposal and no generation", async () => {
    const gensBefore = await call("GET", `/v1/ai/generations?clientId=${clientId}`);
    const countBefore = (gensBefore.body as any[]).length;

    const reviseMsg = "Swap back squat for safety bar squat";
    const res = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: genId,
      message: reviseMsg,
    });
    expect(res.status).toBe(201);
    expect(res.body.generation).toBeNull();

    expect(res.body.messages).toHaveLength(2);
    const [trainerMsg, aiMsg] = res.body.messages;
    expect(trainerMsg.role).toBe("trainer");
    expect(trainerMsg.kind).toBe("revision");
    expect(trainerMsg.content).toBe(reviseMsg);
    expect(trainerMsg.generationId).toBeNull();

    expect(aiMsg.role).toBe("assistant");
    expect(aiMsg.kind).toBe("proposal");
    expect(aiMsg.generationId).toBeNull();
    expect(aiMsg.proposal.changes).toHaveLength(1);
    expect(aiMsg.proposal.parentGenerationId).toBe(genId);
    expect(aiMsg.proposal.builtGenerationId).toBeNull();

    // Nothing was built: the generation list is untouched
    const gensAfter = await call("GET", `/v1/ai/generations?clientId=${clientId}`);
    expect((gensAfter.body as any[]).length).toBe(countBefore);

    // Shows in transcript in order
    const list = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(list.status).toBe(200);
    const lastTwo = list.body.messages.slice(-2);
    expect(lastTwo[0].id).toBe(trainerMsg.id);
    expect(lastTwo[1].id).toBe(aiMsg.id);
  });

  test("building a proposal creates the next version", async () => {
    const parent = await call("GET", `/v1/ai/generations/${genId}`);
    expect(parent.status).toBe(200);
    const parentRest = parent.body.draft.sessions[0].exercises[0].prescribedSets[0].restSeconds ?? 60;

    const turn = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: genId,
      message: "Add rest to the first exercise",
      providerId: "mock",
    });
    expect(turn.status).toBe(201);
    const proposalRow = turn.body.messages[1];
    expect(proposalRow.kind).toBe("proposal");
    // The proposal points at its request, so the build never has to infer it
    expect(proposalRow.proposal.requestMessageId).toBe(turn.body.messages[0].id);

    const res = await call("POST", `/v1/ai/chat/proposals/${proposalRow.id}/build`, {});
    expect(res.status).toBe(201);

    const generation = res.body.generation;
    expect(generation.parentGenerationId).toBe(genId);
    expect(generation.status).toBe("validated");
    // History keeps the trainer's words, not the proposal-bound prompt
    expect(generation.revisionMessage).toBe("Add rest to the first exercise");
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].kind).toBe("draft");
    expect(res.body.messages[0].generationId).toBe(generation.id);

    // The proposal row records the version it produced
    const list = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    const row = list.body.messages.find((m: any) => m.id === proposalRow.id);
    expect(row.proposal.builtGenerationId).toBe(generation.id);

    // The mock build applies a +15s rest edit on day 1 slot 1
    expect(generation.draft.sessions[0].exercises[0].prescribedSets[0].restSeconds).toBe(parentRest + 15);
  });

  test("a proposal build keeps off-proposal AI edits out and lists them (F04)", async () => {
    const g = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
    expect(g.status).toBe(201);
    const parentDraft = g.body.draft;
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: g.body.id, message: "More rest on the first lift", providerId: "mock" });
    expect(turn.status).toBe(201);

    process.env.MOCK_ROGUE = "1";
    let res;
    try {
      res = await call("POST", `/v1/ai/chat/proposals/${turn.body.messages[1].id}/build`, { providerId: "mock" });
    } finally {
      delete process.env.MOCK_ROGUE;
    }
    expect(res.status).toBe(201);
    const gen = res.body.generation;
    expect(gen.status).toBe("validated");
    // The rogue mock moved phasing and cardio; the stored draft keeps the parent's.
    expect(gen.draft.phasing).toEqual(parentDraft.phasing);
    const cardioIdx = parentDraft.sessions.findIndex((s: any) => s.kind === "cardio");
    expect(gen.draft.sessions[cardioIdx]).toEqual(parentDraft.sessions[cardioIdx]);
    // The proposed edit landed.
    expect(gen.draft.sessions[0].exercises[0].prescribedSets[0].restSeconds).toBe(
      (parentDraft.sessions[0].exercises[0].prescribedSets[0].restSeconds ?? 60) + 15
    );
    expect(gen.discardedChanges.map((c: any) => c.kind)).toContain("plan");
    expect(gen.discardedChanges.map((c: any) => c.kind)).toContain("cardio");
    // The confirmation names the exact count and the discarded ones.
    expect(res.body.messages[0].content).toStartWith("Built from the proposal: 1 change.");
    expect(res.body.messages[0].content).toContain(`The AI also changed ${gen.discardedChanges.length} things outside the proposal. Kept as before.`);

    const stored = await call("GET", `/v1/ai/generations/${gen.id}`);
    expect(stored.body.discardedChanges).toEqual(gen.discardedChanges);
  });

  test("a clean proposal build discards nothing", async () => {
    const g = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: g.body.id, message: "More rest on the first lift", providerId: "mock" });
    const res = await call("POST", `/v1/ai/chat/proposals/${turn.body.messages[1].id}/build`, { providerId: "mock" });
    expect(res.status).toBe(201);
    expect(res.body.generation.discardedChanges).toEqual([]);
    expect(res.body.messages[0].content).not.toContain("outside the proposal");
  });

  test("a proposal build keeps the trainer's request when both rows share a millisecond", async () => {
    const c = await call("POST", "/v1/clients", { name: "Same Millisecond Client", email: `same-ms-${Date.now()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    const g = await call("POST", "/v1/ai/generate", { clientId: c.body.id, providerId: "mock" });
    expect(g.status).toBe(201);

    // A proposal row written before proposals stored their request id: the trainer
    // message sits 111µs before it, so a millisecond JS Date bound loses it.
    const request = "Add rest to the first exercise";
    const [trainerRow] = await db
      .insert(chatMessages)
      .values({
        trainerId: g.body.trainerId,
        clientId: c.body.id,
        role: "trainer",
        kind: "revision",
        content: request,
        createdAt: sql`'2026-01-02 09:00:00.124789+00'::timestamptz`,
      })
      .returning();
    const [proposalRow] = await db
      .insert(chatMessages)
      .values({
        trainerId: g.body.trainerId,
        clientId: c.body.id,
        role: "assistant",
        kind: "proposal",
        content: `Proposed: ${request}`,
        createdAt: sql`'2026-01-02 09:00:00.124900+00'::timestamptz`,
        proposal: {
          summary: `Mock proposal for: ${request}`,
          changes: [{ day: 1, slot: 1, kind: "edit", from: "Back Squat", to: "Back Squat", detail: "rest +15s on every set" }],
          parentGenerationId: g.body.id,
          builtGenerationId: null,
        },
      })
      .returning();
    expect(trainerRow.id).toBeTruthy();

    const res = await call("POST", `/v1/ai/chat/proposals/${proposalRow.id}/build`, {});
    expect(res.status).toBe(201);
    expect(res.body.generation.revisionMessage).toBe(request);
  });

  test("building a proposal twice returns 409", async () => {
    const list = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    const built = list.body.messages.filter((m: any) => m.kind === "proposal" && m.proposal?.builtGenerationId);
    expect(built.length).toBeGreaterThan(0);
    const res = await call("POST", `/v1/ai/chat/proposals/${built[0].id}/build`, {});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("proposal already built");
  });

  test("building an unknown proposal returns 404", async () => {
    const res = await call("POST", `/v1/ai/chat/proposals/${crypto.randomUUID()}/build`, {});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("proposal not found");
  });

  test("chat turn with a question replies without drafting", async () => {
    const gensBefore = await call("GET", `/v1/ai/generations?clientId=${clientId}`);
    const countBefore = (gensBefore.body as any[]).length;

    const question = "Why is the squat volume so low?";
    const res = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: (gensBefore.body as any[])[0].id,
      message: question,
      providerId: "mock",
    });
    expect(res.status).toBe(201);
    expect(res.body.generation).toBeNull();

    expect(res.body.messages).toHaveLength(2);
    const [trainerMsg, aiMsg] = res.body.messages;
    expect(trainerMsg.kind).toBe("revision");
    expect(aiMsg.kind).toBe("chat");
    expect(aiMsg.proposal).toBeNull();
    expect(aiMsg.content).toBe(mockChatReply(question, clientName));

    // No version churn: the generation list is untouched
    const gensAfter = await call("GET", `/v1/ai/generations?clientId=${clientId}`);
    expect((gensAfter.body as any[]).length).toBe(countBefore);
  });

  test("chat turn without a generationId is plain Q&A", async () => {
    const msg = "How are we doing overall?";
    const res = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      message: msg,
      providerId: "mock",
    });
    expect(res.status).toBe(201);
    expect(res.body.generation).toBeNull();
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].kind).toBe("chat");
    expect(res.body.messages[1].content).toBe(mockChatReply(msg, clientName));
  });

  test("chat turn rejects an effort the provider does not take", async () => {
    const res = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: genId,
      message: "cut accessories to 2 sets",
      providerId: "mock",
      effort: "ultra",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("provider takes no effort parameter");
  });

  test("chat turn pre-flight failures write no rows", async () => {
    const preList = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    const preCount = preList.body.messages.length;

    // Unknown generationId -> 404
    const unknown = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: "00000000-0000-0000-0000-000000000000",
      message: "some message",
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe("generation not found");

    // Blank message -> 422
    const blank = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: genId,
      message: "   ",
    });
    expect(blank.status).toBe(422);
    expect(blank.body.error).toBe("message must not be empty");

    // Reject generation then revise -> 409
    const rejectedGen = await call("POST", `/v1/ai/generations/${genId}/reject`, {});
    expect(rejectedGen.status).toBe(200);

    const onRejected = await call("POST", "/v1/ai/chat/turn", {
      clientId,
      generationId: genId,
      message: "try to revise rejected",
    });
    expect(onRejected.status).toBe(409);
    expect(onRejected.body.error).toBe("generation is rejected, not validated");

    const postList = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(postList.body.messages).toHaveLength(preCount);
  });

  test("chat: DELETE clears transcript idempotently", async () => {
    const del = await call("DELETE", `/v1/ai/chat?clientId=${clientId}`);
    expect(del.status).toBe(204);

    const list = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(list.status).toBe(200);
    expect(list.body.messages).toEqual([]);

    // Idempotent
    const delAgain = await call("DELETE", `/v1/ai/chat?clientId=${clientId}`);
    expect(delAgain.status).toBe(204);
  });

  test("loadRevisionConversation returns recent chat+revision rows oldest-first, skipping draft/error", async () => {
    // Empty transcript to start from a known state
    await call("DELETE", `/v1/ai/chat?clientId=${clientId}`);

    const msg1 = "How is the squat volume feeling?";
    const send1 = await call("POST", "/v1/ai/chat", { clientId, message: msg1, providerId: "mock" });
    expect(send1.status).toBe(201);

    // Fresh parent — never reuse genId (rejected in a prior test)
    const parentRes = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
    expect(parentRes.status).toBe(201);
    expect(parentRes.body.status).toBe("validated");
    const parentId = parentRes.body.id;

    const reviseMsg = "Pull week 3 volume back 20%";
    const rev = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: parentId, message: reviseMsg, providerId: "mock" });
    expect(rev.status).toBe(201);
    const built = await call("POST", `/v1/ai/chat/proposals/${rev.body.messages[1].id}/build`, { providerId: "mock" });
    expect(built.status).toBe(201);
    const childId = built.body.generation.id;

    const result = await loadRevisionConversation(childId);
    expect(result).not.toBeNull();
    expect(result).toContain(`Trainer: ${msg1}`);
    expect(result).toContain(`Trainer: ${reviseMsg}`);
    const firstIdx = result!.indexOf(`Trainer: ${msg1}`);
    const secondIdx = result!.indexOf(`Trainer: ${reviseMsg}`);
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(result).not.toContain("Draft ready:");

    // Unknown generation -> null
    expect(await loadRevisionConversation(crypto.randomUUID())).toBeNull();

    // Window caps at 10 rows (oldest dropped)
    for (let i = 0; i < 12; i++) {
      const sent = await call("POST", "/v1/ai/chat", { clientId, message: `filler ${i}`, providerId: "mock" });
      expect(sent.status).toBe(201);
    }
    const capped = await loadRevisionConversation(childId);
    expect(capped!.split("\n").length === 10).toBe(true);
  });

  test("chat revise never creates, approves, or activates a program", async () => {
    const before = await call("GET", `/v1/clients/${clientId}`);
    expect(before.status).toBe(200);
    const programsBefore = before.body.programs.map((p: any) => [p.id, p.status]);

    const parentRes = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
    expect(parentRes.status).toBe(201);
    expect(parentRes.body.status).toBe("validated");
    const parentId = parentRes.body.id;

    const rev = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: parentId, message: "Keep everything, small tweak", providerId: "mock" });
    expect(rev.status).toBe(201);
    const built = await call("POST", `/v1/ai/chat/proposals/${rev.body.messages[1].id}/build`, { providerId: "mock" });
    expect(built.status).toBe(201);
    const generation = built.body.generation;

    const after = await call("GET", `/v1/clients/${clientId}`);
    expect(after.status).toBe(200);
    const programsAfter = after.body.programs.map((p: any) => [p.id, p.status]);
    expect(programsAfter).toEqual(programsBefore);

    expect(generation.status !== "approved").toBe(true);
    expect(generation.approvedProgramId === null).toBe(true);

    const parentAfter = await call("GET", `/v1/ai/generations/${parentId}`);
    expect(parentAfter.status).toBe(200);
    expect(parentAfter.body.status).toBe("validated");
  });

  test("a chat-revised draft approves through the unchanged generations route", async () => {
    const parentRes = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
    expect(parentRes.status).toBe(201);
    const rev = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: parentRes.body.id, message: "Add a core finisher", providerId: "mock" });
    expect(rev.status).toBe(201);
    const built = await call("POST", `/v1/ai/chat/proposals/${rev.body.messages[1].id}/build`, { providerId: "mock" });
    expect(built.status).toBe(201);
    const childId = built.body.generation.id;

    const approved = await call("POST", `/v1/ai/generations/${childId}/approve`, {});
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("draft");
    expect(approved.body.aiAssisted).toBe(true);

    const genAfter = await call("GET", `/v1/ai/generations/${childId}`);
    expect(genAfter.status).toBe(200);
    expect(genAfter.body.status).toBe("approved");
    expect(genAfter.body.approvedProgramId).toBe(approved.body.id);
  });
});

describe.skipIf(!dbUp)("block plan edit (no AI)", () => {
  let clientId = "";
  let trainerId = "";
  let genId = "";
  let original: any = null;

  test("setup: client and a validated block draft", async () => {
    const c = await call("POST", "/v1/clients", { name: "Plan Edit Client", email: `plan-${Date.now()}@test.dev`, sessionsPerWeek: 3 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    const g = await call("POST", "/v1/ai/generate", { clientId: c.body.id, providerId: "mock" });
    expect(g.status).toBe(201);
    genId = g.body.id;
    trainerId = g.body.trainerId;
    original = g.body.draft.phasing;
    expect(original?.weeks?.length).toBeGreaterThan(1);
  });

  test("saving an edited plan creates the next version with only the plan changed", async () => {
    const phasing = structuredClone(original);
    phasing.weeks[1] = { ...phasing.weeks[1], directive: "deload", target: { metric: "overall_volume", deltaPercent: -30 }, note: "Travel week" };
    const res = await call("POST", `/v1/ai/generations/${genId}/phasing`, { phasing });
    expect(res.status).toBe(201);
    expect(res.body.parentGenerationId).toBe(genId);
    expect(res.body.status).toBe("validated");
    expect(res.body.manualEdit).toBe(true);
    expect(res.body.revisionMessage).toBe("Block plan edited by you");
    expect(res.body.draft.phasing.weeks[1].directive).toBe("deload");

    const parent = await call("GET", `/v1/ai/generations/${genId}`);
    expect(res.body.draft.sessions).toEqual(parent.body.draft.sessions);
    expect(parent.body.manualEdit).toBe(false);
  });

  test("an unchanged plan is refused", async () => {
    const res = await call("POST", `/v1/ai/generations/${genId}/phasing`, { phasing: original });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("phasing is unchanged");
  });

  test("an invalid plan is refused", async () => {
    const bad = { ...structuredClone(original), plannedWeeks: 1 };
    const res = await call("POST", `/v1/ai/generations/${genId}/phasing`, { phasing: bad });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("invalid phasing document");
  });

  test("unknown generation is 404", async () => {
    const res = await call("POST", `/v1/ai/generations/00000000-0000-0000-0000-000000000000/phasing`, { phasing: original });
    expect(res.status).toBe(404);
  });

  test("a draft that is not validated is refused", async () => {
    const [pending] = await db
      .insert(aiGenerations)
      .values({ trainerId, clientId, kind: "block", providerId: "mock", model: "mock-draft-v1", status: "pending" })
      .returning();
    const res = await call("POST", `/v1/ai/generations/${pending.id}/phasing`, { phasing: original });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("generation is pending, not validated");
  });

  test("a week draft is refused", async () => {
    const [week] = await db
      .insert(aiGenerations)
      .values({
        trainerId,
        clientId,
        kind: "week",
        targetWeek: 2,
        providerId: "mock",
        model: "mock-week-v1",
        status: "validated",
        draft: mockWeekDraft(2, null),
      })
      .returning();
    const res = await call("POST", `/v1/ai/generations/${week.id}/phasing`, { phasing: original });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("week drafts follow the block's plan");
  });

  test("a plan edit while a revision is running is refused", async () => {
    const [running] = await db
      .insert(aiGenerations)
      .values({ trainerId, clientId, kind: "block", providerId: "mock", model: "mock-draft-v1", status: "pending", parentGenerationId: genId })
      .returning();
    const phasing = structuredClone(original);
    phasing.weeks[0] = { ...phasing.weeks[0], note: "Deload week" };
    const res = await call("POST", `/v1/ai/generations/${genId}/phasing`, { phasing });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("a revision is already running for this generation");

    await db.delete(aiGenerations).where(eq(aiGenerations.id, running.id));
  });
});
