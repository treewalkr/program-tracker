import { describe, expect, test } from "bun:test";
import { phasingToRows, rowsToPhasing, type PhasingRow } from "./phasing";
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
