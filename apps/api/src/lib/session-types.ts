import { asc, eq } from "drizzle-orm";
import { db, sessionTypes, type SessionTypeRow } from "@pt/db";
import { SESSION_TYPE_DEFAULTS } from "@pt/shared";

/** The trainer's types, seeding the defaults the first time (none yet). */
export async function ensureSessionTypes(trainerId: string): Promise<SessionTypeRow[]> {
  const list = () =>
    db.select().from(sessionTypes).where(eq(sessionTypes.trainerId, trainerId)).orderBy(asc(sessionTypes.createdAt), asc(sessionTypes.name));
  const existing = await list();
  if (existing.length > 0) return existing;
  // one statement, staggered timestamps so the defaults keep their order
  const now = Date.now();
  await db
    .insert(sessionTypes)
    .values(SESSION_TYPE_DEFAULTS.map((d, i) => ({ trainerId, name: d.name, format: d.format, createdAt: new Date(now + i) })))
    .onConflictDoNothing();
  return list();
}
