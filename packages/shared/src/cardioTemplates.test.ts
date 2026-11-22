import { describe, expect, test } from "bun:test";
import { CARDIO_TEMPLATE_PRESETS, CardioTemplatePrescription, fromCardioTemplate } from "./cardioTemplates";
import { cardioIssues, cardioTotals } from "./cardio";
import { CardioPrescription } from "./domain";
import { MODALITY_PRESETS, modalityMetric } from "./modalities";

describe("cardio template presets", () => {
  test("six presets, each a valid prescription with a workload", () => {
    expect(CARDIO_TEMPLATE_PRESETS.map((p) => p.key)).toEqual([
      "easy-zone2",
      "tempo-threshold",
      "intervals",
      "long-endurance",
      "continuous",
      "custom",
    ]);
    for (const p of CARDIO_TEMPLATE_PRESETS) {
      const rx = fromCardioTemplate(p, "Running");
      expect(CardioPrescription.safeParse(rx).success).toBe(true);
      expect(cardioIssues(rx)).toEqual([]);
    }
  });

  test("the Intervals preset: 4×3:00 in zone 4 at RPE 8, 3:00 easy between, session RPE 7 (36:00)", () => {
    const rx = fromCardioTemplate(CARDIO_TEMPLATE_PRESETS[2], "Running");
    // 10 warm-up + 4×3 + 3×3 recovery + 5 cool-down
    expect(cardioTotals(rx).durationSec).toBe(36 * 60);
    expect(rx.templateId).toBe("intervals");
    expect(rx.targetRpe).toBe(7);
    expect(rx.intervals![1]).toMatchObject({ repeat: 4, durationSec: 180, hrZone: 4, rpe: 8, recovery: { type: "active_recovery", durationSec: 180 } });
    expect(rx.intervals![1].notes).toBe("Go by effort; HR lags in short reps.");
  });

  test("preset science: tempo 6 (reps 7), continuous RPE 4, long 60 min, no stray intensity slug", () => {
    const by = Object.fromEntries(CARDIO_TEMPLATE_PRESETS.map((p) => [p.key, p.prescription]));
    expect(by["tempo-threshold"].targetRpe).toBe(6);
    expect(by["tempo-threshold"].intervals![1].rpe).toBe(7);
    expect(by.continuous.targetRpe).toBe(4);
    expect(by["long-endurance"].durationMin).toBe(60);
    for (const p of CARDIO_TEMPLATE_PRESETS) expect(p.prescription.intensity).toBeUndefined();
  });

  test("a template copy never shares intervals with the preset", () => {
    const rx = fromCardioTemplate(CARDIO_TEMPLATE_PRESETS[2], "Rowing");
    rx.intervals![1].repeat = 6;
    expect(CARDIO_TEMPLATE_PRESETS[2].prescription.intervals![1].repeat).toBe(4);
  });
});

describe("saved template prescription", () => {
  test("modality optional, workload required", () => {
    expect(CardioTemplatePrescription.safeParse({ durationMin: 30 }).success).toBe(true);
    expect(CardioTemplatePrescription.safeParse({ hrZone: 2 }).success).toBe(false);
  });
});

describe("modalities", () => {
  test("eight presets with a metric each", () => {
    expect(MODALITY_PRESETS.map((m) => m.name)).toEqual([
      "Running",
      "Walking",
      "Cycling",
      "Rowing",
      "SkiErg",
      "Elliptical",
      "Stair climber",
      "Other",
    ]);
  });

  test("metric by name: trainer row first, then preset, else none", () => {
    expect(modalityMetric("rowing")).toBe("split");
    expect(modalityMetric("Cycling")).toBe("speed");
    expect(modalityMetric("Trail run", [{ name: "Trail run", metric: "pace" }])).toBe("pace");
    expect(modalityMetric("Bike")).toBe("none");
    expect(modalityMetric(null)).toBe("none");
  });
});
