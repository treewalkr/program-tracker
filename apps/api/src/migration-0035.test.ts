import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { db, exercises, kineticChains, trainers } from "@pt/db";
import { KINETIC_CHAIN_DEFAULTS } from "@pt/shared";

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  dbUp = false;
}

const MIGRATION = new URL("../../../packages/db/drizzle/0035_taxonomy_chains.sql", import.meta.url).pathname;

/** Re-run 0035 (already applied by the test-db setup) against rows put back in their old state. */
async function runMigration() {
  const statements = readFileSync(MIGRATION, "utf8").split("--> statement-breakpoint");
  let updated = 0;
  for (const s of statements) {
    const res = await db.execute(sql.raw(s));
    updated += res.count ?? 0;
  }
  return updated;
}

const LIB = ["Nordic Hamstring Curl", "Dumbbell Lateral Raise", "Ab Wheel Rollout", "Cable Hip Adduction", "Side Plank"];
let trainerId = "";

afterAll(async () => {
  if (!dbUp) return;
  await db.delete(exercises).where(inArray(exercises.name, [...LIB, "ZZ-TEST Weighted Plank"]));
  if (trainerId) await db.delete(trainers).where(eq(trainers.id, trainerId));
});

describe.skipIf(!dbUp)("migration 0035: taxonomy and chain defaults (F19, F20)", () => {
  test("re-tags old library rows and default chains, leaves edits and custom chains alone, and is idempotent", async () => {
    await db.delete(exercises).where(inArray(exercises.name, [...LIB, "ZZ-TEST Weighted Plank"]));
    [{ id: trainerId }] = await db
      .insert(trainers)
      .values({ name: "ZZ-TEST 0035", email: `zz-test-0035-${crypto.randomUUID()}@example.com` })
      .returning({ id: trainers.id });

    await db.insert(exercises).values([
      // Library rows still at the old tags.
      { name: "Nordic Hamstring Curl", primaryMuscleGroup: "hamstrings", equipment: "bodyweight", movementPattern: "hip_dominant", functionalMovement: "bend_lift" },
      { name: "Dumbbell Lateral Raise", primaryMuscleGroup: "shoulders", equipment: "dumbbell", movementPattern: null, functionalMovement: null },
      { name: "Cable Hip Adduction", primaryMuscleGroup: "quads", secondaryMuscleGroups: [], equipment: "cable", movementPattern: null, functionalMovement: null },
      // A trainer re-tagged this library row: keep their choice.
      { name: "Ab Wheel Rollout", primaryMuscleGroup: "core", secondaryMuscleGroups: ["shoulders"], equipment: "other", movementPattern: "anti_rotation", functionalMovement: null },
      // Custom plank under the old "planks, rollouts" label: clearly wrong, fixed.
      { trainerId, name: "ZZ-TEST Weighted Plank", primaryMuscleGroup: "core", equipment: "other", movementPattern: "anti_trunk_flexion", functionalMovement: null },
    ]);

    const old: [string, string[]][] = [
      ["Intrinsic", ["back", "traps", "core"]], // same set, different order: still the default
      ["Deep Longitudinal", ["back", "hamstrings", "calves"]],
      ["Lateral", ["core", "glutes", "quads"]],
      ["Posterior Spiral", ["glutes", "back", "hamstrings"]],
      ["Anterior Spiral", ["core", "chest"]], // customised: untouched
    ];
    await db.insert(kineticChains).values(old.map(([name, muscleGroups], i) => ({ trainerId, name, muscleGroups, sortOrder: i + 1 })));

    expect(await runMigration()).toBeGreaterThan(0);

    const ex = new Map(
      (await db.select().from(exercises).where(inArray(exercises.name, [...LIB, "ZZ-TEST Weighted Plank"]))).map((e) => [e.name, e])
    );
    expect(ex.get("Nordic Hamstring Curl")).toMatchObject({ movementPattern: "knee_dominant", functionalMovement: null });
    expect(ex.get("Dumbbell Lateral Raise")?.movementPattern).toBe("isolation");
    expect(ex.get("Cable Hip Adduction")).toMatchObject({ primaryMuscleGroup: "adductors", movementPattern: "isolation" });
    expect(ex.get("Ab Wheel Rollout")?.movementPattern).toBe("anti_rotation");
    expect(ex.get("ZZ-TEST Weighted Plank")?.movementPattern).toBe("anti_extension");

    const chains = await db.select().from(kineticChains).where(eq(kineticChains.trainerId, trainerId));
    const byOrder = chains.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => [c.name, c.muscleGroups]);
    const def = (name: string) => [...KINETIC_CHAIN_DEFAULTS.find((c) => c.name === name)!.muscleGroups];
    expect(byOrder).toEqual([
      ["Intrinsic", def("Intrinsic")],
      ["Deep Longitudinal", ["back", "hamstrings", "calves"]],
      ["Lateral", def("Lateral")],
      ["Posterior Oblique", def("Posterior Oblique")],
      ["Anterior Spiral", ["core", "chest"]],
    ]);

    expect(await runMigration()).toBe(0);
  });
});
