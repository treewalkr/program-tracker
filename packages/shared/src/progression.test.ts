import { describe, expect, test } from "bun:test";
import { applyProgression, progressionLabel, WeekPlan, WeekProgression, type Phasing, type ProgramWeek } from "./index";

const set = (n: number, over: object = {}) => ({ setNumber: n, type: "working" as const, reps: 5, amrap: false, ...over });

function week1(): ProgramWeek {
  return {
    week: 1,
    sessions: [
      {
        id: "s1",
        name: "Lower",
        seq: 1,
        weekday: 1,
        order: 0,
        kind: "lifting",
        exercises: [
          { id: "e-sq", exerciseId: "sq", order: 0, prescribedSets: [set(1, { targetWeightKg: 100 }), set(2, { targetWeightKg: 100 }), set(3, { reps: 8, type: "backoff", targetWeightKg: 80 })] },
          { id: "e-dl", exerciseId: "dl", order: 1, prescribedSets: [set(1, { percent1rm: 75 }), set(2, { percent1rm: 75 })] },
          { id: "e-pl", exerciseId: "plank", order: 2, prescribedSets: [set(1, { reps: 0, durationSeconds: 30 })] },
        ],
      },
      { id: "c1", name: "Run", seq: 1, weekday: 3, order: 0, kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 30 } },
    ],
  };
}

const plan = (weeks: WeekPlan[], plannedWeeks = weeks.length): Phasing => ({ plannedWeeks, phase: "accumulation", weeks });
const loads = (w: ProgramWeek, ex: string) =>
  w.sessions[0].exercises.find((e) => e.exerciseId === ex)!.prescribedSets.map((s) => s.targetWeightKg ?? s.percent1rm ?? null);

describe("WeekProgression", () => {
  test("+kg, +% and +sets; sets must be whole and nothing is 0", () => {
    expect(WeekProgression.parse({ kind: "kg", amount: 2.5 })).toEqual({ kind: "kg", amount: 2.5 });
    expect(() => WeekProgression.parse({ kind: "sets", amount: 1.5 })).toThrow();
    expect(() => WeekProgression.parse({ kind: "kg", amount: 0 })).toThrow();
    expect(WeekPlan.parse({ week: 2, directive: "+intensity", progression: { kind: "percent", amount: 2.5 } }).progression?.kind).toBe("percent");
  });

  test("labels read like a coach writes them", () => {
    expect(progressionLabel({ kind: "kg", amount: 2.5 })).toBe("+2.5 kg");
    expect(progressionLabel({ kind: "percent", amount: -5 })).toBe("−5% 1RM");
    expect(progressionLabel({ kind: "sets", amount: 1 })).toBe("+1 set");
    expect(progressionLabel({ kind: "sets", amount: 2 })).toBe("+2 sets");
  });
});

