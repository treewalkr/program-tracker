import { asc, eq } from "drizzle-orm";
import { db, kineticChains, type KineticChainRow } from "@pt/db";
import { KINETIC_CHAIN_DEFAULTS } from "@pt/shared";

export async function ensureSeededChains(trainerId: string): Promise<KineticChainRow[]> {
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
