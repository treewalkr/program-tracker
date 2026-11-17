import { asc, eq } from "drizzle-orm";
import { db, sessionTypes, type SessionTypeRow } from "@pt/db";
import { SESSION_TYPE_PRESETS } from "@pt/shared";

/**
 * The trainer's types, seeding any preset they don't have yet (first read, or a
 * preset added to the taxonomy later). A preset whose name one of the trainer's
 * own types already holds is skipped: names are unique per trainer.
 */
export async function ensureSessionTypes(trainerId: string): Promise<SessionTypeRow[]> {
  const list = () =>
    db.select().from(sessionTypes).where(eq(sessionTypes.trainerId, trainerId)).orderBy(asc(sessionTypes.createdAt), asc(sessionTypes.name));
  const existing = await list();
  const keys = new Set(existing.map((r) => r.presetKey));
  const names = new Set(existing.map((r) => r.name.toLowerCase()));
  const missing = SESSION_TYPE_PRESETS.filter((p) => !keys.has(p.key) && !names.has(p.name.toLowerCase()));
  if (missing.length === 0) return existing;
  // one statement, staggered timestamps so the presets keep their order; a concurrent seed
  // loses on the (trainer, lower(name)) unique index
  const now = Date.now();
  await db
    .insert(sessionTypes)
    .values(missing.map((p, i) => ({ trainerId, name: p.name, format: p.format, presetKey: p.key, createdAt: new Date(now + i) })))
    .onConflictDoNothing();
  return list();
}
