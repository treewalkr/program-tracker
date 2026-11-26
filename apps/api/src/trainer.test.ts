import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { db, trainers } from "@pt/db";
import { getDefaultTrainerId } from "./lib/trainer";
import { assertTestDatabaseUrl } from "./testing/test-db";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping default trainer tests");
}

describe.skipIf(!dbUp)("getDefaultTrainerId", () => {
  test("parallel first requests seed exactly one default trainer, no throw", async () => {
    // The race needs every caller to find the table empty, so clear it all —
    // trainer references cascade, and later test files re-seed their own. A set
    // logged on a trainer's own exercise restricts that cascade: clear those first.
    await db.execute(sql`delete from set_logs where exercise_id in (select id from exercises where trainer_id is not null)`);
    await db.delete(trainers);
    const email = process.env.DEFAULT_TRAINER_EMAIL ?? "trainer@localhost.dev";

    // A winner whose insert has landed but not committed: the racers' selects
    // can't see its row (isolation), so they all try the same insert and meet
    // the unique email head-on — the same interleaving real parallel first
    // requests produce, but forced instead of raced on connection timing.
    const winner = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      await winner`begin`;
      await winner`insert into trainers (name, email) values ('Race Winner', ${email})`;
      const calls = Array.from({ length: 8 }, () => getDefaultTrainerId());

      // Let the racers run their selects and queue their inserts on the
      // uncommitted row before the winner commits (then commit regardless).
      for (let i = 0; i < 100; i++) {
        const [{ waiting }] = await winner`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`;
        if (waiting > 0) break;
        await Bun.sleep(20);
      }
      await winner`commit`;

      const ids = await Promise.all(calls);
      expect(new Set(ids).size).toBe(1);
      const rows = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.email, email));
      expect(rows.map((r) => r.id)).toEqual([ids[0]]);
    } finally {
      await winner.end().catch(() => {});
    }
  });
});
