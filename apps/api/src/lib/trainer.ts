import { db, trainers } from "@pt/db";

/**
 * Single-tenant for now: resolve (or lazily seed) the default trainer.
 * When multi-trainer auth lands, this helper dies and routes take the
 * trainer id from the session instead.
 */
export async function getDefaultTrainerId(): Promise<string> {
  const existing = await db.select().from(trainers).limit(1);
  if (existing.length > 0) return existing[0].id;

  const [created] = await db
    .insert(trainers)
    .values({
      name: process.env.DEFAULT_TRAINER_NAME ?? "Default Trainer",
      email: process.env.DEFAULT_TRAINER_EMAIL ?? "trainer@localhost.dev",
    })
    .returning();
  return created.id;
}
