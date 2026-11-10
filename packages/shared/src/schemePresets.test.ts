import { describe, expect, test } from "bun:test";
import { applyProgression, PeriodizationSchemeInput, SCHEME_PRESETS, schemePreset, type ProgramWeek } from "./index";

const set = (n: number, over: object) => ({ setNumber: n, type: "working" as const, reps: 5, amrap: false, ...over });

/** One lifting session: Back Squat 3×5 @ 75 % 1RM and Bench Press 3×5 @ 80 kg. */
function week1(): ProgramWeek {
  return {
    week: 1,
    sessions: [
      {
        id: "s1",
        name: "Full body",
        seq: 1,
        weekday: 1,
        order: 0,
        kind: "lifting",
        exercises: [
          { id: "e-sq", exerciseId: "squat", order: 0, prescribedSets: [1, 2, 3].map((n) => set(n, { percent1rm: 75 })) },
          { id: "e-bp", exerciseId: "bench", order: 1, prescribedSets: [1, 2, 3].map((n) => set(n, { targetWeightKg: 80 })) },
        ],
      },
    ],
  };
}

function run(key: string) {
  const p = schemePreset(key)!;
  const weeks = applyProgression([week1()], { plannedWeeks: p.weeks.length, weeks: p.weeks });
  const ex = (w: ProgramWeek, id: string) => w.sessions[0].exercises.find((e) => e.exerciseId === id)!.prescribedSets;
  return {
    preset: p,
    pct: weeks.map((w) => ex(w, "squat")[0].percent1rm),
    kg: weeks.map((w) => ex(w, "bench")[0].targetWeightKg),
    sets: weeks.map((w) => ex(w, "squat").length),
  };
}

describe("SCHEME_PRESETS", () => {
  test("every preset is a valid scheme with a unique key, a summary and sources", () => {
    expect(new Set(SCHEME_PRESETS.map((p) => p.key)).size).toBe(SCHEME_PRESETS.length);
    for (const p of SCHEME_PRESETS) {
      expect(PeriodizationSchemeInput.safeParse({ name: p.name, weeks: p.weeks }).success).toBe(true);
      expect(p.summary.length).toBeGreaterThan(0);
      expect(p.sources.length).toBeGreaterThan(0);
      expect(p.phase.length).toBeGreaterThan(0);
    }
  });

  test("deload weeks carry the deload volume target and no rule", () => {
    for (const w of SCHEME_PRESETS.flatMap((p) => p.weeks).filter((w) => w.directive === "deload")) {
      expect(w.progression).toBeUndefined();
      expect(w.target?.metric).toBe("overall_volume");
    }
  });

  test("linear 3:1 climbs 75 → 77.5 → 80 %1RM, then deloads", () => {
    const r = run("linear-3-1");
    expect(r.pct.slice(0, 3)).toEqual([75, 77.5, 80]);
    expect(r.preset.weeks[3].directive).toBe("deload");
  });

  test("hypertrophy ramp adds a set a week (3 → 6), then deloads", () => {
    const r = run("hypertrophy-ramp");
    expect(r.sets.slice(0, 4)).toEqual([3, 4, 5, 6]);
    expect(r.preset.weeks[4].directive).toBe("deload");
  });

  test("novice linear adds 2.5 kg every week", () => {
    expect(run("novice-linear").kg).toEqual([80, 82.5, 85, 87.5, 90, 92.5]);
  });

  test("block, undulating, peak & taper and return to training run as written", () => {
    const block = run("block");
    expect(block.sets).toEqual([3, 4, 4, 4, 4, 3]);
    expect(block.pct).toEqual([75, 75, 75, 80, 82.5, 82.5]);
    expect(run("undulating").sets.slice(0, 4)).toEqual([3, 4, 3, 4]);
    expect(run("peak-taper").sets).toEqual([3, 2, 2]);
    const rtt = run("return-to-train");
    expect(rtt.sets).toEqual([3, 4, 5, 5]);
    expect(rtt.pct).toEqual([75, 75, 75, 77.5]);
  });
});
