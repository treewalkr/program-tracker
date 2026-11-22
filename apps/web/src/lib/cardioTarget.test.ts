import { describe, expect, test } from "bun:test";
import { paceField, paceTargetText, targetMetric } from "./cardioTarget";

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
