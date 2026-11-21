import { describe, expect, test } from "bun:test";
import { ageOn } from "./client";
import { cooperVo2, estimateVo2, rockportVo2, run15MileVo2, VO2_FORMULAS, VO2_PROTOCOLS } from "./vo2max";

describe("VO₂max formulas", () => {
  test("Cooper: 2,400 m in 12 minutes ≈ 42.4", () => {
    expect(cooperVo2(2400)).toBe(42.4);
  });

  test("1.5-mile run in 12:00 = 43.75 (shown to one decimal)", () => {
    expect(3.5 + 483 / 12).toBe(43.75);
    expect(run15MileVo2(720)).toBe(43.8);
  });

  test("Rockport: 30-year-old man, 70 kg (154.3 lb), 13:00, HR 130", () => {
    // 132.853 − 0.0769·154.32 − 0.3877·30 + 6.315 − 3.2649·13 − 0.1565·130 = 52.88
    expect(rockportVo2({ weightKg: 70, age: 30, sex: "male", timeSec: 780, heartRate: 130 })).toBe(52.9);
    // Same walk for a woman: 6.315 lower
    expect(rockportVo2({ weightKg: 70, age: 30, sex: "female", timeSec: 780, heartRate: 130 })).toBe(46.6);
  });

  test("every protocol carries a version and a citation", () => {
    for (const p of VO2_PROTOCOLS) {
      expect(VO2_FORMULAS[p].version).toBeTruthy();
      expect(VO2_FORMULAS[p].source).toMatch(/19\d\d|ACSM/);
    }
  });
});

describe("estimateVo2", () => {
  const member = { sex: "male" as const, birthDate: "1996-05-20" };

  test("age comes from the birth date on the test date", () => {
    expect(ageOn("1996-05-20", "2026-05-19")).toBe(29);
    expect(ageOn("1996-05-20", "2026-05-20")).toBe(30);
    expect(estimateVo2("rockport_walk", { timeSec: 780, heartRate: 130, weightKg: 70 }, member, "2026-11-01")).toEqual({
      ok: true,
      value: 52.9,
      formulaVersion: "kline-1987",
    });
  });

  test("Rockport without a recorded sex is an error, never a guess", () => {
    const r = estimateVo2("rockport_walk", { timeSec: 780, heartRate: 130, weightKg: 70 }, { birthDate: "1996-05-20" }, "2026-11-01");
    expect(r).toEqual({ ok: false, error: "Rockport needs the member's sex recorded" });
    expect(estimateVo2("rockport_walk", { timeSec: 780, heartRate: 130, weightKg: 70 }, { sex: "female" }, "2026-11-01").ok).toBe(false);
  });

  test("missing or out-of-range inputs are errors", () => {
    expect(estimateVo2("cooper_12min", {}, member, "2026-11-01").ok).toBe(false);
    expect(estimateVo2("cooper_12min", { distanceM: 50 }, member, "2026-11-01").ok).toBe(false);
    expect(estimateVo2("run_1_5mile", { timeSec: 720, extra: 1 }, member, "2026-11-01").ok).toBe(false);
    expect(estimateVo2("cooper_12min", { distanceM: 2400 }, {}, "2026-11-01")).toEqual({ ok: true, value: 42.4, formulaVersion: "cooper-1968" });
  });
});
