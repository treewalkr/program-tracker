import { describe, expect, test } from "bun:test";
import { weekPlanLabel } from "./format";

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
});
