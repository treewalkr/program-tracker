import { describe, expect, test } from "bun:test";
import { coachLogLines } from "./coachLog";

const set = (programExerciseId: string | null, setNumber: number, weightKg: number | null, reps: number) => ({
  programExerciseId,
  exerciseId: "x",
  setNumber,
  type: "working" as const,
  weightKg,
  reps,
  rpe: null,
  asPlanned: false,
});
const ex = (id: string, name: string, block?: "prep", prescribedSets: object[] = []) => ({ id, exerciseId: `ex-${id}`, exerciseName: name, order: 0, prescribedSets, ...(block ? { block } : {}) });

describe("coachLogLines", () => {
  test("each planned exercise in order with its sets; skips say why; prep isn't listed; extras go last", () => {
    const session = { exercises: [ex("warm", "Hip openers", "prep"), ex("sq", "Squat"), ex("row", "Row"), ex("lunge", "Lunge")] } as never;
    const lines = coachLogLines(session, {
      sets: [set("sq", 2, 85, 5), set("sq", 1, 80, 5), set(null, 1, null, 12)],
      flags: [{ programExerciseId: "row", exerciseId: "ex-row", kind: "skipped", reason: "equipment" }],
    } as never);
    expect(lines.map((l) => [l.key, l.name, l.sets.map((s) => s.setNumber), l.skipped])).toEqual([
      ["sq", "Squat", [1, 2], null],
      ["row", "Row", [], { reason: "equipment" }],
      ["lunge", "Lunge", [], null],
      ["extra", null, [1], null],
    ]);
  });

  test("a hold prescribed in seconds is timed: its reps are seconds", () => {
    const session = { exercises: [ex("ski", "SkiErg", undefined, [{ setNumber: 1, durationSeconds: 40 }]), ex("sq", "Squat", undefined, [{ setNumber: 1, reps: 5 }])] } as never;
    expect(coachLogLines(session, { sets: [], flags: null } as never).map((l) => [l.key, l.timed])).toEqual([
      ["ski", true],
      ["sq", false],
    ]);
  });

  test("a bodyweight move says so; a loaded move with no kg logged doesn't", () => {
    const session = { exercises: [{ ...ex("pu", "Pull up"), bodyweight: true }, ex("wb", "Wall Ball")] } as never;
    expect(coachLogLines(session, { sets: [], flags: null } as never).map((l) => [l.key, l.bodyweight])).toEqual([
      ["pu", true],
      ["wb", false],
    ]);
  });

  test("a skip with no slot matches by exercise; a pain flag isn't a skip", () => {
    const session = { exercises: [ex("sq", "Squat")] } as never;
    expect(coachLogLines(session, { sets: [], flags: [{ programExerciseId: null, exerciseId: "ex-sq", kind: "pain" }] } as never)[0].skipped).toBeNull();
    expect(coachLogLines(session, { sets: [], flags: [{ programExerciseId: null, exerciseId: "ex-sq", kind: "skipped" }] } as never)[0].skipped).toEqual({ reason: null });
  });
});
