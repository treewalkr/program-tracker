import { expect, test } from "bun:test";
import type { PulseCellSet } from "@pt/shared";
import { drillHeading, drillLoad, drillType } from "./pulseDrill";

const row = (over: Partial<PulseCellSet>): PulseCellSet => ({
  date: "2026-11-03",
  exerciseId: "ex",
  type: "working",
  weightKg: 150,
  reps: 3,
  rpe: 8,
  timed: false,
  e1rm: 165,
  ...over,
});

test("loaded sets read kg × reps @ RPE, decimals kept", () => {
  expect(drillLoad(row({}))).toBe("150 kg × 3 @ 8");
  expect(drillLoad(row({ weightKg: 137.5, reps: 4, rpe: 7.5 }))).toBe("137.5 kg × 4 @ 7.5");
});

test("no RPE drops the @; bodyweight reads BW", () => {
  expect(drillLoad(row({ rpe: null }))).toBe("150 kg × 3");
  expect(drillLoad(row({ weightKg: null, reps: 8, rpe: 9 }))).toBe("BW × 8 @ 9");
});

test("timed holds read seconds, with the load when there is one", () => {
  expect(drillLoad(row({ timed: true, weightKg: 10, reps: 45, rpe: 7 }))).toBe("10 kg · 45 s @ 7");
  expect(drillLoad(row({ timed: true, weightKg: null, reps: 60, rpe: null }))).toBe("60 s");
});

test("set type and heading copy", () => {
  expect(drillType("working")).toBe("Working");
  expect(drillType("backoff")).toBe("Back-off");
  expect(drillHeading("volume", 3, 4)).toBe("Week 3 · overall volume · 4 loaded sets");
  expect(drillHeading("sets", 2, 1)).toBe("Week 2 · sets · 1 set");
  expect(drillHeading("rpe", 1, 5)).toBe("Week 1 · avg RPE · 5 rated sets");
  expect(drillHeading("e1rm", 1, 2)).toBe("Week 1 · best e1RM · 2 loaded sets, highest first");
});
