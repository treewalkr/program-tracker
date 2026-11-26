import { db, trainers } from "@pt/db";

/**
 * The oldest trainer, lazily seeded. Only used when AUTH_DISABLED=true
 * (tests, local hacking) — signed-in requests take the trainer from the
 * session via `trainerContext`.
 */
export async function getDefaultTrainerId(): Promise<string> {
  const existing = await db.select().from(trainers).orderBy(trainers.createdAt).limit(1);
  if (existing.length > 0) return existing[0].id;

  // Parallel first requests can all find the table empty and race to insert.
  // The unique email turns every insert but the first into a no-op, so the
  // losers fall through to the re-select below and read the winner's row.
  await db
    .insert(trainers)
    .values({
      name: process.env.DEFAULT_TRAINER_NAME ?? "Default Trainer",
      email: process.env.DEFAULT_TRAINER_EMAIL ?? "trainer@localhost.dev",
    })
    .onConflictDoNothing();
  const [seeded] = await db.select().from(trainers).orderBy(trainers.createdAt).limit(1);
  return seeded.id;
}
