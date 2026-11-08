import { describe, expect, test } from "bun:test";
import { fmtDateTime, weekOptions, weekPlanLabel } from "./format";

describe("weekPlanLabel", () => {
  test("weekPlanLabel renders directive and quantified target", () => {
    const withTarget = weekPlanLabel({
      week: 2,
      directive: "+volume" as any,
      target: { metric: "overall_volume", deltaPercent: 5 },
    });
    expect(withTarget).toBe("W2 · +volume · overall vol +5%");

    const noTarget = weekPlanLabel({
      week: 3,
      directive: "base" as any,
    });
    expect(noTarget).toBe("W3 · base");
  });

  test("weekOptions lists every week and marks the clamped current default", () => {
    const weeks = [{ week: 1 }, { week: 2 }, { week: 3 }, { week: 4 }] as any;
    const opts2 = weekOptions(weeks, 2);
    expect(opts2.map((o) => o.label)).toEqual(["W1", "W2", "W3", "W4"]);
    expect(opts2.find((o) => o.isCurrent)?.label).toBe("W2");

    const optsClamped = weekOptions(weeks, 9);
    expect(optsClamped.find((o) => o.isCurrent)?.label).toBe("W4");
  });
});

describe("fmtDateTime", () => {
  const withTz = (tz: string, fn: () => void) => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      fn();
    } finally {
      process.env.TZ = prev;
    }
  };

  test("full local stamp with weekday, seconds and offset", () => {
    withTz("Asia/Bangkok", () => expect(fmtDateTime("2026-11-07T07:39:42.000Z")).toBe("Sat 7 Nov 2026, 14:39:42 GMT+7"));
  });
  test("half-hour and zero offsets", () => {
    withTz("Asia/Kolkata", () => expect(fmtDateTime("2026-11-07T00:00:05.000Z")).toBe("Sat 7 Nov 2026, 05:30:05 GMT+5:30"));
    withTz("UTC", () => expect(fmtDateTime("2026-01-02T03:04:05.000Z")).toBe("Fri 2 Jan 2026, 03:04:05 GMT"));
  });
});

import { fmtSet, rpeLabel } from "./format";

describe("fmtSet (F22)", () => {
  test("AMRAP reads as AMRAP with a stop RPE, never failure", () => {
    expect(fmtSet({ reps: 0, amrap: true, targetWeightKg: 90, stopRpe: 9 })).toBe("90kg × AMRAP, stop @ RPE 9");
    expect(fmtSet({ reps: 0, amrap: true })).toBe("AMRAP");
    expect(fmtSet({ reps: 5, amrap: true, stopRpe: 8 })).toBe("5+ AMRAP, stop @ RPE 8");
  });

  test("an older AMRAP with a target RPE reads that RPE as its stop", () => {
    expect(fmtSet({ reps: 0, amrap: true, targetWeightKg: 90, targetRpe: 9 })).toBe("90kg × AMRAP, stop @ RPE 9");
  });

  test("%1RM shows the resolved kg when the 1RM is known, else the percentage", () => {
    expect(fmtSet({ reps: 5, amrap: false, percent1rm: 75 }, 140)).toBe("105kg (75%) × 5");
    expect(fmtSet({ reps: 5, amrap: false, percent1rm: 75 })).toBe("75% × 5");
    expect(fmtSet({ reps: 5, amrap: false, percent1rm: 75, targetWeightKg: 100 })).toBe("100kg × 5");
  });

  test("rpeLabel: ranges, RIR, and nothing for AMRAP (its RPE is the stop)", () => {
    expect(rpeLabel({ targetRpe: 8, targetRpeMin: 7 })).toBe("7–8");
    expect(rpeLabel({ targetRpe: 8 })).toBe("8");
    expect(rpeLabel({ targetRpe: 9, amrap: true })).toBeNull();
    expect(rpeLabel({})).toBeNull();
  });
});
