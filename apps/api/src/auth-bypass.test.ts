import { describe, expect, test } from "bun:test";
// Namespace import: the guards are checked as properties, so a missing one fails the test, not the load.
import * as auth from "./lib/auth";

describe("authBypassProblem", () => {
  const local = { AUTH_DISABLED: "true", DATABASE_URL: "postgres://pt:pw@localhost:5433/program_tracker" };
  test("auth on is never a problem", () => {
    expect(auth.authBypassProblem({ DATABASE_URL: "postgres://u:p@db.example.supabase.co:5432/postgres", NODE_ENV: "production" })).toBeNull();
  });
  test("allows the bypass on a local database: localhost, 127.x and a Docker service name", () => {
    expect(auth.authBypassProblem(local)).toBeNull();
    expect(auth.authBypassProblem({ ...local, DATABASE_URL: "postgres://pt:pw@127.0.0.1:5432/x" })).toBeNull();
    expect(auth.authBypassProblem({ ...local, DATABASE_URL: "postgres://pt:pw@postgres:5432/x" })).toBeNull();
  });
  test("refuses it in production, with Google configured, or on a hosted database", () => {
    expect(auth.authBypassProblem({ ...local, NODE_ENV: "production" })).toMatch(/production/);
    expect(auth.authBypassProblem({ ...local, GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com" })).toMatch(/Google/);
    expect(auth.authBypassProblem({ ...local, DATABASE_URL: "postgres://u:p@aws-0-ap.pooler.supabase.com:6543/postgres" })).toMatch(/not a local database/);
    expect(auth.authBypassProblem({ AUTH_DISABLED: "true" })).toMatch(/DATABASE_URL/);
  });
});
