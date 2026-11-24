import { describe, expect, test } from "bun:test";
import { computeHrZones, type CardioLog, type LogPrescription, type ProgramSession } from "@pt/shared";
import { cardioLogRows, cardioTiles, cardioWeeks, dayLabel, distanceByModality, hoursMinutes, planSource, repResults, reviewRows } from "./cardioTab";

const monday = "2026-11-16";
const log = (id: string, date: string, cardio: CardioLog, extra: Record<string, unknown> = {}) => ({
  id,
  date,
  kind: "cardio",
  programId: "pg",
  programSessionId: null as string | null,
  cardio,
  ...extra,
});

const intervals: ProgramSession = {
  id: "ps-int",
  name: "Intervals 5 × 2 min",
  seq: 2,
  weekday: 6,
  order: 0,
  kind: "cardio",
  exercises: [],
  cardio: {
    modality: "Running",
    targetRpe: 8,
    intervals: [
      { id: "wu", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2 },
      { id: "w", type: "work", repeat: 5, durationSec: 120, hrZone: 4, recovery: { type: "active_recovery", durationSec: 120 } },
      { id: "cd", type: "cooldown", repeat: 1, durationSec: 300 },
    ],
  },
};
const run: ProgramSession = { id: "ps-run", name: "Zone 2 run", seq: 1, weekday: 2, order: 0, kind: "cardio", exercises: [], cardio: { modality: "Running", durationMin: 40, hrZone: 2 } };
const program = { id: "pg", startsOn: "2026-11-09", weeks: [1, 2].map((week) => ({ week, sessions: [run, intervals] })) };

describe("cardio tab", () => {
  const logs = [
    log("a", "2026-11-17", { modality: "Running", durationSec: 2400, rpe: 3, distanceKm: 6.2 }, { programSessionId: "ps-run" }),
    log("b", "2026-11-18", { modality: "Cycling", skipped: { reason: "time" } }),
    log("c", "2026-11-10", { modality: "Running", durationSec: 2400, rpe: 4, distanceKm: 6 }, { programSessionId: "ps-run", reviewedAt: "2026-11-11T09:00:00Z" }),
    log("d", "2026-11-19", { modality: "Cycling", durationSec: 3600, rpe: 3, distanceKm: 24 }),
  ];

  test("weeks: load per calendar week, oldest first; skipped logs add nothing", () => {
    const w = cardioWeeks(logs, monday, 3);
    expect(w.map((x) => [x.label, x.load, x.sessions])).toEqual([
      ["2 Nov", 0, 0],
      ["9 Nov", 160, 1],
      ["16 Nov", 120 + 180, 2],
    ]);
  });

  test("tiles: this week's sessions and minutes against the plan, completion over four weeks", () => {
    const t = cardioTiles(logs, program, monday, "2026-11-22");
    expect(t.sessions).toEqual({ done: 2, planned: 2 });
    expect(t.minutes).toEqual({ done: 100, planned: 40 + 33 });
    expect(t.load).toBe(300);
    // due: run + intervals in week 1 and week 2 = 4; done: both runs
    expect(t.completion).toEqual({ done: 2, due: 4, pct: 50 });
  });

  test("distance stays per modality", () => {
    expect(distanceByModality(logs, monday)).toEqual([
      { modality: "Cycling", sessions: 1, distanceKm: 24 },
      { modality: "Running", sessions: 1, distanceKm: 6.2 },
    ]);
  });

  test("log rows: newest first, with what each needs", () => {
    const rows = cardioLogRows(logs);
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ["d", "to_review"],
      ["b", "skipped"],
      ["a", "to_review"],
      ["c", "reviewed"],
    ]);
    expect(rows[1].facts).toBe("Not done · No time");
    expect(rows.every((r) => r.pain === false)).toBe(true);
    const hurt = cardioLogRows([{ ...logs[0], id: "p", cardio: { modality: "Running", skipped: { reason: "pain" } } }]);
    expect(hurt[0].pain).toBe(true);
    expect(rows[0].facts).toBe("Cycling · 1:00:00 · 24 km · RPE 3 · 180 AU");
    expect(dayLabel("2026-11-21")).toBe("Sat 21 Nov");
  });
});

