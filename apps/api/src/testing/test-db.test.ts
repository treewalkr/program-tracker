import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db, clients, exercises, trainers } from "@pt/db";
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
  prepareTestDatabase,
  resolveTestDatabaseUrl,
} from "./test-db";

describe("assertTestDatabaseUrl", () => {
  test("T1 rejects non-test database names", () => {
    const live = "postgres://pt:pt_dev_password@localhost:5433/program_tracker";
    expect(() => assertTestDatabaseUrl(live)).toThrow(
      'refusing to run tests against database "program_tracker": test database names must end in "_test" (set TEST_DATABASE_URL)'
    );
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(
      'refusing to run tests against database "(unset)": test database names must end in "_test" (set TEST_DATABASE_URL)'
    );
    expect(() => assertTestDatabaseUrl("")).toThrow(
      'refusing to run tests against database "(unset)": test database names must end in "_test" (set TEST_DATABASE_URL)'
    );
    expect(() => assertTestDatabaseUrl("postgres://u:p@h:1/x;drop_test")).toThrow(
      'refusing to run tests against database "x;drop_test": test database names must end in "_test" (set TEST_DATABASE_URL)'
    );
  });

  test("T2 returns the name of a *_test database", () => {
    expect(assertTestDatabaseUrl(DEFAULT_TEST_DATABASE_URL)).toBe("program_tracker_test");
  });
});

describe("resolveTestDatabaseUrl", () => {
  test("T3 defaults to program_tracker_test and honours TEST_DATABASE_URL", () => {
    expect(resolveTestDatabaseUrl({})).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://u:p@h:1/other_test" })).toBe(
      "postgres://u:p@h:1/other_test"
    );
    expect(resolveTestDatabaseUrl({ DATABASE_URL: "postgres://u:p@h:1/program_tracker" })).toBe(
      DEFAULT_TEST_DATABASE_URL
    );
  });

  test("T4 rejects a non-test TEST_DATABASE_URL", () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://u:p@h:1/program_tracker" })).toThrow(
      'refusing to run tests against database "program_tracker": test database names must end in "_test" (set TEST_DATABASE_URL)'
    );
  });
});

/** Same probe pattern as e2e.test.ts: DB-backed tests skip when Postgres is down. */
let dbUp = false;
try {
  await db.execute(sql`select 1`);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping test-db integration tests");
}

describe.skipIf(!dbUp)("test database integration", () => {
  test("T5 db client is connected to the real Postgres test database", async () => {
    const rows = (await db.execute(sql`select current_database(), version()`)) as Array<{
      current_database: string;
      version: string;
    }>;
    expect(rows[0].current_database).toBe(assertTestDatabaseUrl(resolveTestDatabaseUrl(process.env)));
    expect(rows[0].version.startsWith("PostgreSQL")).toBe(true);
  });

  test("T6 prepareTestDatabase truncates every table and reseeds fixtures", async () => {
    const [trainer] = await db
      .insert(trainers)
      .values({ name: "TDB Trainer", email: `tdb-${Date.now()}@test.dev` })
      .returning();
    await db.insert(clients).values({ trainerId: trainer.id, name: "TDB Client", email: `tdb-c-${Date.now()}@test.dev` });

    expect(await prepareTestDatabase(process.env.DATABASE_URL!)).toBe(true);

    const counts = (await db.execute(
      sql`select
            (select count(*) from clients) as clients,
            (select count(*) from trainers) as trainers,
            (select count(*) from exercises) as exercises`
    )) as Array<{ clients: string; trainers: string; exercises: string }>;
    expect(Number(counts[0].clients)).toBe(0);
    expect(Number(counts[0].trainers)).toBe(0);
    const fixtureRows = await db.select().from(exercises).orderBy(exercises.name);
    expect(fixtureRows.map((r) => r.name)).toEqual(["Back Squat", "Bench Press"]);
    expect(fixtureRows.every((r) => r.trainerId === null)).toBe(true);
  });
});

describe("prepareTestDatabase without a server", () => {
  test("T7 resolves false when Postgres is unreachable", async () => {
    expect(await prepareTestDatabase("postgres://pt:x@127.0.0.1:1/unreachable_test")).toBe(false);
  });
});
