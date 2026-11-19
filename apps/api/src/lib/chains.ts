import { asc, eq } from "drizzle-orm";
import { db, kineticChains, type KineticChainRow } from "@pt/db";
import { KINETIC_CHAIN_DEFAULTS } from "@pt/shared";

/**
 * The trainer's chains, seeding the defaults on first read. `write: false`
 * (a GET while the admin views as this trainer) never inserts: unseeded
 * defaults come back as unsaved rows instead.
 */
export async function ensureSeededChains(trainerId: string, { write = true } = {}): Promise<KineticChainRow[]> {
  const existing = await db
    .select()
    .from(kineticChains)
    .where(eq(kineticChains.trainerId, trainerId))
    .orderBy(asc(kineticChains.sortOrder));

  if (existing.length > 0) {
    return existing;
  }

  const toInsert = KINETIC_CHAIN_DEFAULTS.map((c) => ({
    trainerId,
    name: c.name,
    muscleGroups: [...c.muscleGroups],
    sortOrder: c.sortOrder,
  }));
  if (!write) {
    const now = new Date();
    return toInsert.map((c) => ({ ...c, id: crypto.randomUUID(), createdAt: now, updatedAt: now }));
  }

  await db
    .insert(kineticChains)
    .values(toInsert)
    .onConflictDoNothing();

  return db
    .select()
    .from(kineticChains)
    .where(eq(kineticChains.trainerId, trainerId))
    .orderBy(asc(kineticChains.sortOrder));
}
