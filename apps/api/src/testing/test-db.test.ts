import { describe, expect, test } from "bun:test";
import { assertTestDatabaseUrl, DEFAULT_TEST_DATABASE_URL, resolveTestDatabaseUrl } from "./test-db";

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
