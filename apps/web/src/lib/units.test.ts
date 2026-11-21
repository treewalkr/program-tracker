import { afterEach, describe, expect, test } from "bun:test";
import type { PrescribedSetDto } from "./api/types";
import { fmtSet, loadParts } from "./format";
import { loadCell, withLoad } from "./programEdit";
import { loggedSetLabel } from "./programLogs";
import { cardioLine } from "./cardioLine";
import { applyUnits, fmtPace, fmtTonnage, fmtWeight, units, weightCells } from "./units.svelte";

const set = (over: Partial<PrescribedSetDto> = {}) => ({ setNumber: 1, reps: 5, amrap: false, ...over }) as PrescribedSetDto;

afterEach(() => applyUnits({ weight: "kg", distance: "km" }));

describe("display units", () => {
  test("135 lb typed in the program editor stores kg and reads back as 135 lb", () => {
    applyUnits({ weight: "lb", distance: "km" });
    const s = withLoad(set(), "135");
    expect(s.targetWeightKg).toBe(61.23);
    expect(loadCell(s)).toBe("135");
    expect(fmtSet(s)).toBe("135lb × 5");
    // the same stored kg in a kg view
    expect(loadCell(s, "kg")).toBe("61.2");
    applyUnits({ weight: "kg", distance: "km" });
    expect(withLoad(set(), "100").targetWeightKg).toBe(100);
  });

  test("fmtSet and loadParts follow the unit, %1RM loads resolve in kg first", () => {
    const pct = set({ percent1rm: 75 });
    expect(fmtSet(pct, 140)).toBe("105kg (75%) × 5");
    expect(loadParts(pct, 140)).toEqual({ kg: "105kg", pct: "75%" });
    expect(fmtSet(pct, 140, "lb")).toBe("231.5lb (75%) × 5");
    expect(loadParts(set({ targetWeightKg: 100 }), null, "lb")).toEqual({ kg: "220.5lb", pct: null });
    applyUnits({ weight: "lb", distance: "km" });
    expect(units.weight).toBe("lb");
    expect(loggedSetLabel({ weightKg: 60, reps: 8, rpe: 8 }, false)).toBe("132.3 lb × 8 @ 8");
  });

  test("a log cell keeps what was typed in lb and stores exact kg; kg passes through", () => {
    applyUnits({ weight: "lb", distance: "km" });
    const c = weightCells();
    const kg = c.set("r1", 62.25) as number;
    expect(kg).toBe(28.24);
    expect(c.get("r1", kg)).toBe(62.25);
    // a value that arrived as kg (prefill, fill-down) shows converted
    expect(c.get("r2", 100)).toBe(220.5);
    applyUnits({ weight: "kg", distance: "km" });
    expect(c.set("r1", 61.25)).toBe(61.25);
    expect(c.get("r1", 61.25)).toBe(61.25);
  });

  test("totals, distances and pace", () => {
    expect(fmtTonnage(4250)).toBe("4.3t");
    expect(fmtTonnage(4250, "lb")).toBe("9,370lb");
    expect(fmtWeight(61.5, "lb")).toBe("135.6 lb");
    applyUnits({ weight: "kg", distance: "mi" });
    expect(fmtPace(406)).toBe("10:53 /mi");
    expect(cardioLine({ modality: "Running", durationMin: 35, distanceKm: 5.2 })).toContain("3.23 mi");
  });
});
