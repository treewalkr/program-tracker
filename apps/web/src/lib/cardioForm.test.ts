import { describe, expect, test } from "bun:test";
import { cardioTemplatePreset, fromCardioTemplate } from "@pt/shared";
import { asPrescribedForm, cardioFormCalc, cardioFormOf, cardioFormOfLog, cardioLogOf, emptyCardioForm, intervalRows, readCardioForm } from "./cardioForm";

const intervals = fromCardioTemplate(cardioTemplatePreset("intervals")!, "Running");

describe("cardioFormOf", () => {
  test("prefills the modality and planned time, never the RPE", () => {
    const f = cardioFormOf({ ...intervals, targetRpe: 8 } as never);
    expect(f.modality).toBe("Running");
    expect(f.durationSec).toBe(600 + 4 * 180 + 3 * 120 + 300);
    expect(f.rpe).toBeNull();
  });
  test("a row per rep of each interval", () => {
    const rows = intervalRows(intervals);
    expect(rows.map((r) => r.label)).toEqual(["Warm-up", "Work 1 of 4", "Work 2 of 4", "Work 3 of 4", "Work 4 of 4", "Cool-down"]);
  });
  test("as prescribed takes the target RPE", () => {
    expect(asPrescribedForm({ modality: "Bike", durationMin: 40, targetRpe: 3 }).rpe).toBe(3);
  });
});

describe("cardioLogOf", () => {
  const done = { ...emptyCardioForm("Running"), durationSec: 2110, rpe: 7, distanceKm: 5.2, avgHr: 151, maxHr: 176 };

  test("a completed log sends seconds, minutes for a rollback, and the RPE", () => {
    expect(cardioLogOf(done)).toEqual({
      cardio: { modality: "Running", durationSec: 2110, durationMin: 35, rpe: 7, distanceKm: 5.2, avgHr: 151, maxHr: 176 },
    });
  });
  test("duration and RPE are required; max HR can't be under the average", () => {
    expect(cardioLogOf({ ...done, durationSec: null })).toEqual({ error: "duration" });
    expect(cardioLogOf({ ...done, rpe: null })).toEqual({ error: "rpe" });
    expect(cardioLogOf({ ...done, maxHr: 140 })).toEqual({ error: "maxHr" });
    expect(cardioLogOf({ ...done, modality: " " })).toEqual({ error: "modality" });
  });
  test("a skipped log sends only its reason", () => {
    expect(cardioLogOf({ ...done, skipped: "time" })).toEqual({ cardio: { modality: "Running", skipped: { reason: "time" } } });
  });
  test("pain with its note, calories, and only the interval results given", () => {
    const f = { ...cardioFormOf(intervals), durationSec: 1980, rpe: 8, pain: true, painNote: " left knee ", calories: 310 };
    f.intervals[1].durationSec = 178;
    f.intervals[1].avgHr = 168;
    const out = cardioLogOf(f);
    expect("cardio" in out && out.cardio.pain).toEqual({ reported: true, note: "left knee" });
    expect("cardio" in out && out.cardio.calories).toBe(310);
    expect("cardio" in out && out.cardio.intervals).toEqual([{ intervalId: "reps", rep: 1, durationSec: 178, avgHr: 168 }]);
  });
  test("a saved log reads back into the same form", () => {
    const f = { ...cardioFormOf(intervals), durationSec: 1980, rpe: 8 };
    f.intervals[2].durationSec = 181;
    const out = cardioLogOf(f);
    if (!("cardio" in out)) throw new Error("expected a log");
    expect(cardioFormOfLog(out.cardio, intervals)).toEqual(f);
  });
});

test("pace and load: 35:10 over 5.2 km is 6:46 /km; RPE 7 × 35.2 min is 246 AU", () => {
  const f = { ...emptyCardioForm("Running"), durationSec: 2110, distanceKm: 5.2, rpe: 7 };
  expect(cardioFormCalc(f, "pace")).toEqual({ pace: "6:46 /km", load: 246 });
  expect(cardioFormCalc({ ...f, distanceKm: null }, "pace").pace).toBeNull();
  expect(cardioFormCalc(f, "speed").pace).toBe("8.9 km/h");
});

test("readCardioForm upgrades an old draft's minutes and drops junk", () => {
  const f = readCardioForm({ modality: "Bike", durationMin: "45", hrZone: "2", intensity: "easy", rpe: "6" });
  expect(f).toMatchObject({ modality: "Bike", durationSec: 2700, rpe: 6, skipped: null });
  expect(readCardioForm("junk", emptyCardioForm("Row")).modality).toBe("Row");
});
