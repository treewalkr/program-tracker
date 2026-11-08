import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { aiImports, clients, db, exercises, programs, sessionLogs, setLogs, signalOutbox, trainers } from "@pt/db";
import {
  ProgramWeeksDocument,
  addDays,
  defaultWeekStarts,
  historyExerciseKey,
  isoWeekday,
  type ImportResult,
  type ProgramWeek,
} from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping history import tests");
}

const FIXTURE = readFileSync(new URL("../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const today = new Date().toISOString().slice(0, 10);
/** The Monday two weeks before this one: both pasted weeks are fully in the past. */
const latestMonday = addDays(today, -(isoWeekday(today) - 1) - 7);
const WEEK_STARTS = defaultWeekStarts(2, latestMonday);

const outboxCount = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(signalOutbox))[0].n;

describe.skipIf(!dbUp)("/v1/ai/imports/:id/history", () => {
  let trainerId = "";
  let clientId = "";
  let otherTrainerId = "";
  let otherExerciseId = "";
  let importId = "";
  let result: ImportResult;
  let picks: Record<string, string> = {};
  let benchId = "";

  beforeAll(async () => {
    trainerId = await getDefaultTrainerId();
    [{ id: clientId }] = await db
      .insert(clients)
      .values({ trainerId, name: "ZZ History Client", trainingDays: [1, 3, 5] })
      .returning();
    [{ id: otherTrainerId }] = await db
      .insert(trainers)
      .values({ name: "ZZ Other", email: `zz-history-${crypto.randomUUID()}@example.com` })
      .returning();
    [{ id: otherExerciseId }] = await db
      .insert(exercises)
      .values({ trainerId: otherTrainerId, name: "ZZ Their Row", primaryMuscleGroup: "back", equipment: "other" })
      .returning();

    const read = await call("POST", "/v1/ai/imports", { clientId, text: FIXTURE, providerId: "mock" });
    expect(read.status).toBe(201);
    importId = read.body.id;
    result = read.body.result;

    const [bench] = await db.select().from(exercises).where(eq(exercises.name, "Bench Press"));
    const [squat] = await db.select().from(exercises).where(eq(exercises.name, "Back Squat"));
    benchId = bench.id;
    for (const w of result.weeks)
      for (const d of w.days)
        for (const s of d.sessions)
          for (const e of s.exercises) picks[historyExerciseKey(e.sourceName)] = /bench/i.test(e.sourceName) ? bench.id : squat.id;
  });

  afterAll(async () => {
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(trainers).where(eq(trainers.id, otherTrainerId));
  });

  test("a new import has no saved history", async () => {
    const got = await call("GET", `/v1/ai/imports/${importId}`);
    expect(got.body.historyProgramIds).toBeNull();
  });

  test("refuses a week start after today and a foreign exercise", async () => {
    const future = await call("POST", `/v1/ai/imports/${importId}/history`, {
      weekStarts: [WEEK_STARTS[0], addDays(today, 3)],
      exercises: picks,
    });
    expect(future.status).toBe(422);

    const foreign = await call("POST", `/v1/ai/imports/${importId}/history`, {
      weekStarts: WEEK_STARTS,
      exercises: { ...picks, [historyExerciseKey("SA Row")]: otherExerciseId },
    });
    expect(foreign.status).toBe(422);
    expect(foreign.body.ids).toEqual([otherExerciseId]);

    const wrongCount = await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: [WEEK_STARTS[1]], exercises: picks });
    expect(wrongCount.status).toBe(422);

    const nothing = await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: WEEK_STARTS, exercises: {} });
    expect(nothing.status).toBe(422);

    expect((await db.select().from(programs).where(eq(programs.clientId, clientId)))).toHaveLength(0);
  });

  test("saves archived programs, logs and sets in one go — and no outbox rows", async () => {
    const before = await outboxCount();
    const saved = await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: WEEK_STARTS, exercises: picks });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ sessions: 6, sets: 122, skipped: [] });
    expect(saved.body.programs.map((p: { name: string }) => p.name)).toEqual([
      "Week 11 (Back/Biceps · Chest/Triceps · Lower)",
      "Week 12 (Upper Push · Upper Pull · Lower)",
    ]);
    expect(await outboxCount()).toBe(before);

    const ids = saved.body.programs.map((p: { id: string }) => p.id);
    const rows = await db.select().from(programs).where(inArray(programs.id, ids));
    expect(rows.every((p) => p.status === "archived" && p.clientId === clientId && p.trainerId === trainerId)).toBe(true);
    expect(rows.every((p) => p.description === `Imported from notes on ${today}`)).toBe(true);
    const w11 = rows.find((p) => p.id === ids[0])!;
    expect(w11.activatedAt?.toISOString().slice(0, 10)).toBe(WEEK_STARTS[0]);
    expect(ProgramWeeksDocument.safeParse(w11.sessions).success).toBe(true);

    const logs = await db.select().from(sessionLogs).where(eq(sessionLogs.clientId, clientId));
    expect(logs).toHaveLength(6);
    expect(logs.every((l) => l.kind === "lifting")).toBe(true);
    const w11Logs = logs.filter((l) => l.programId === ids[0]).sort((a, b) => a.date.localeCompare(b.date));
    expect(w11Logs.map((l) => l.date)).toEqual([WEEK_STARTS[0], addDays(WEEK_STARTS[0], 2), addDays(WEEK_STARTS[0], 4)]);
    expect(w11Logs[2].notes).toBe("From notes: Week 11 · Day 3 Lower\nKB American Swing: 25, 25, 25 reps");

    // every log and set links into its own program's week
    const sets = await db.select().from(setLogs).where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)));
    expect(sets).toHaveLength(122);
    for (const log of logs) {
      const weeks = rows.find((p) => p.id === log.programId)!.sessions as ProgramWeek[];
      const session = weeks.flatMap((w) => w.sessions).find((s) => s.id === log.programSessionId)!;
      expect(session.kind).toBe("lifting");
      const slotIds = new Set(session.exercises.map((e) => e.id));
      for (const s of sets.filter((x) => x.sessionLogId === log.id)) expect(slotIds.has(s.programExerciseId!)).toBe(true);
    }
    const benchSets = sets.filter((s) => s.exerciseId === benchId);
    expect(benchSets.length).toBeGreaterThan(0);

    const got = await call("GET", `/v1/ai/imports/${importId}`);
    expect(got.body.historyProgramIds).toEqual(ids);
  });

  test("a second save is refused", async () => {
    const again = await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: WEEK_STARTS, exercises: picks });
    expect(again.status).toBe(409);
  });

  test("another trainer's import reads as not found", async () => {
    const [theirClient] = await db.insert(clients).values({ trainerId: otherTrainerId, name: "ZZ Theirs" }).returning();
    const [theirs] = await db
      .insert(aiImports)
      .values({ trainerId: otherTrainerId, clientId: theirClient.id, text: "x", providerId: "mock", model: "mock-draft-v1", status: "done", result })
      .returning();
    expect((await call("POST", `/v1/ai/imports/${theirs.id}/history`, { weekStarts: WEEK_STARTS, exercises: picks })).status).toBe(404);
    expect((await call("DELETE", `/v1/ai/imports/${theirs.id}/history`)).status).toBe(404);
  });

  test("undo removes the programs and their logs; saving again works", async () => {
    const [row] = await db.select().from(aiImports).where(eq(aiImports.id, importId));
    const undone = await call("DELETE", `/v1/ai/imports/${importId}/history`);
    expect(undone.status).toBe(200);
    expect(undone.body).toEqual({ removed: 2 });
    expect(await db.select().from(programs).where(inArray(programs.id, row.historyProgramIds!))).toHaveLength(0);
    expect(await db.select().from(sessionLogs).where(eq(sessionLogs.clientId, clientId))).toHaveLength(0);
    expect((await call("GET", `/v1/ai/imports/${importId}`)).body.historyProgramIds).toBeNull();
    expect((await call("DELETE", `/v1/ai/imports/${importId}/history`)).status).toBe(409);

    const again = await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: WEEK_STARTS, exercises: picks });
    expect(again.status).toBe(201);
    expect(again.body.sessions).toBe(6);
  });
});
