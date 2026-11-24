import { describe, expect, test } from "bun:test";
import { intervalBreakdown, paceField, paceTargetText, targetMetric } from "./cardioTarget";

describe("pace targets follow the modality", () => {
  test("run and walk: pace per km or per mile", () => {
    const km = paceField("pace", "km")!;
    expect(km.kind).toBe("duration");
    expect(km.unit).toBe("/km");
    expect(km.show(320)).toBe(320);
    expect(km.store(320)).toBe(320);
    const mi = paceField("pace", "mi")!;
    expect(mi.unit).toBe("/mi");
    expect(mi.show(320)).toBe(515); // 5:20/km ≈ 8:35/mi
    expect(mi.store(515)).toBe(320);
    expect(paceTargetText(320, "pace", "km")).toBe("5:20 /km");
    expect(paceTargetText(320, "pace", "mi")).toBe("8:35 /mi");
  });

  test("row and SkiErg: a /500 m split, stored as seconds per km", () => {
    const f = paceField("split", "mi")!;
    expect(f.unit).toBe("/500 m");
    expect(f.store(110)).toBe(220); // 1:50 /500 m
    expect(f.show(220)).toBe(110);
    expect(paceTargetText(220, "split", "km")).toBe("1:50 /500 m");
  });

  test("bike: a speed in km/h or mph", () => {
    const f = paceField("speed", "km")!;
    expect(f.kind).toBe("speed");
    expect(f.unit).toBe("km/h");
    expect(f.store(30)).toBe(120);
    expect(f.show(120)).toBe(30);
    const mph = paceField("speed", "mi")!;
    expect(mph.unit).toBe("mph");
    expect(mph.show(120)).toBe(18.6);
    expect(paceTargetText(120, "speed", "km")).toBe("30 km/h");
  });

  test("a typed speed or per-mile pace survives the whole-second round trip", () => {
    const trip = (f: NonNullable<ReturnType<typeof paceField>>, v: number) => f.show(f.store(v)!);
    const kmh = paceField("speed", "km")!;
    for (const v of [25, 27.5, 32.5, 42.5, 50]) expect(trip(kmh, v)).toBe(v);
    const mph = paceField("speed", "mi")!;
    for (const v of [15, 22.5, 25, 30.5]) expect(trip(mph, v)).toBe(v);
    const mi = paceField("pace", "mi")!;
    expect(trip(mi, 545)).toBe(545); // 9:05 /mi, was 9:06
    expect(paceTargetText(kmh.store(32.5)!, "speed", "km")).toBe("32.5 km/h");
    expect(paceTargetText(mi.store(545)!, "pace", "mi")).toBe("9:05 /mi");
  });

  test("elliptical and stairs: no pace at all", () => {
    expect(paceField("none", "km")).toBeNull();
    expect(paceTargetText(300, "none", "km")).toBeNull();
  });

  test("out-of-range input stores nothing", () => {
    expect(paceField("pace", "km")!.store(30)).toBeUndefined();
    expect(paceField("speed", "km")!.store(0)).toBeUndefined();
  });

  test("the metric comes from the trainer's row or a preset; an unknown modality keeps pace", () => {
    expect(targetMetric("Rowing")).toBe("split");
    expect(targetMetric("cycling")).toBe("speed");
    expect(targetMetric("Elliptical")).toBe("none");
    expect(targetMetric("Assault bike", [{ name: "Assault bike", metric: "speed" }])).toBe("speed");
    expect(targetMetric("Trail run")).toBe("pace");
  });
});

describe("intervalBreakdown", () => {
  test("the AI tempo, part by part, with zone, bpm and pace", () => {
    const zones = [
      { zone: 1, min: 97, max: 109 },
      { zone: 2, min: 110, max: 129 },
      { zone: 3, min: 130, max: 148 },
      { zone: 4, min: 149, max: 168 },
      { zone: 5, min: 169, max: 188 },
    ];
    const lines = intervalBreakdown(
      [
        { id: "wu", type: "warmup", repeat: 1, durationSec: 300, hrZone: 2, notes: "easy jog, finish with 2 strides" },
        { id: "reps", type: "work", repeat: 3, durationSec: 300, hrZone: 4, paceSecPerKm: 320, recovery: { type: "active_recovery", durationSec: 60 } },
        { id: "cd", type: "cooldown", repeat: 1, durationSec: 180, hrZone: 1 },
      ],
      { zones, metric: "pace", unit: "km" }
    );
    expect(lines.map((l) => [l.label, l.amount, l.zone, l.bpm, l.pace])).toEqual([
      ["Warm-up", "5:00", "Z2", "110–129 bpm", null],
      ["Work × 3", "5:00", "Z4", "149–168 bpm", "5:20 /km"],
      ["Active recovery × 2", "1:00", null, null, null],
      ["Cool-down", "3:00", "Z1", "97–109 bpm", null],
    ]);
    expect(lines[0].notes).toBe("easy jog, finish with 2 strides");
    expect(lines[2].notes).toBe("between reps");
  });
});
