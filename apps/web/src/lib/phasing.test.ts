import { describe, expect, test } from "bun:test";
import { phasingToRows, rowsToPhasing, rowsToWeekPlans, weekPlansToRows, type PhasingRow } from "./phasing";
import { SCHEME_PRESETS } from "@pt/shared";
import type { ProgramPhasingDto } from "./api/types";

describe("phasing", () => {
  test("phasingToRows / rowsToPhasing round-trip", () => {
    const original: ProgramPhasingDto = {
      plannedWeeks: 4,
      phase: "accumulation",
      nextPhase: "intensification",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
        { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
        { week: 4, directive: "deload" },
      ],
    };

    const rows = phasingToRows(original);
    expect(rows).toEqual([
      { directive: "base", metric: "", deltaPercent: null },
      { directive: "+volume", metric: "overall_volume", deltaPercent: 5 },
      { directive: "+intensity", metric: "intensity", deltaPercent: 2.5 },
      { directive: "deload", metric: "", deltaPercent: null },
    ]);

    const reconstructed = rowsToPhasing(rows, "accumulation", "intensification", 4);
    expect(reconstructed).toEqual(original);

    // Target omitted when metric === ""
    const targetOmittedRows: PhasingRow[] = [
      { directive: "base", metric: "", deltaPercent: 10 }, // deltaPercent ignored when metric is ""
    ];
    const targetOmittedPhasing = rowsToPhasing(targetOmittedRows, "base phase", "", 1);
    expect(targetOmittedPhasing?.weeks?.[0].target).toBeUndefined();

    // plannedWeeks = max(rows.length, weeksCount)
    const longProgramPhasing = rowsToPhasing(rows, "accumulation", "", 6);
    expect(longProgramPhasing?.plannedWeeks).toBe(6);

    const longRowsPhasing = rowsToPhasing(
      [...rows, { directive: "base", metric: "", deltaPercent: null }, { directive: "base", metric: "", deltaPercent: null }, { directive: "base", metric: "", deltaPercent: null }],
      "accumulation",
      "",
      4
    );
    expect(longRowsPhasing?.plannedWeeks).toBe(7);

    // empty rows + empty phase -> null
    expect(rowsToPhasing([], "", "", 4)).toBeNull();
    expect(rowsToPhasing([], "   ", "", 4)).toBeNull();

    // phasingToRows(null) -> []
    expect(phasingToRows(null)).toEqual([]);
  });
});

import { progressionPreview } from "./phasing";
import type { ProgramWeekDto } from "./api/types";

describe("progression rules (F23)", () => {
  test("rows carry a week's progression rule and round-trip it; incomplete rules drop", () => {
    const p: ProgramPhasingDto = {
      plannedWeeks: 2,
      phase: "acc",
      nextPhase: null,
      weeks: [{ week: 1, directive: "base" }, { week: 2, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } }],
    };
    const rows = phasingToRows(p);
    expect(rows[1]).toMatchObject({ progKind: "kg", progAmount: 2.5 });
    expect(rowsToPhasing(rows, "acc", "", 2)).toEqual(p);
    const partial = [rows[0], { ...rows[1], progAmount: null }];
    expect(rowsToPhasing(partial, "acc", "", 2)?.weeks?.[1].progression).toBeUndefined();
    const zero = [rows[0], { ...rows[1], progAmount: 0 }];
    expect(rowsToPhasing(zero, "acc", "", 2)?.weeks?.[1].progression).toBeUndefined();
  });

  test("progressionPreview: what each generated week changes vs the saved one, and its planned volume", () => {
    const w1: ProgramWeekDto = {
      week: 1,
      sessions: [
        { id: "s1", name: "Lower", seq: 1, order: 0, kind: "lifting", exercises: [
          { id: "e1", exerciseId: "sq", exerciseName: "Squat", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, targetWeightKg: 100 }] },
        ] },
      ],
    };
    const w2 = { ...structuredClone(w1), week: 2 };
    const phasing: ProgramPhasingDto = {
      plannedWeeks: 3,
      phase: "acc",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
        { week: 3, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      ],
    };
    const { weeks, rows } = progressionPreview([w1, w2], phasing, null);
    expect(weeks).toHaveLength(3);
    expect(rows.map((r) => [r.week, r.rule, r.isNew, r.planned])).toEqual([
      [2, "+2.5 kg", false, 513],
      [3, "+2.5 kg", true, 525],
    ]);
    expect(rows[0].changes.map((c) => [c.exercise, c.from, c.to])).toEqual([["Squat", "100 kg", "102.5 kg"]]);
    expect(rows[1].changes).toEqual([]);
  });

  test("weekPlansToRows / rowsToWeekPlans round-trip every preset, notes and rules included", () => {
    for (const p of SCHEME_PRESETS) expect(rowsToWeekPlans(weekPlansToRows(p.weeks))).toEqual(p.weeks);
  });

  test("rowsToWeekPlans drops blank notes, zero rules and targets without a number; rounds sets", () => {
    const rows: PhasingRow[] = [
      { directive: "base", metric: "", deltaPercent: null, note: "  " },
      { directive: "+volume", metric: "overall_volume", deltaPercent: null, progKind: "sets", progAmount: 1.4, note: " RPE 8 " },
      { directive: "+intensity", metric: "", deltaPercent: null, progKind: "kg", progAmount: 0 },
    ];
    expect(rowsToWeekPlans(rows)).toEqual([
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume", progression: { kind: "sets", amount: 1 }, note: "RPE 8" },
      { week: 3, directive: "+intensity" },
    ]);
  });
});
