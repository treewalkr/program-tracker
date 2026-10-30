import { describe, expect, test } from "bun:test";
import { weekOptions, weekPlanLabel } from "./format";

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
