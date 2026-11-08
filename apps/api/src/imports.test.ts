import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { aiImports, clients, db, exerciseAliases, exercises, llmCalls, trainers } from "@pt/db";
import { IMPORT_MAX_CHARS, buildImportResult, type ImportResult } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { settleImport } from "./lib/imports";
import { MOCK_UNREADABLE } from "./ai/mock";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping import tests");
}

const FIXTURE = readFileSync(new URL("../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");

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

const exercisesOf = (r: ImportResult) => r.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises)));

describe.skipIf(!dbUp)("/v1/ai/imports", () => {
  let trainerId = "";
  let clientId = "";
  let otherTrainerId = "";
  let otherClientId = "";
  let otherExerciseId = "";

  beforeAll(async () => {
    trainerId = await getDefaultTrainerId();
    [{ id: clientId }] = await db.insert(clients).values({ trainerId, name: "ZZ Import Client" }).returning();
    [{ id: otherTrainerId }] = await db
      .insert(trainers)
      .values({ name: "ZZ Other", email: `zz-import-${crypto.randomUUID()}@example.com` })
      .returning();
    [{ id: otherClientId }] = await db.insert(clients).values({ trainerId: otherTrainerId, name: "ZZ Theirs" }).returning();
    [{ id: otherExerciseId }] = await db
      .insert(exercises)
      .values({ trainerId: otherTrainerId, name: "ZZ Their Row", primaryMuscleGroup: "back", equipment: "other" })
      .returning();
  });

  afterAll(async () => {
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(trainers).where(eq(trainers.id, otherTrainerId));
    await db.delete(exerciseAliases).where(eq(exerciseAliases.trainerId, trainerId));
  });

  test("reads the fixture end to end: stored row, progress, checks, blocks, matches, logged calls", async () => {
    const { status, body } = await call("POST", "/v1/ai/imports", { clientId, text: FIXTURE, providerId: "mock" });
    expect(status).toBe(201);
    expect(body).toMatchObject({ status: "done", chunksTotal: 2, chunksDone: 2, providerId: "mock", error: null });
    const result = body.result as ImportResult;
    expect(result.weeks.map((w) => w.label)).toEqual(["Week 11", "Week 12"]);
    expect(result.blocks).toEqual([{ weeks: [0] }, { weeks: [1] }]);
    expect(result.defaultBlock).toBe(1);
    expect(result.unused).toEqual([]);
    // the fixture catalog holds Bench Press and Back Squat
    const bench = exercisesOf(result).find((e) => e.line === 20)!;
    expect(bench.match).toMatchObject({ kind: "exact", exerciseName: "Bench Press" });
    const squat = exercisesOf(result).find((e) => e.line === 56)!;
    expect(squat.match).toMatchObject({ kind: "fuzzy", exerciseName: "Back Squat" });
    expect(exercisesOf(result).find((e) => e.line === 43)!.match).toEqual({ kind: "new", exerciseName: "Crossover / Dip" });

    const calls = await db.select().from(llmCalls).where(eq(llmCalls.purpose, "program_import"));
    const mine = calls.filter((c) => (c.context as { importId?: string }).importId === body.id);
    expect(mine).toHaveLength(2);
    expect(mine.every((c) => c.temperature === 0 && c.isMock && c.status === "ok")).toBe(true);
    expect(new Set(mine.map((c) => c.turnId)).size).toBe(1);

    // polling after the POST returns the same settled row
    const polled = await call("GET", `/v1/ai/imports/${body.id}`);
    expect(polled.status).toBe(200);
    expect(polled.body).toMatchObject({ id: body.id, status: "done", chunksDone: 2 });
    expect(polled.body.result.weeks).toHaveLength(2);

    const list = await call("GET", `/v1/ai/imports?clientId=${clientId}`);
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ id: body.id, status: "done", preview: expect.stringMatching(/^Week 11/) });
    expect(list.body[0].result).toBeUndefined();
  });

  test("a chunk that fails is unread; the others are kept", async () => {
    const text = FIXTURE.replace("Week 12\n", `Week 12\n${MOCK_UNREADABLE}\n`);
    const { status, body } = await call("POST", "/v1/ai/imports", { clientId, text, providerId: "mock" });
    expect(status).toBe(201);
    expect(body.status).toBe("done");
    expect(body.chunksDone).toBe(2);
    expect(body.result.weeks.map((w: { label: string }) => w.label)).toEqual(["Week 11"]);
    expect(body.result.unread).toEqual([{ from: 37, to: 62, error: expect.stringContaining("parse failure") }]);
  });

  test("every chunk unread → failed with 502", async () => {
    const { status, body } = await call("POST", "/v1/ai/imports", { clientId, text: `Week 1\n${MOCK_UNREADABLE}`, providerId: "mock" });
    expect(status).toBe(502);
    expect(body.status).toBe("failed");
    expect(body.error).toContain("parse failure");
  });

  test("cancel wins over a late settle", async () => {
    const [row] = await db
      .insert(aiImports)
      .values({ trainerId, clientId, text: FIXTURE, providerId: "mock", model: "mock-draft-v1", chunksTotal: 2 })
      .returning();
    const cancelled = await call("POST", `/v1/ai/imports/${row.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");

    const late = await settleImport(row.id, buildImportResult(FIXTURE, []), false);
    expect(late.code).toBe(200);
    expect(late.row).toMatchObject({ status: "cancelled", result: null });

    expect((await call("POST", `/v1/ai/imports/${row.id}/cancel`)).status).toBe(409);
  });

  test("text is capped at 20,000 characters; empty notes are refused", async () => {
    const tooLong = await call("POST", "/v1/ai/imports", { clientId, text: "x".repeat(IMPORT_MAX_CHARS + 1), providerId: "mock" });
    expect(tooLong.status).toBe(422);
    const blank = await call("POST", "/v1/ai/imports", { clientId, text: "\n————\n", providerId: "mock" });
    expect(blank.status).toBe(422);
  });

  test("another trainer's client and import read as not found", async () => {
    const post = await call("POST", "/v1/ai/imports", { clientId: otherClientId, text: FIXTURE, providerId: "mock" });
    expect(post.status).toBe(404);
    const [theirs] = await db
      .insert(aiImports)
      .values({ trainerId: otherTrainerId, clientId: otherClientId, text: "x", providerId: "mock", model: "mock-draft-v1" })
      .returning();
    expect((await call("GET", `/v1/ai/imports/${theirs.id}`)).status).toBe(404);
    expect((await call("POST", `/v1/ai/imports/${theirs.id}/cancel`)).status).toBe(404);
    expect((await call("GET", `/v1/ai/imports?clientId=${otherClientId}`)).status).toBe(404);
  });

  test("aliases: personal upsert, normalized, used by the next import, scoped to the trainer's catalog", async () => {
    const [squat] = await db.select().from(exercises).where(eq(exercises.name, "Back Squat"));
    const saved = await call("POST", "/v1/vocabulary/aliases", {
      items: [{ alias: "  Squat! ", exerciseId: squat.id, source: "import" }],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.aliases[0]).toMatchObject({ trainerId, alias: "squat", exerciseId: squat.id, source: "import" });

    // same alias again updates in place
    const [bench] = await db.select().from(exercises).where(eq(exercises.name, "Bench Press"));
    const again = await call("POST", "/v1/vocabulary/aliases", { items: [{ alias: "squat", exerciseId: bench.id, source: "manual" }] });
    expect(again.status).toBe(201);
    const rows = await db
      .select()
      .from(exerciseAliases)
      .where(and(eq(exerciseAliases.trainerId, trainerId), eq(exerciseAliases.alias, "squat")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ exerciseId: bench.id, source: "manual" });

    // put it back and read: "Squat" now matches by alias
    await call("POST", "/v1/vocabulary/aliases", { items: [{ alias: "squat", exerciseId: squat.id, source: "import" }] });
    const { body } = await call("POST", "/v1/ai/imports", { clientId, text: FIXTURE, providerId: "mock" });
    expect(exercisesOf(body.result).find((e) => e.line === 56)!.match).toMatchObject({ kind: "alias", exerciseId: squat.id });

    // another trainer's exercise is out of reach; seed source is not writable
    const foreign = await call("POST", "/v1/vocabulary/aliases", { items: [{ alias: "row", exerciseId: otherExerciseId, source: "import" }] });
    expect(foreign.status).toBe(404);
    const seed = await call("POST", "/v1/vocabulary/aliases", { items: [{ alias: "row", exerciseId: squat.id, source: "seed" }] });
    expect(seed.status).toBe(422);
    const other = await db.select().from(exerciseAliases).where(inArray(exerciseAliases.exerciseId, [otherExerciseId]));
    expect(other).toHaveLength(0);
  });
});
