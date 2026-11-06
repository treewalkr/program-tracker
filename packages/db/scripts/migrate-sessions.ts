/**
 * One-off data migration: program weeks `days[] → sessions[]` (flat sessions with
 * seq + weekday). Reads every `programs` row, maps each week through
 * `migrateLegacyWeek`, validates with `ProgramWeeksDocument`, and writes back only
 * rows that changed. Idempotent — already-flat documents pass through untouched.
 *
 *   bun run migrate:sessions            # write
 *   bun run migrate:sessions --dry-run  # summary only
 */
import { migrateLegacyWeek, ProgramWeeksDocument, type ProgramWeek } from "@pt/shared";

export type MigrateResult =
  | { status: "unchanged" }
  | { status: "migrated"; weeks: ProgramWeek[] }
  | { status: "invalid"; error: string };

/** Pure: legacy (or already-flat) weeks document → validated flat document. */
export function migrateProgramSessions(doc: unknown): MigrateResult {
  if (!Array.isArray(doc)) return { status: "invalid", error: "sessions column is not an array" };
  const isLegacy = doc.some((w) => Array.isArray((w as { days?: unknown })?.days));
  const parsed = ProgramWeeksDocument.safeParse(isLegacy ? doc.map(migrateLegacyWeek) : doc);
  if (!parsed.success) {
    return { status: "invalid", error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return isLegacy ? { status: "migrated", weeks: parsed.data } : { status: "unchanged" };
}

export async function main(dryRun: boolean) {
  const { eq } = await import("drizzle-orm");
  const { db, programs } = await import("../src");
  const rows = await db.select({ id: programs.id, name: programs.name, sessions: programs.sessions }).from(programs);

  let migrated = 0;
  let unchanged = 0;
  const invalid: string[] = [];

  for (const row of rows) {
    const result = migrateProgramSessions(row.sessions);
    if (result.status === "unchanged") {
      unchanged++;
      continue;
    }
    if (result.status === "invalid") {
      invalid.push(`${row.id} (${row.name}): ${result.error}`);
      continue;
    }
    if (!dryRun) {
      await db.update(programs).set({ sessions: result.weeks }).where(eq(programs.id, row.id));
    }
    migrated++;
  }

  const verb = dryRun ? "would migrate" : "migrated";
  console.log(`sessions: ${verb} ${migrated}, unchanged ${unchanged}, invalid ${invalid.length} (of ${rows.length})`);
  for (const line of invalid) console.log(`  ✗ ${line}`);
}

if (import.meta.main) {
  main(process.argv.includes("--dry-run"))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("migration failed:", err);
      process.exit(1);
    });
}
