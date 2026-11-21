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

  test("the Intervals preset is the 33:00 session", () => {
    const rx = fromCardioTemplate(CARDIO_TEMPLATE_PRESETS[2], "Running");
    expect(cardioTotals(rx).durationSec).toBe(33 * 60);
    expect(rx.templateId).toBe("intervals");
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
