import { describe, expect, test } from "bun:test";
import { computeHrZones } from "@pt/shared";
import { hrDraftOf, hrDraftZones, hrInputOf, hrInputsLine } from "./hrProfile";

const today = "2026-11-22";

describe("HR profile draft", () => {
  test("a new member starts on % of max with nothing filled, and says what's missing", () => {
    const d = hrDraftOf(null, today);
    expect(d.method).toBe("hrmax");
    expect(hrDraftZones(d)).toEqual({ missing: "% of max HR needs max HR." });
    expect(hrInputOf({ ...d, method: "karvonen" })).toEqual({ error: "Heart-rate reserve needs resting HR and max HR." });
  });

  test("karvonen from resting 58 / max 188 gives the computed zones and a valid input", () => {
    const d = { ...hrDraftOf(null, today), method: "karvonen" as const, restingHr: 58, maxHr: 188 };
    expect(hrDraftZones(d)).toEqual({ zones: computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })! });
    const out = hrInputOf(d);
    expect("input" in out && out.input).toMatchObject({ effectiveFrom: today, method: "karvonen", restingHr: 58, maxHr: 188, maxHrTestedOn: null });
    expect("input" in out && out.input.zones).toBeUndefined();
  });

  test("resting at or above max is refused", () => {
    expect(hrInputOf({ ...hrDraftOf(null, today), method: "karvonen", restingHr: 190, maxHr: 188 })).toEqual({ error: "Resting HR must be below max HR." });
  });

  test("custom: blanks, gaps and overlaps are named; a clean table saves", () => {
    const base = { ...hrDraftOf(null, today), method: "custom" as const };
    expect(hrInputOf(base)).toEqual({ error: "Type a min and max bpm for every zone." });
    const zones = computeHrZones("hrmax", { maxHr: 190 })!.map((z) => ({ ...z }));
    zones[2].min += 3;
    expect(hrInputOf({ ...base, zones })).toEqual({ error: "Gap between zone 2 and zone 3 (133–135 bpm)." });
    const ok = computeHrZones("hrmax", { maxHr: 190 })!;
    const out = hrInputOf({ ...base, zones: ok.map((z) => ({ ...z })) });
    expect("input" in out && out.input.zones).toEqual(ok);
  });

  test("a new version copies the current inputs and starts today", () => {
    const cur = { method: "karvonen" as const, restingHr: 58, maxHr: 188, maxHrTestedOn: "2026-09-28", lthr: null, zones: computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })! };
    const d = hrDraftOf(cur, today);
    expect(d).toMatchObject({ method: "karvonen", restingHr: 58, maxHr: 188, maxHrTestedOn: "2026-09-28", effectiveFrom: today });
    expect(hrInputsLine(cur)).toBe("Max 188 bpm (tested 2026-09-28) · resting 58");
    expect(hrInputsLine({ restingHr: null, maxHr: null, maxHrTestedOn: null, lthr: null })).toBe("No inputs recorded");
  });
});
