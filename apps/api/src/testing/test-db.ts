import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { exercises } from "@pt/db/schema";
import type { FunctionalMovement, MovementPattern } from "@pt/shared";
import { runMigrations } from "@pt/db/migrate";

export const DEFAULT_TEST_DATABASE_URL =
  "postgres://pt:pt_dev_password@localhost:5433/program_tracker_test";

const TEST_DB_NAME_PATTERN = /^[A-Za-z0-9_]+_test$/;

/**
 * Fail-closed guard: returns the database name of `url`, throwing unless the
 * name ends in "_test". Every DB-backed test file and the test preload call
 * this so the live database can never receive test writes.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  const name = url ? new URL(url).pathname.slice(1) : "";
  if (!name || !TEST_DB_NAME_PATTERN.test(name)) {
    throw new Error(
      `refusing to run tests against database "${name || "(unset)"}": test database names must end in "_test" (set TEST_DATABASE_URL)`
    );
  }
  return name;
}

/** env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL, validated. Ignores DATABASE_URL. */
export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  assertTestDatabaseUrl(url);
  return url;
}

/** Global (trainerId null) exercise rows seeded after every reset. */
export const TEST_EXERCISE_FIXTURES: ReadonlyArray<{
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string;
  movementPattern: MovementPattern;
  functionalMovement: FunctionalMovement;
}> = [
  {
    name: "Back Squat",
    primaryMuscleGroup: "quads",
    secondaryMuscleGroups: ["glutes", "hamstrings"],
    equipment: "barbell",
    movementPattern: "knee_dominant",
    functionalMovement: "squat",
  },
  {
    name: "Bench Press",
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: ["triceps", "shoulders"],
    equipment: "barbell",
    movementPattern: "horizontal_push",
    functionalMovement: "push",
  },
];

function isUnreachable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ECONNREFUSED" || code === "CONNECT_TIMEOUT";
}

/**
 * Create the test database if missing, run migrations, truncate every public
 * table and seed the fixture exercises. Resolves false when Postgres is
 * unreachable (so unit-only test runs stay green); rethrows every other error.
 */
export async function prepareTestDatabase(url: string): Promise<boolean> {
  const name = assertTestDatabaseUrl(url);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 5, onnotice: () => {} });
  let target: postgres.Sql | undefined;
  try {
    const exists = await admin`select 1 from pg_database where datname = ${name}`;
    if (exists.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
    }
    await runMigrations(url);
    target = postgres(url, { max: 1, onnotice: () => {} });
    const tables = await target`select tablename from pg_tables where schemaname = 'public'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"${t.tablename}"`).join(", ");
      await target.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
    await drizzle(target).insert(exercises).values(TEST_EXERCISE_FIXTURES.map((f) => ({ ...f, trainerId: null })));
    return true;
  } catch (err) {
    if (isUnreachable(err)) return false;
    throw err;
  } finally {
    await admin.end().catch(() => {});
    if (target) await target.end().catch(() => {});
  }
}
