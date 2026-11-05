/**
 * Backfill `exerciseName` into stored program week docs.
 *
 * Programs saved before the exerciseName schema fix (2026-10) carry only
 * exerciseId — the log page then shows raw UUIDs where names belong. Resolves
 * every missing name from the exercise catalog and revalidates the doc with
 * the shared schema before writing.
 *
 * Run (repo root):  cd apps/api && set -a && . ../../.env.local && set +a && bun run scripts/backfill-exercise-names.ts
 * Idempotent — rows already carrying names are left untouched.
 */
import { eq } from "drizzle-orm";
import { db, exercises, programs } from "@pt/db";
import { ProgramWeeksDocument } from "@pt/shared";

const catalog = new Map<string, string>((await db.select().from(exercises)).map((e) => [e.id, e.name]));

const rows = await db.select().from(programs);
let patched = 0;
let skipped = 0;
let missing = 0;

for (const row of rows) {
  const parsed = ProgramWeeksDocument.safeParse(row.sessions);
  if (!parsed.success) {
    skipped++;
    console.warn(`skip ${row.id} (${row.name}): weeks doc fails schema`);
    continue;
  }

  let changed = false;
  const weeks = parsed.data.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      sessions: day.sessions.map((session) => ({
        ...session,
        exercises: session.exercises.map((ex) => {
          if (ex.exerciseName) return ex;
          const name = catalog.get(ex.exerciseId);
          if (!name) {
            missing++;
            console.warn(`no catalog row for exerciseId ${ex.exerciseId} (${row.name})`);
            return ex;
          }
          changed = true;
          return { ...ex, exerciseName: name };
        }),
      })),
    })),
  }));

  if (!changed) continue;
  await db.update(programs).set({ sessions: weeks }).where(eq(programs.id, row.id));
  patched++;
  console.log(`patched ${row.name} (${row.id})`);
}

console.log(`done: ${patched} patched, ${rows.length - patched - skipped} already named, ${skipped} skipped, ${missing} unresolved exerciseIds`);
process.exit(0);
