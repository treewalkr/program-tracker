import { db, exercises } from "../src";
import { eq, isNull, or, sql } from "drizzle-orm";
import { classifyExercise } from "./map-patterns";

async function main() {
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      movementPattern: exercises.movementPattern,
      functionalMovement: exercises.functionalMovement,
    })
    .from(exercises)
    .where(or(isNull(exercises.movementPattern), isNull(exercises.functionalMovement)));

  let classifiedPatterns = 0;
  let classifiedFunctionals = 0;

  for (const ex of rows) {
    const match = classifyExercise(ex.name);
    const updates: {
      movementPattern?: typeof match.movementPattern;
      functionalMovement?: typeof match.functionalMovement;
    } = {};

    if (ex.movementPattern === null && match.movementPattern !== null) {
      updates.movementPattern = match.movementPattern;
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
    .where(isNull(exercises.movementPattern));
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
