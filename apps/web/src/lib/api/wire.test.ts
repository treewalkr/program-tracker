import { describe, expect, test } from "bun:test";
import { trainerWire } from "./wire";

// Old data through the API (docs/kind-rename-plan.md, release 2): any response
// that carries a session kind or a type format may still say "lifting" (AI
// history, import results); the client reads it as "exercises".

const at = new Date("2026-11-18T09:30:00.000Z");

describe("trainerWire", () => {
  test("program: weeks[].sessions[].kind", () => {
    const program = {
      id: "p1",
      createdAt: at,
      weeks: [{ week: 1, sessions: [{ id: "s1", kind: "lifting", exercises: [{ id: "e1" }] }, { id: "c1", kind: "cardio", exercises: [] }] }],
    };
    expect(trainerWire(program)).toEqual({
      id: "p1",
      createdAt: "2026-11-18T09:30:00.000Z",
      weeks: [{ week: 1, sessions: [{ id: "s1", kind: "exercises", exercises: [{ id: "e1" }] }, { id: "c1", kind: "cardio", exercises: [] }] }],
    });
  });

  test("client page: current program and programs list", () => {
    const res = trainerWire({
      client: { id: "c" },
      currentProgram: { weeks: [{ sessions: [{ kind: "lifting" }] }] },
      programs: [{ weeks: [{ sessions: [{ kind: "lifting" }] }] }],
    }) as any;
    expect(res.currentProgram.weeks[0].sessions[0].kind).toBe("exercises");
    expect(res.programs[0].weeks[0].sessions[0].kind).toBe("exercises");
  });

  test("session logs and history", () => {
    const logs = trainerWire([{ id: "l1", kind: "lifting", date: "2026-11-18", sets: [] }, { id: "l2", kind: "cardio", sets: [] }]) as any[];
    expect(logs.map((l) => l.kind)).toEqual(["exercises", "cardio"]);
  });

  test("session types: format", () => {
    const types = trainerWire([{ id: "t", format: "lifting" }, { id: "u", format: "any" }, { id: "v", format: "cardio" }]) as any[];
    expect(types.map((t) => t.format)).toEqual(["exercises", "any", "cardio"]);
  });

  test("AI generation draft and import result", () => {
    const gen = trainerWire({ id: "g", kind: "block", draft: { weeks: [{ week: 1, sessions: [{ name: "A", kind: "lifting" }] }] } }) as any;
    expect(gen.kind).toBe("block");
    expect(gen.draft.weeks[0].sessions[0].kind).toBe("exercises");
    const imp = trainerWire({ result: { weeks: [{ days: [{ sessions: [{ kind: "lifting" }, { kind: "cardio" }] }] }] } }) as any;
    expect(imp.result.weeks[0].days[0].sessions.map((s: any) => s.kind)).toEqual(["exercises", "cardio"]);
  });

  test("other kinds and plain strings are untouched", () => {
    const v = { kind: "pain", note: "lifting", flags: [{ kind: "skipped" }], list: ["lifting"] };
    expect(trainerWire(v)).toEqual(v);
  });
});
