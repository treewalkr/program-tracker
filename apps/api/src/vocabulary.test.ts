import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db, exerciseAliases, exercises, glossaryTerms, trainers } from "@pt/db";
import { DEFAULT_GLOSSARY } from "@pt/shared";
import { assertTestDatabaseUrl, vocabularySeedStatements } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping vocabulary tests");
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

const uniq = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;

describe.skipIf(!dbUp)("/v1/vocabulary aliases and glossary", () => {
  let trainerId = "";
  let otherTrainerId = "";
  let squatId = "";
  let benchId = "";
  let otherExerciseId = "";

  beforeAll(async () => {
    trainerId = await getDefaultTrainerId();
    [{ id: squatId }] = await db.select().from(exercises).where(and(eq(exercises.name, "Back Squat"), isNull(exercises.trainerId)));
    [{ id: benchId }] = await db.select().from(exercises).where(and(eq(exercises.name, "Bench Press"), isNull(exercises.trainerId)));
    [{ id: otherTrainerId }] = await db
      .insert(trainers)
      .values({ name: "ZZ Vocab", email: `zz-vocab-${crypto.randomUUID()}@example.com` })
      .returning();
    [{ id: otherExerciseId }] = await db
      .insert(exercises)
      .values({ trainerId: otherTrainerId, name: "ZZ Their Lift", primaryMuscleGroup: "back", equipment: "other" })
      .returning();
  });

  afterAll(async () => {
    await db.delete(trainers).where(eq(trainers.id, otherTrainerId));
  });

  test("the migration seeds the global glossary and aliases by library name", async () => {
    const global = await db.select().from(glossaryTerms).where(isNull(glossaryTerms.trainerId));
    expect(global.map((g) => g.term).sort()).toEqual(DEFAULT_GLOSSARY.map((g) => g.term).sort());

    const [bbSquat] = await db
      .insert(exercises)
      .values({ trainerId: null, name: "Barbell Back Squat", primaryMuscleGroup: "quads", equipment: "barbell" })
      .returning();
    try {
      for (const s of vocabularySeedStatements()) await db.execute(s);
      const seeded = await db.select().from(exerciseAliases).where(eq(exerciseAliases.exerciseId, bbSquat.id));
      expect(seeded.map((a) => [a.alias, a.trainerId, a.source]).sort()).toEqual([
        ["back squat", null, "seed"],
        ["squat", null, "seed"],
      ]);
      // idempotent; aliases whose exercise isn't in the library are skipped
      for (const s of vocabularySeedStatements()) await db.execute(s);
      expect(await db.select().from(exerciseAliases).where(eq(exerciseAliases.exerciseId, bbSquat.id))).toHaveLength(2);
    } finally {
      await db.delete(exercises).where(eq(exercises.id, bbSquat.id));
    }
  });

  test("aliases: list personal and global, re-point, delete; global rows are read-only", async () => {
    const alias = uniq("zz sq ");
    await call("POST", "/v1/vocabulary/aliases", { items: [{ alias, exerciseId: squatId, source: "manual" }] });
    const [globalRow] = await db
      .insert(exerciseAliases)
      .values({ trainerId: null, alias: uniq("zz global "), exerciseId: benchId, source: "seed" })
      .returning();
    try {
      const list = (await call("GET", "/v1/vocabulary/aliases")).body as any[];
      const mine = list.find((a) => a.alias === alias);
      expect(mine).toMatchObject({ exerciseId: squatId, exerciseName: "Back Squat", scope: "personal" });
      expect(list.find((a) => a.id === globalRow.id)).toMatchObject({ scope: "global", exerciseName: "Bench Press" });
      expect(list.findIndex((a) => a.id === mine.id)).toBeLessThan(list.findIndex((a) => a.id === globalRow.id));

      const moved = await call("PATCH", `/v1/vocabulary/aliases/${mine.id}`, { exerciseId: benchId });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({ id: mine.id, exerciseId: benchId, exerciseName: "Bench Press", scope: "personal" });
      expect((await call("PATCH", `/v1/vocabulary/aliases/${mine.id}`, { exerciseId: otherExerciseId })).status).toBe(404);

      expect((await call("PATCH", `/v1/vocabulary/aliases/${globalRow.id}`, { exerciseId: squatId })).status).toBe(403);
      expect((await call("DELETE", `/v1/vocabulary/aliases/${globalRow.id}`)).status).toBe(403);

      expect((await call("DELETE", `/v1/vocabulary/aliases/${mine.id}`)).status).toBe(200);
      expect((await call("GET", "/v1/vocabulary/aliases")).body.some((a: any) => a.id === mine.id)).toBe(false);
    } finally {
      await db.delete(exerciseAliases).where(eq(exerciseAliases.id, globalRow.id));
    }
  });

  test("aliases: another trainer's reads as not found", async () => {
    const [theirs] = await db
      .insert(exerciseAliases)
      .values({ trainerId: otherTrainerId, alias: uniq("zz theirs "), exerciseId: otherExerciseId, source: "import" })
      .returning();
    expect((await call("PATCH", `/v1/vocabulary/aliases/${theirs.id}`, { exerciseId: squatId })).status).toBe(404);
    expect((await call("DELETE", `/v1/vocabulary/aliases/${theirs.id}`)).status).toBe(404);
    expect((await call("GET", "/v1/vocabulary/aliases")).body.some((a: any) => a.id === theirs.id)).toBe(false);
  });

  test("glossary: add, edit, delete; a personal term overrides the global one", async () => {
    const before = (await call("GET", "/v1/vocabulary/glossary")).body as any[];
    const sa = before.find((g) => g.term === "SA");
    expect(sa).toMatchObject({ meaning: "single arm", kind: "abbreviation", scope: "global" });

    const made = await call("POST", "/v1/vocabulary/glossary", { term: " sa ", meaning: "  standing   alternating ", kind: "abbreviation" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ term: "sa", meaning: "standing alternating", scope: "personal" });
    try {
      const after = (await call("GET", "/v1/vocabulary/glossary")).body as any[];
      expect(after.filter((g) => g.term.toLowerCase() === "sa")).toEqual([made.body]);
      expect(after[0].scope).toBe("personal");

      expect((await call("POST", "/v1/vocabulary/glossary", { term: "SA", meaning: "x", kind: "other" })).status).toBe(409);
      expect((await call("POST", "/v1/vocabulary/glossary", { term: "x", meaning: "y", kind: "nope" })).status).toBe(422);

      const edited = await call("PATCH", `/v1/vocabulary/glossary/${made.body.id}`, { meaning: "single arm, alternating", kind: "technique" });
      expect(edited.body).toMatchObject({ term: "sa", meaning: "single arm, alternating", kind: "technique" });

      const other = await call("POST", "/v1/vocabulary/glossary", { term: uniq("Zz"), meaning: "x", kind: "other" });
      expect((await call("PATCH", `/v1/vocabulary/glossary/${other.body.id}`, { term: "SA" })).status).toBe(409);
      expect((await call("DELETE", `/v1/vocabulary/glossary/${other.body.id}`)).status).toBe(200);
    } finally {
      expect((await call("DELETE", `/v1/vocabulary/glossary/${made.body.id}`)).status).toBe(200);
    }
    expect((await call("GET", "/v1/vocabulary/glossary")).body.find((g: any) => g.term === "SA").scope).toBe("global");
  });

  test("glossary: global rows are read-only; another trainer's reads as not found", async () => {
    const [global] = await db.select().from(glossaryTerms).where(and(isNull(glossaryTerms.trainerId), eq(glossaryTerms.term, "RPE")));
    expect((await call("PATCH", `/v1/vocabulary/glossary/${global.id}`, { meaning: "mine" })).status).toBe(403);
    expect((await call("DELETE", `/v1/vocabulary/glossary/${global.id}`)).status).toBe(403);

    const [theirs] = await db.insert(glossaryTerms).values({ trainerId: otherTrainerId, term: "ZZT", meaning: "theirs", kind: "other" }).returning();
    expect((await call("PATCH", `/v1/vocabulary/glossary/${theirs.id}`, { meaning: "mine" })).status).toBe(404);
    expect((await call("DELETE", `/v1/vocabulary/glossary/${theirs.id}`)).status).toBe(404);
    expect((await call("GET", "/v1/vocabulary/glossary")).body.some((g: any) => g.id === theirs.id)).toBe(false);
    expect(trainerId).not.toBe(otherTrainerId);
  });
});