describe("plan vs actual", () => {
  const zones = computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })!;
  const plan: LogPrescription = { programVersion: 4, session: intervals, hrProfileVersion: 2, zonesBpm: zones };
  const actual: CardioLog = { modality: "Running", durationSec: 2110, distanceKm: 5.2, rpe: 7, avgHr: 151, maxHr: 176 };

  test("the mockup's intervals session", () => {
    const rows = reviewRows(actual, plan, "pace");
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by.Duration).toMatchObject({ plan: "33:00", actual: "35:10" });
    expect(by["Average pace"]).toMatchObject({ actual: "6:46 /km", aside: "calc" });
    expect(by["Heart rate"].plan).toBe(`Z4 work · ${zones[3].min}–${zones[3].max}`);
    expect(by["Heart rate"].actual).toBe("avg 151 · max 176");
    expect(by["Heart rate"].note).toContain("isn't compared");
    expect(by["Session RPE"]).toMatchObject({ plan: "8", actual: "7" });
    expect(by["Session load"]).toMatchObject({ actual: "246 AU", aside: "7 × 35.2 min" });
    expect(by["Work reps"]).toMatchObject({ plan: "5 × 2:00", actual: "Insufficient data", insufficient: true });
    expect(planSource(plan)).toBe("Plan as assigned · program v4 · HR zones v2");
  });

  test("per-interval results replace the insufficient line; a freestyle log has no plan", () => {
    const withReps = { ...actual, intervals: [1, 2, 3].map((rep) => ({ intervalId: "w", rep, durationSec: 118 + rep })) };
    expect(reviewRows(withReps, plan, "pace").find((r) => r.label === "Work reps")).toMatchObject({ actual: "1:59 · 2:00 · 2:01", aside: "3 of 5 timed" });
    const free = reviewRows(actual, null, "pace");
    expect(free.every((r) => r.plan === "—" || r.label === "Average pace")).toBe(true);
    expect(free.some((r) => r.label === "Work reps")).toBe(false);
    expect(planSource(null)).toContain("Freestyle");
  });

  test("per-rep distance, HR and RPE reach the review", () => {
    const hrs = [158, 162, 165, 168, 172];
    const kms = [520, 510, 520, 500, 530];
    const reps = { ...actual, avgHr: undefined, maxHr: undefined, intervals: kms.map((distanceM, i) => ({ intervalId: "w", rep: i + 1, distanceM, avgHr: hrs[i], rpe: i === 4 ? 9 : undefined })) };
    const rows = reviewRows(reps, plan, "pace");
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by["Work reps"]).toMatchObject({ actual: "0.52 · 0.51 · 0.52 · 0.50 · 0.53 km", aside: "5 of 5 with distance" });
    expect(by["Heart rate"]).toMatchObject({ actual: "work reps avg 165" });
    expect(by["Heart rate"].note).toContain("reps' own");

    const table = repResults(reps, plan, "pace");
    expect(table.band).toEqual({ min: zones[3].min, max: zones[3].max });
    expect(table.cols).toEqual({ time: true, distance: true, pace: true, hr: true, rpe: true });
    expect(table.rows[0]).toMatchObject({ rep: "1", time: "2:00", distance: "0.52 km", pace: "3:51 /km", hr: 158, hrVsBand: "in", rpe: null });
    expect(table.rows[4]).toMatchObject({ hr: 172, hrVsBand: "above", rpe: "9" });
    // nothing typed per rep: no table, and the coach is told there's nothing
    expect(repResults(actual, plan, "pace").rows).toEqual([]);
    const blank = { ...actual, intervals: [{ intervalId: "w", rep: 1 }] };
    expect(reviewRows(blank, plan, "pace").find((r) => r.label === "Work reps")).toMatchObject({ actual: "1 reported" });
  });

  test("a bpm band the coach set is the plan, not the zone it overrides", () => {
    const bike = (cardio: ProgramSession["cardio"]): LogPrescription => ({ ...plan, session: { ...intervals, cardio } });
    const ride: CardioLog = { modality: "Cycling", durationSec: 3690, rpe: 4, avgHr: 140 };
    const hr = (p: LogPrescription) => reviewRows(ride, p, "speed").find((r) => r.label === "Heart rate")!.plan;
    expect(hr(bike({ modality: "Cycling", durationMin: 60, hrZone: 2, hrBpm: { min: 135, max: 145 } }))).toBe("135–145 bpm");
    // a band with no zone still has a plan
    expect(hr(bike({ modality: "Cycling", durationMin: 60, hrBpm: { min: 135, max: 145 } }))).toBe("135–145 bpm");
    // a work interval's own band wins over its zone
    const work = intervals.cardio!.intervals!.map((iv) => (iv.type === "work" ? { ...iv, hrBpm: { min: 160, max: 170 } } : iv));
    expect(hr(bike({ modality: "Running", intervals: work }))).toBe("work · 160–170 bpm");
  });
});

test("the Time tile reads hours and minutes in words, not h:mm", () => {
  expect(hoursMinutes(104)).toBe("1 h 44 min");
  expect(hoursMinutes(42)).toBe("42 min");
  expect(hoursMinutes(120)).toBe("2 h");
  expect(hoursMinutes(119.6)).toBe("2 h");
});
