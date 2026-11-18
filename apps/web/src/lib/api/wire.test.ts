import { describe, expect, test } from "bun:test";
import { trainerWire } from "./wire";

// An open release-1 tab against a release-2 API (docs/kind-rename-plan.md):
// every response that carries a session kind or a type format may say
// "exercises"; the client reads it as "lifting".

const at = new Date("2026-11-18T09:30:00.000Z");

describe("trainerWire", () => {
  test("program: weeks[].sessions[].kind", () => {
    const program = {
      id: "p1",
      createdAt: at,
      weeks: [{ week: 1, sessions: [{ id: "s1", kind: "exercises", exercises: [{ id: "e1" }] }, { id: "c1", kind: "cardio", exercises: [] }] }],
    };
    expect(trainerWire(program)).toEqual({
      id: "p1",
      createdAt: "2026-11-18T09:30:00.000Z",
      weeks: [{ week: 1, sessions: [{ id: "s1", kind: "lifting", exercises: [{ id: "e1" }] }, { id: "c1", kind: "cardio", exercises: [] }] }],
    });
  });

  test("client page: current program and programs list", () => {
    const res = trainerWire({
      client: { id: "c" },
      currentProgram: { weeks: [{ sessions: [{ kind: "exercises" }] }] },
      programs: [{ weeks: [{ sessions: [{ kind: "exercises" }] }] }],
    }) as any;
    expect(res.currentProgram.weeks[0].sessions[0].kind).toBe("lifting");
    expect(res.programs[0].weeks[0].sessions[0].kind).toBe("lifting");
  });

  test("session logs and history", () => {
    const logs = trainerWire([{ id: "l1", kind: "exercises", date: "2026-11-18", sets: [] }, { id: "l2", kind: "cardio", sets: [] }]) as any[];
    expect(logs.map((l) => l.kind)).toEqual(["lifting", "cardio"]);
  });

  test("session types: format", () => {
    const types = trainerWire([{ id: "t", format: "exercises" }, { id: "u", format: "any" }, { id: "v", format: "cardio" }]) as any[];
    expect(types.map((t) => t.format)).toEqual(["lifting", "any", "cardio"]);
  });

  test("AI generation draft and import result", () => {
    const gen = trainerWire({ id: "g", kind: "block", draft: { weeks: [{ week: 1, sessions: [{ name: "A", kind: "exercises" }] }] } }) as any;
    expect(gen.kind).toBe("block");
    expect(gen.draft.weeks[0].sessions[0].kind).toBe("lifting");
    const imp = trainerWire({ result: { weeks: [{ days: [{ sessions: [{ kind: "exercises" }, { kind: "cardio" }] }] }] } }) as any;
    expect(imp.result.weeks[0].days[0].sessions.map((s: any) => s.kind)).toEqual(["lifting", "cardio"]);
  });

  test("other kinds and plain strings are untouched", () => {
    const v = { kind: "pain", note: "exercises", flags: [{ kind: "skipped" }], list: ["exercises"] };
    expect(trainerWire(v)).toEqual(v);
  });
});
