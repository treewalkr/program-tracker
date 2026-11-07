import { db, trainers } from "@pt/db";

/**
 * The oldest trainer, lazily seeded. Only used when AUTH_DISABLED=true
 * (tests, local hacking) — signed-in requests take the trainer from the
 * session via `trainerContext`.
 */
export async function getDefaultTrainerId(): Promise<string> {
  const existing = await db.select().from(trainers).orderBy(trainers.createdAt).limit(1);
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
