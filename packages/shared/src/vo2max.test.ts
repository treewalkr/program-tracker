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

describe("Rockport reproduces published worked examples", () => {
  const kg = (lb: number) => lb / 2.2046226218;
  test("HFE example: man, 180 lb, 30 y, 12:15, HR 165 → 47.88", () => {
    expect(rockportVo2({ weightKg: kg(180), age: 30, sex: "male", timeSec: 12 * 60 + 15, heartRate: 165 })).toBe(47.9);
  });
  test("Rockport walking program PDF: man, 160 lb, 33 y, 11:20, HR 160 → 52.03", () => {
    expect(rockportVo2({ weightKg: kg(160), age: 33, sex: "male", timeSec: 11 * 60 + 20, heartRate: 160 })).toBe(52.0);
  });
});

describe("VO₂max inputs outside the equations' range are refused (QA B4)", () => {
  const member = { sex: "male" as const, birthDate: "1990-01-01" };
  const on = "2026-11-01";
  test("Cooper keeps 1,000–5,000 m", () => {
    expect(estimateVo2("cooper_12min", { distanceM: 200 }, member, on).ok).toBe(false);
    expect(estimateVo2("cooper_12min", { distanceM: 6000 }, member, on).ok).toBe(false);
    expect(estimateVo2("cooper_12min", { distanceM: 999 }, member, on).ok).toBe(false);
    expect(estimateVo2("cooper_12min", { distanceM: 1000 }, member, on).ok).toBe(true);
    expect(estimateVo2("cooper_12min", { distanceM: 5000 }, member, on).ok).toBe(true);
  });
  test("1.5 mile keeps 5:30–30:00", () => {
    expect(estimateVo2("run_1_5mile", { timeSec: 60 }, member, on).ok).toBe(false);
    expect(estimateVo2("run_1_5mile", { timeSec: 329 }, member, on).ok).toBe(false);
    expect(estimateVo2("run_1_5mile", { timeSec: 1801 }, member, on).ok).toBe(false);
    expect(estimateVo2("run_1_5mile", { timeSec: 330 }, member, on).ok).toBe(true);
  });
  test("Rockport keeps an 8–30 minute walk and HR 60–220", () => {
    const ok = { timeSec: 900, heartRate: 130, weightKg: 70 };
    expect(estimateVo2("rockport_walk", { ...ok, timeSec: 4 * 3600 }, member, on).ok).toBe(false);
    expect(estimateVo2("rockport_walk", { ...ok, timeSec: 479 }, member, on).ok).toBe(false);
    expect(estimateVo2("rockport_walk", { ...ok, heartRate: 59 }, member, on).ok).toBe(false);
    expect(estimateVo2("rockport_walk", { ...ok, heartRate: 221 }, member, on).ok).toBe(false);
    expect(estimateVo2("rockport_walk", ok, member, on).ok).toBe(true);
  });
  test("Rockport is refused under 18 and warns outside 30–69", () => {
    const walk = { timeSec: 900, heartRate: 130, weightKg: 70 };
    expect(estimateVo2("rockport_walk", walk, { sex: "female", birthDate: "2010-01-01" }, on)).toMatchObject({ ok: false });
    const young = estimateVo2("rockport_walk", walk, { sex: "female", birthDate: "2000-01-01" }, on);
    expect(young.ok && young.warning).toMatch(/30–69/);
    const old = estimateVo2("rockport_walk", walk, { sex: "female", birthDate: "1950-01-01" }, on);
    expect(old.ok && old.warning).toMatch(/30–69/);
    const mid = estimateVo2("rockport_walk", walk, { sex: "female", birthDate: "1980-01-01" }, on);
    expect(mid.ok && mid.warning).toBeUndefined();
  });
});