describe("applyProgression", () => {
  test("+kg adds to every kg target week on week; %1RM-only and timed sets stay", () => {
    const out = applyProgression([week1()], plan([
      { week: 1, directive: "base" },
      { week: 2, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      { week: 3, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
    ]));
    expect(out.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(loads(out[1], "sq")).toEqual([102.5, 102.5, 82.5]);
    expect(loads(out[2], "sq")).toEqual([105, 105, 85]);
    expect(loads(out[2], "dl")).toEqual([75, 75]);
    expect(out[2].sessions[0].exercises[2].prescribedSets[0].durationSeconds).toBe(30);
    expect(out[2].sessions[1].cardio?.durationMin).toBe(30);
  });

  test("+% adds points to %1RM targets and scales kg targets (to 0.5 kg)", () => {
    const out = applyProgression([week1()], plan([{ week: 1, directive: "base" }, { week: 2, directive: "+intensity", progression: { kind: "percent", amount: 2.5 } }]));
    expect(loads(out[1], "dl")).toEqual([77.5, 77.5]);
    expect(loads(out[1], "sq")).toEqual([102.5, 102.5, 82]);
  });

  test("+sets copies the last working set before the back-offs, renumbered (timed holds too)", () => {
    const out = applyProgression([week1()], plan([{ week: 1, directive: "base" }, { week: 2, directive: "+volume", progression: { kind: "sets", amount: 1 } }]));
    const sq = out[1].sessions[0].exercises[0].prescribedSets;
    expect(sq.map((s) => [s.setNumber, s.type, s.reps])).toEqual([[1, "working", 5], [2, "working", 5], [3, "working", 5], [4, "backoff", 8]]);
    expect(out[1].sessions[0].exercises[2].prescribedSets).toHaveLength(2);
  });

  test("-sets never drops below one working set", () => {
    const out = applyProgression([week1()], plan([{ week: 1, directive: "base" }, { week: 2, directive: "deload", progression: { kind: "sets", amount: -5 } }]));
    expect(out[1].sessions[0].exercises[0].prescribedSets.map((s) => s.type)).toEqual(["working", "backoff"]);
  });

  test("a week without a rule copies the week before; W1 is never touched", () => {
    const w1 = week1();
    const out = applyProgression([w1], plan([{ week: 1, directive: "base", progression: { kind: "kg", amount: 10 } }, { week: 2, directive: "base" }]));
    expect(out[0]).toBe(w1);
    expect(loads(out[1], "sq")).toEqual([100, 100, 80]);
  });

  test("a deload week without a rule keeps its own sets; the week after builds on the last loading week", () => {
    const w1 = week1();
    const deload: ProgramWeek = { ...structuredClone(w1), week: 3 };
    deload.sessions[0].exercises[0].prescribedSets = [set(1, { targetWeightKg: 60 })];
    const w2 = { ...structuredClone(w1), week: 2 };
    const out = applyProgression([w1, w2, deload], plan([
      { week: 1, directive: "base" },
      { week: 2, directive: "+intensity", progression: { kind: "kg", amount: 5 } },
      { week: 3, directive: "deload" },
      { week: 4, directive: "+intensity", progression: { kind: "kg", amount: 5 } },
    ]));
    expect(loads(out[2], "sq")).toEqual([60]);
    expect(loads(out[3], "sq")).toEqual([110, 110, 90]);
  });

  test("keeps the ids of sessions and exercises already in that week (logs stay linked), else fresh ones", () => {
    const w1 = week1();
    const w2 = { ...structuredClone(w1), week: 2 };
    w2.sessions[0].id = "s1-w2";
    w2.sessions[0].exercises[0].id = "e-sq-w2";
    const out = applyProgression([w1, w2], plan([{ week: 1, directive: "base" }, { week: 2, directive: "base" }, { week: 3, directive: "base" }]));
    expect(out[1].sessions[0].id).toBe("s1-w2");
    expect(out[1].sessions[0].exercises[0].id).toBe("e-sq-w2");
    const idsOf = (w: ProgramWeek) => w.sessions.flatMap((s) => [s.id, ...s.exercises.map((e) => e.id)]);
    const seen = new Set([...idsOf(w1), ...idsOf(w2)]);
    expect(new Set(idsOf(out[2])).size).toBe(5);
    expect(idsOf(out[2]).some((id) => seen.has(id))).toBe(false);
  });

  test("never goes below 0 kg or 1 %", () => {
    const out = applyProgression([week1()], plan([{ week: 1, directive: "base" }, { week: 2, directive: "deload", progression: { kind: "kg", amount: -50 } }]));
    expect(loads(out[1], "sq")).toEqual([50, 50, 30]);
    const out2 = applyProgression([week1()], plan([{ week: 1, directive: "base" }, { week: 2, directive: "base", progression: { kind: "kg", amount: -50 } }, { week: 3, directive: "base", progression: { kind: "kg", amount: -50 } }]));
    expect(loads(out2[2], "sq")).toEqual([0, 0, 0]);
    const out3 = applyProgression([week1()], plan([{ week: 1, directive: "base" }, { week: 2, directive: "base", progression: { kind: "percent", amount: -50 } }, { week: 3, directive: "base", progression: { kind: "percent", amount: -50 } }]));
    expect(loads(out3[2], "dl")).toEqual([1, 1]);
  });
});
