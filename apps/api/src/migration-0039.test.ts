import { afterAll, describe, expect, test } from "bun:test";
import { eq, isNull } from "drizzle-orm";
import { aiImports, clients, db, exerciseAliases, exercises, trainers } from "@pt/db";

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  dbUp = false;
}

const created: string[] = [];
afterAll(async () => {
  if (!dbUp) return;
  for (const id of created) await db.delete(trainers).where(eq(trainers.id, id));
});

async function trainer() {
  const [t] = await db
    .insert(trainers)
    .values({ name: "ZZ-TEST 0039", email: `zz-test-0039-${crypto.randomUUID()}@example.com` })
    .returning();
  created.push(t.id);
  return t.id;
}

describe.skipIf(!dbUp)("migration 0039: ai_imports and exercise_aliases", () => {
  test("an import starts pending with no result, and goes with its client", async () => {
    const trainerId = await trainer();
    const [client] = await db.insert(clients).values({ trainerId, name: "ZZ Import" }).returning();
    const [row] = await db
      .insert(aiImports)
      .values({ trainerId, clientId: client.id, text: "Week 1", providerId: "mock", model: "mock-draft-v1" })
      .returning();
    expect(row).toMatchObject({ status: "pending", chunksTotal: 0, chunksDone: 0, result: null, error: null, effort: null });

    await db.delete(clients).where(eq(clients.id, client.id));
    expect(await db.select().from(aiImports).where(eq(aiImports.id, row.id))).toHaveLength(0);
  });

  test("one alias per trainer and name — global (null trainer) ones included", async () => {
    const trainerId = await trainer();
    const [ex] = await db.select().from(exercises).where(isNull(exercises.trainerId)).limit(1);
    const alias = `zz sa row ${crypto.randomUUID()}`;

    await db.insert(exerciseAliases).values({ trainerId, alias, exerciseId: ex.id, source: "import" });
    await expect(db.insert(exerciseAliases).values({ trainerId, alias, exerciseId: ex.id, source: "import" }).execute()).rejects.toThrow();

    await db.insert(exerciseAliases).values({ trainerId: null, alias, exerciseId: ex.id, source: "seed" });
    // NULLS NOT DISTINCT: a second global row with the same alias is a duplicate too
    await expect(db.insert(exerciseAliases).values({ trainerId: null, alias, exerciseId: ex.id, source: "seed" }).execute()).rejects.toThrow();

    await db.delete(trainers).where(eq(trainers.id, trainerId));
    const left = await db.select().from(exerciseAliases).where(eq(exerciseAliases.alias, alias));
    expect(left.map((a) => a.trainerId)).toEqual([null]);
    await db.delete(exerciseAliases).where(eq(exerciseAliases.alias, alias));
  });
});
