import { assertTestDatabaseUrl, prepareTestDatabase, resolveTestDatabaseUrl, TEST_EXERCISE_FIXTURES } from "./test-db";

// Point every import of @pt/db at the dedicated test database before any test
// file is loaded, then reset it. Nothing can fall back to the live DB.
const url = resolveTestDatabaseUrl(process.env);
process.env.DATABASE_URL = url;
// Route tests run without a session; auth.test.ts switches the guard back on.
process.env.AUTH_DISABLED = "true";
const name = assertTestDatabaseUrl(url);
const ready = await prepareTestDatabase(url);

if (ready) {
  console.log(`[test-db] ${name} ready (migrated, truncated, ${TEST_EXERCISE_FIXTURES.length} fixtures)`);
} else {
  console.warn(`[test-db] Postgres unreachable for ${name} — DB-backed tests will skip`);
}
