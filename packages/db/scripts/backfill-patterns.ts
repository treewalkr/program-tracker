import { db, exercises } from "../src";
import { eq, isNull, or, sql } from "drizzle-orm";
import { classifyExercise } from "./map-patterns";

const untagged = sql`${exercises.movementPatterns} = '[]'::jsonb`;

async function main() {
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      movementPatterns: exercises.movementPatterns,
      functionalMovement: exercises.functionalMovement,
    })
    .from(exercises)
    .where(or(untagged, isNull(exercises.functionalMovement)));

  let classifiedPatterns = 0;
  let classifiedFunctionals = 0;

  for (const ex of rows) {
    const match = classifyExercise(ex.name);
    const updates: Partial<typeof exercises.$inferInsert> = {};

    if (ex.movementPatterns.length === 0 && match.movementPattern !== null) {
      updates.movementPatterns = [match.movementPattern];
      updates.legacyMovementPattern = match.movementPattern;
      classifiedPatterns++;
    }
    if (ex.functionalMovement === null && match.functionalMovement !== null) {
      updates.functionalMovement = match.functionalMovement;
      classifiedFunctionals++;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(exercises).set(updates).where(eq(exercises.id, ex.id));
    }
  }

  const unclassifiedRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(exercises)
    .where(untagged);
  const remaining = unclassifiedRows[0]?.count ?? 0;

  console.log(
    `✓ classified ${classifiedPatterns} movement patterns / ${classifiedFunctionals} functional movements · ${remaining} exercises remain unclassified`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
