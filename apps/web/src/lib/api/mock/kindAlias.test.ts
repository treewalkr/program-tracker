import { describe, expect, test } from "bun:test";
import { mockApi, mockState } from "./api";
import { mockPortalApi } from "./portal";
import { asRelease1, withKindAlias } from "./kindAlias";

// Old data in mock mode (docs/kind-rename-plan.md, release 2): the mock store
// holds release-1 rows (kind/format "lifting"); every page read must come back
// as "exercises".

const ALIAS = /"(kind|format)":"lifting"/;

describe("mock store holds release-1 rows", () => {
  test("the demo client's program, logs and session types are stored as lifting", () => {
    const program = mockState.programs.find((p) => p.id === "pg-nat-a")!;
    expect(JSON.stringify(program.weeks)).toMatch(ALIAS);
    expect(JSON.stringify(mockState.logs.filter((l) => l.clientId === "cl-nat"))).toMatch(ALIAS);
    expect(mockState.sessionTypes.find((t) => t.id === "st-hypertrophy")?.format as string).toBe("lifting");
  });
});

describe("mock reads come back canonical", () => {
  test("program, client page and program list", async () => {
    const program = await mockApi.program("pg-nat-a");
    expect(JSON.stringify(program)).not.toMatch(ALIAS);
    expect(new Set(program.weeks.flatMap((w) => w.sessions.map((s) => s.kind)))).toEqual(new Set(["exercises", "cardio"]));
    const page = await mockApi.client("cl-nat");
    expect(JSON.stringify(page)).not.toMatch(ALIAS);
    expect(JSON.stringify(await mockApi.programs("cl-nat"))).not.toMatch(ALIAS);
  });

  test("logs and history", async () => {
    const logs = await mockApi.sessionLogs("cl-nat");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.kind === "exercises" || l.kind === "cardio")).toBe(true);
    expect(logs.some((l) => l.kind === "exercises")).toBe(true);
    expect(JSON.stringify(await mockApi.history("cl-nat"))).not.toMatch(ALIAS);
  });

  test("session types", async () => {
    const types = await mockApi.sessionTypes();
    expect(types.find((t) => t.id === "st-hypertrophy")?.format).toBe("exercises");
    expect(types.find((t) => t.presetKey === "strength-training")?.format).toBe("exercises");
    expect(JSON.stringify(types)).not.toMatch(ALIAS);
  });

  test("portal week", async () => {
    const week = await mockPortalApi.week();
    expect(JSON.stringify(week)).not.toMatch(ALIAS);
    expect(week.weeks[0].sessions.some((s) => s.kind === "exercises")).toBe(true);
  });

  test("an editor round trip saves canonical kinds", async () => {
    const program = await mockApi.program("pg-nat-a");
    const saved = await mockApi.saveProgram(program.id, program.weeks);
    expect(JSON.stringify(saved)).not.toMatch(ALIAS);
    expect(JSON.stringify(mockState.programs.find((p) => p.id === "pg-nat-a")!.weeks)).not.toMatch(ALIAS);
  });
});

describe("mock writes from a release-1 client", () => {
  test("a session type with format lifting is stored as exercises", async () => {
    const made = await mockApi.createSessionType({ name: "Alias Mock", format: "lifting" as never });
    expect(made.format).toBe("exercises");
    expect(mockState.sessionTypes.find((t) => t.id === made.id)?.format).toBe("exercises");
    await mockApi.deleteSessionType(made.id);
  });

  test("a log with kind lifting is stored as exercises", async () => {
    const c = await mockApi.createClient({ name: "ZZ-TEST Alias", email: "zz-alias@example.com", goals: null, limitations: null, sessionsPerWeek: null });
    const saved = await mockApi.logSession({
      clientId: c.id,
      programId: "pg-zz-alias",
      programSessionId: null,
      date: "2026-11-18",
      kind: "lifting" as never,
      sets: [{ exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 100, reps: 5 }],
    });
    expect(saved.id).toBeString();
    expect(mockState.logs.find((l) => l.clientId === c.id)?.kind).toBe("exercises");
  });
});

describe("kindAlias helpers", () => {
  test("asRelease1 rewrites only exercises kinds and formats", () => {
    expect(asRelease1({ kind: "exercises", format: "exercises", other: "exercises", c: { kind: "cardio" } })).toEqual({
      kind: "lifting",
      format: "lifting",
      other: "exercises",
      c: { kind: "cardio" },
    });
  });

  test("withKindAlias normalizes sync and async results", async () => {
    const api = withKindAlias({
      sync: () => ({ kind: "lifting" }),
      async: async () => [{ format: "lifting" }],
      value: 3,
    });
    expect(api.sync()).toEqual({ kind: "exercises" });
    expect(await api.async()).toEqual([{ format: "exercises" }]);
    expect(api.value).toBe(3);
  });
});
