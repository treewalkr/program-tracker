import { describe, expect, test } from "bun:test";
import {
  availableHrMethods,
  computeHrZones,
  HrProfileInput,
  missingHrInputs,
  profileOn,
  profileZones,
  zoneBpm,
  zoneIssues,
  type HrZones,
} from "./hr";

describe("computeHrZones", () => {
  test("Karvonen for resting 58 / max 188 (HRR 130): 30/40/55/70/85 % of reserve", () => {
    expect(computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })).toEqual([
      { zone: 1, min: 97, max: 109 },
      { zone: 2, min: 110, max: 129 },
      { zone: 3, min: 130, max: 148 },
      { zone: 4, min: 149, max: 168 },
      { zone: 5, min: 169, max: 188 },
    ]);
  });

  test("Karvonen zone 2 stays moderate: under ~75 % of max HR, unlike the %HRmax bands reused on reserve", () => {
    const z2 = computeHrZones("karvonen", { restingHr: 60, maxHr: 190 })![1];
    // 40–55 % of a 130 bpm reserve on top of 60 resting
    expect(z2).toEqual({ zone: 2, min: 112, max: 131 });
    expect(z2.max / 190).toBeLessThan(0.75);
  });

  test("%HRmax and %LTHR", () => {
    expect(computeHrZones("hrmax", { maxHr: 190 })![1]).toEqual({ zone: 2, min: 114, max: 132 });
    const lthr = computeHrZones("lthr", { lthr: 170 })!;
    expect(lthr[3]).toEqual({ zone: 4, min: 162, max: 169 });
    expect(lthr[4]).toEqual({ zone: 5, min: 170, max: 180 });
  });

  test("a method with a missing input is unavailable, never estimated", () => {
    expect(computeHrZones("karvonen", { maxHr: 188 })).toBeNull();
    expect(computeHrZones("lthr", { maxHr: 188 })).toBeNull();
    expect(missingHrInputs("karvonen", {})).toEqual(["restingHr", "maxHr"]);
    expect(availableHrMethods({ maxHr: 188 })).toEqual(["hrmax", "custom"]);
  });

  test("computed zones have no gaps or overlaps", () => {
    for (const zones of [computeHrZones("hrmax", { maxHr: 201 }), computeHrZones("lthr", { lthr: 163 }), computeHrZones("karvonen", { restingHr: 47, maxHr: 179 })]) {
      expect(zoneIssues(zones!)).toEqual([]);
    }
  });
});

describe("zoneIssues", () => {
  const ok: HrZones = computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })!;

  test("finds gaps and overlaps", () => {
    const gap = ok.map((z) => (z.zone === 3 ? { ...z, min: 133 } : z));
    expect(zoneIssues(gap)).toEqual(["gap between zone 2 and zone 3 (130–132 bpm)"]);
    const overlap = ok.map((z) => (z.zone === 2 ? { ...z, max: 135 } : z));
    expect(zoneIssues(overlap)).toEqual(["zone 2 and zone 3 overlap"]);
    expect(zoneIssues(ok.slice(0, 4))).toEqual(["zones must be 1 to 5, once each"]);
  });
});

describe("HrProfileInput", () => {
  test("needs the method's inputs; custom needs a clean table", () => {
    expect(HrProfileInput.safeParse({ effectiveFrom: "2026-11-01", method: "karvonen", maxHr: 188 }).success).toBe(false);
    expect(HrProfileInput.safeParse({ effectiveFrom: "2026-11-01", method: "karvonen", restingHr: 190, maxHr: 188 }).success).toBe(false);
    const custom = { effectiveFrom: "2026-11-01", method: "custom", zones: computeHrZones("hrmax", { maxHr: 190 }) };
    const parsed = HrProfileInput.parse(custom);
    expect(profileZones(parsed)).toEqual(custom.zones!);
    const bad = { ...custom, zones: custom.zones!.map((z) => (z.zone === 4 ? { ...z, min: z.min - 5 } : z)) };
    expect(HrProfileInput.safeParse(bad).success).toBe(false);
  });
});

describe("profileOn", () => {
  const zones = computeHrZones("hrmax", { maxHr: 190 })!;
  const v = (version: number, effectiveFrom: string) => ({ version, effectiveFrom, zones });
  const versions = [v(1, "2026-09-01"), v(2, "2026-10-15"), v(3, "2026-10-15"), v(4, "2026-12-01")];

  test("resolves the version in effect on a date", () => {
    expect(profileOn(versions, "2026-08-31")).toBeNull();
    expect(profileOn(versions, "2026-09-01")!.version).toBe(1);
    expect(profileOn(versions, "2026-10-14")!.version).toBe(1);
    expect(profileOn(versions, "2026-10-20")!.version).toBe(3);
    expect(profileOn(versions, "2027-01-01")!.version).toBe(4);
  });

  test("zoneBpm picks one zone's band", () => {
    expect(zoneBpm(zones, 2)).toEqual({ min: 114, max: 132 });
    expect(zoneBpm(zones, null)).toBeNull();
    expect(zoneBpm(null, 2)).toBeNull();
  });
});
