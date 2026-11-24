import { describe, expect, test } from "bun:test";
import { CardioLog } from "@pt/shared";
import { cardioTemplatePreset, fromCardioTemplate } from "@pt/shared";
import { asPrescribedForm, cardioFormCalc, cardioFormOf, cardioFormOfLog, cardioLogOf, emptyCardioForm, intervalRows, readCardioForm, steadyFromIntervals } from "./cardioForm";

const intervals = fromCardioTemplate(cardioTemplatePreset("intervals")!, "Running");

describe("cardioFormOf", () => {
  test("prefills the modality and planned time, never the RPE", () => {
    const f = cardioFormOf({ ...intervals, targetRpe: 8 } as never);
    expect(f.modality).toBe("Running");
    expect(f.durationSec).toBe(600 + 4 * 180 + 3 * 180 + 300);
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
  test("values the API would refuse are named before saving, and agree with the schema", () => {
    expect(cardioLogOf({ ...done, maxHr: 300 })).toEqual({ error: "maxHrRange" });
    expect(cardioLogOf({ ...done, avgHr: 20 })).toEqual({ error: "avgHrRange" });
    expect(cardioLogOf({ ...done, distanceKm: 301 })).toEqual({ error: "distanceRange" });
    expect(cardioLogOf({ ...done, calories: 20000 })).toEqual({ error: "caloriesRange" });
    expect(cardioLogOf({ ...done, durationSec: 5 * 3600 + 1 })).toEqual({ error: "durationRange" });
    const row = { key: "r:1", intervalId: "r", rep: 1, label: "Work 1 of 5", type: "work" as const, durationSec: null, distanceKm: null, avgHr: null, rpe: 11 };
    expect(cardioLogOf({ ...done, intervals: [row] })).toEqual({ error: "intervalRange" });
    expect(cardioLogOf({ ...done, intervals: [{ ...row, rpe: 15 }] })).toEqual({ error: "intervalRange" });
    // corrected, it saves
    const fixed = cardioLogOf({ ...done, intervals: [{ ...row, rpe: 8 }] });
    expect("cardio" in fixed && CardioLog.safeParse(fixed.cardio).success).toBe(true);
  });
  test("a skipped log sends only its reason", () => {
    expect(cardioLogOf({ ...done, skipped: "time" })).toEqual({ cardio: { modality: "Running", skipped: { reason: "time" } } });
    // skipped for pain keeps where and how bad
    expect(cardioLogOf({ ...done, skipped: "pain", painNote: " left shin " })).toEqual({
      cardio: { modality: "Running", skipped: { reason: "pain" }, pain: { reported: true, note: "left shin" } },
    });
    expect(cardioLogOf({ ...done, skipped: "time", painNote: "ignored" })).toEqual({ cardio: { modality: "Running", skipped: { reason: "time" } } });
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
  // the portal's Thai unit words
  const th = { perKm: "/กม.", perMi: "/ไมล์", per500m: "/500 ม.", kmh: "กม./ชม.", mph: "ไมล์/ชม." };
  expect(cardioFormCalc(f, "pace", th).pace).toBe("6:46 /กม.");
  expect(cardioFormCalc(f, "speed", th).pace).toBe("8.9 กม./ชม.");
});

test("readCardioForm upgrades an old draft's minutes and drops junk", () => {
  const f = readCardioForm({ modality: "Bike", durationMin: "45", hrZone: "2", intensity: "easy", rpe: "6" });
  expect(f).toMatchObject({ modality: "Bike", durationSec: 2700, rpe: 6, skipped: null });
  expect(readCardioForm("junk", emptyCardioForm("Row")).modality).toBe("Row");
});

describe("steadyFromIntervals", () => {
  test("a 6 × 800 m session keeps its timed minutes and its distance", () => {
    const next = steadyFromIntervals({
      modality: "Running",
      intervals: [
        { id: "a", type: "warmup", repeat: 1, durationSec: 600 },
        { id: "b", type: "work", repeat: 6, distanceM: 800, recovery: { type: "active_recovery", durationSec: 180 } },
        { id: "c", type: "cooldown", repeat: 1, durationSec: 300 },
      ],
    });
    expect(next).toEqual({ modality: "Running", durationMin: 30, distanceKm: 4.8 });
  });
  test("a timed session keeps its time only", () => {
    expect(steadyFromIntervals({ modality: "Bike", intervals: [{ id: "a", type: "work", repeat: 3, durationSec: 600 }] })).toEqual({ modality: "Bike", durationMin: 30 });
  });
});
