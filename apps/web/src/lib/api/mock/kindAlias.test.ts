import { describe, expect, test } from "bun:test";
import { mockApi, mockState } from "./api";
import { mockPortalApi } from "./portal";
import { asRelease2, withKindAlias } from "./kindAlias";

// Old-tab simulation in mock mode (docs/kind-rename-plan.md, release 1): the
// mock store holds release-2 rows (kind/format "exercises"); every page read
// must come back as "lifting".

const ALIAS = /"(kind|format)":"exercises"/;

describe("mock store holds release-2 rows", () => {
  test("the demo client's program, logs and session types are stored as exercises", () => {
    const program = mockState.programs.find((p) => p.id === "pg-nat-a")!;
    expect(JSON.stringify(program.weeks)).toMatch(ALIAS);
    expect(JSON.stringify(mockState.logs.filter((l) => l.clientId === "cl-nat"))).toMatch(ALIAS);
    expect(mockState.sessionTypes.find((t) => t.id === "st-hypertrophy")?.format as string).toBe("exercises");
  });
});

describe("mock reads come back canonical", () => {
  test("program, client page and program list", async () => {
    const program = await mockApi.program("pg-nat-a");
    expect(JSON.stringify(program)).not.toMatch(ALIAS);
    expect(new Set(program.weeks.flatMap((w) => w.sessions.map((s) => s.kind)))).toEqual(new Set(["lifting", "cardio"]));
    const page = await mockApi.client("cl-nat");
    expect(JSON.stringify(page)).not.toMatch(ALIAS);
    expect(JSON.stringify(await mockApi.programs("cl-nat"))).not.toMatch(ALIAS);
  });

  test("logs and history", async () => {
    const logs = await mockApi.sessionLogs("cl-nat");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.kind === "lifting" || l.kind === "cardio")).toBe(true);
    expect(logs.some((l) => l.kind === "lifting")).toBe(true);
    expect(JSON.stringify(await mockApi.history("cl-nat"))).not.toMatch(ALIAS);
  });

  test("session types", async () => {
    const types = await mockApi.sessionTypes();
    expect(types.find((t) => t.id === "st-hypertrophy")?.format).toBe("lifting");
    expect(types.find((t) => t.presetKey === "strength-training")?.format).toBe("lifting");
    expect(JSON.stringify(types)).not.toMatch(ALIAS);
  });

  test("portal week", async () => {
    const week = await mockPortalApi.week();
    expect(JSON.stringify(week)).not.toMatch(ALIAS);
    expect(week.weeks[0].sessions.some((s) => s.kind === "lifting")).toBe(true);
  });

  test("an editor round trip saves canonical kinds", async () => {
    const program = await mockApi.program("pg-nat-a");
    const saved = await mockApi.saveProgram(program.id, program.weeks);
    expect(JSON.stringify(saved)).not.toMatch(ALIAS);
    expect(JSON.stringify(mockState.programs.find((p) => p.id === "pg-nat-a")!.weeks)).not.toMatch(ALIAS);
  });
});

describe("mock writes from a release-2 client", () => {
  test("a session type with format exercises is stored as lifting", async () => {
    const made = await mockApi.createSessionType({ name: "Alias Mock", format: "exercises" as never });
    expect(made.format).toBe("lifting");
    expect(mockState.sessionTypes.find((t) => t.id === made.id)?.format).toBe("lifting");
    await mockApi.deleteSessionType(made.id);
  });

  test("a log with kind exercises is stored as lifting", async () => {
    const c = await mockApi.createClient({ name: "ZZ-TEST Alias", email: "zz-alias@example.com", goals: null, limitations: null, sessionsPerWeek: null });
    const saved = await mockApi.logSession({
      clientId: c.id,
      programId: "pg-zz-alias",
      programSessionId: null,
      date: "2026-11-18",
      kind: "exercises" as never,
      sets: [{ exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 100, reps: 5 }],
    });
    expect(saved.id).toBeString();
    expect(mockState.logs.find((l) => l.clientId === c.id)?.kind).toBe("lifting");
  });
});

describe("kindAlias helpers", () => {
  test("asRelease2 rewrites only lifting kinds and formats", () => {
    expect(asRelease2({ kind: "lifting", format: "lifting", other: "lifting", c: { kind: "cardio" } })).toEqual({
      kind: "exercises",
      format: "exercises",
      other: "lifting",
      c: { kind: "cardio" },
    });
  });

  test("withKindAlias normalizes sync and async results", async () => {
    const api = withKindAlias({
      sync: () => ({ kind: "exercises" }),
      async: async () => [{ format: "exercises" }],
      value: 3,
    });
    expect(api.sync()).toEqual({ kind: "lifting" });
    expect(await api.async()).toEqual([{ format: "lifting" }]);
    expect(api.value).toBe(3);
  });
});
