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
