import { describe, expect, test } from "bun:test";
import {
  cardioDone,
  cardioIssues,
  cardioLogIssues,
  cardioLogSec,
  cardioPace,
  isSkippedCardio,
  sessionLoad,
  upgradeCardioLog,
  withDurationMin,
  cardioTotals,
  cardioUnitLabel,
  cardioWeekTotals,
  coerceCardio,
  isoWeekStart,
  ProgramWeeksWrite,
} from "./cardio";
import { CardioLog, CardioPrescription, ProgramWeeksDocument } from "./domain";
import { DraftSession } from "./ai";

describe("isoWeekStart", () => {
  test("returns the Monday", () => {
    expect(isoWeekStart(new Date(2026, 9, 29))).toBe("2026-10-26"); // Thursday → its Monday
    expect(isoWeekStart(new Date(2026, 9, 26))).toBe("2026-10-26"); // Monday edge → itself
    expect(isoWeekStart(new Date(2026, 9, 25))).toBe("2026-10-19"); // Sunday → previous Monday
    expect(isoWeekStart(new Date(2027, 0, 3))).toBe("2026-12-28"); // Sunday spanning year boundary
  });
});

describe("cardioWeekTotals", () => {
  test("sums minutes, sessions, load and per-modality distance since week start", () => {
    const logs = [
      { date: "2026-10-26", kind: "cardio", cardio: { modality: "Run", durationMin: 40, hrZone: 3, rpe: 5, distanceKm: 6 } }, // old row
      { date: "2026-10-28", kind: "cardio", cardio: { modality: "Bike", durationSec: 35 * 60, rpe: 4, distanceKm: 14 } },
      { date: "2026-10-29", kind: "cardio", cardio: { modality: "Run", durationSec: 42 * 60 + 15, rpe: 4, distanceKm: 6.5 } },
      { date: "2026-10-30", kind: "cardio", cardio: { modality: "Row" } }, // no duration → session only
      { date: "2026-10-30", kind: "cardio", cardio: { modality: "Run", skipped: { reason: "time" } } }, // skipped: not counted
      { date: "2026-10-25", kind: "cardio", cardio: { modality: "Run", durationMin: 60, hrZone: 2 } }, // before since
      { date: "2026-10-27", kind: "exercises", sets: [] }, // exercise log ignored
      { date: "2026-10-27", cardio: { modality: "Run", durationMin: 30 } }, // missing kind ignored
    ];
    const totals = cardioWeekTotals(logs as any, "2026-10-26");
    expect(totals.minutes).toBe(117);
    expect(totals.sessions).toBe(4);
    expect(totals.load).toBe(200 + 140 + 169);
    expect(totals.zoneMinutes).toBe(120 + 35 + 42);
    expect(totals.byModality).toEqual({
      Run: { minutes: 82, sessions: 2, load: 369, distanceKm: 12.5 },
      Bike: { minutes: 35, sessions: 1, load: 140, distanceKm: 14 },
      Row: { minutes: 0, sessions: 1, load: 0, distanceKm: 0 },
    });
  });

  test("empty week is all zeros", () => {
    expect(cardioWeekTotals([], "2026-10-26")).toEqual({ minutes: 0, sessions: 0, load: 0, zoneMinutes: 0, byModality: {} });
  });
});

describe("cardioDone", () => {
  const totals = { minutes: 75, sessions: 3, load: 320, zoneMinutes: 155, byModality: {} };

  test("maps the target unit onto the totals", () => {
    expect(cardioDone({ unit: "minutes", value: 150 }, totals)).toBe(75);
    expect(cardioDone({ unit: "sessions", value: 4 }, totals)).toBe(3);
    expect(cardioDone({ unit: "session_load", value: 600 }, totals)).toBe(320);
    expect(cardioDone({ unit: "zone_minutes", value: 200 }, totals)).toBe(155);
  });
});

describe("cardioUnitLabel", () => {
  test("one label per unit", () => {
    expect(cardioUnitLabel("minutes")).toBe("min");
    expect(cardioUnitLabel("sessions")).toBe("sessions");
    expect(cardioUnitLabel("session_load")).toBe("AU");
    expect(cardioUnitLabel("zone_minutes")).toBe("zone-min");
  });
});

describe("cardioTotals", () => {
  // 10:00 warm-up, 4 × 3:00 work with 2:00 recovery between reps (3 recoveries), 5:00 cool-down = 33:00.
  const intervals = CardioPrescription.parse({
    modality: "Run",
    intervals: [
      { id: "a", type: "warmup", durationSec: 600 },
      { id: "b", type: "work", repeat: 4, durationSec: 180, recovery: { type: "active_recovery", durationSec: 120 } },
      { id: "c", type: "cooldown", durationSec: 300 },
    ],
  });

  test("33:00 interval session: recovery counts between reps only", () => {
    expect(cardioTotals(intervals)).toEqual({
      durationSec: 33 * 60,
      distanceM: 0,
      workSec: 720,
      recoverySec: 360,
      untimedDistance: false,
      timedSec: 33 * 60,
    });
  });

  test("recoveryAfterLast adds one more recovery", () => {
    const rx = structuredClone(intervals);
    rx.intervals![1].recoveryAfterLast = true;
    expect(cardioTotals(rx).durationSec).toBe(35 * 60);
  });

  test("a distance-only interval makes the time null, never guessed", () => {
    const t = cardioTotals({
      intervals: [
        { id: "a", type: "warmup", repeat: 1, durationSec: 600 },
        { id: "b", type: "work", repeat: 6, distanceM: 400, recovery: { type: "passive_recovery", durationSec: 90 } },
      ],
    });
    expect(t.durationSec).toBeNull();
    expect(t.untimedDistance).toBe(true);
    expect(t.distanceM).toBe(2400);
    expect(t.recoverySec).toBe(450);
    expect(t.timedSec).toBe(600 + 450); // the timed parts still add up
  });

  test("without intervals the session's own duration and distance are the plan", () => {
    expect(cardioTotals({ durationMin: 40, distanceKm: 6.5 })).toEqual({
      durationSec: 2400,
      distanceM: 6500,
      workSec: 2400,
      recoverySec: 0,
      untimedDistance: false,
      timedSec: 2400,
    });
    expect(cardioTotals({ distanceKm: 5 }).durationSec).toBeNull();
  });
});

describe("cardioIssues", () => {
  test("needs at least one workload", () => {
    expect(cardioIssues({})).toHaveLength(1);
    expect(cardioIssues({ durationMin: 30 })).toEqual([]);
    expect(cardioIssues({ distanceKm: 5 })).toEqual([]);
    expect(cardioIssues({ intervals: [{ id: "a", type: "work", repeat: 1, distanceM: 400 }] })).toEqual([]);
    expect(cardioIssues({ intervals: [{ id: "a", type: "work", repeat: 1, notes: "hard" }] })).toHaveLength(1);
  });

  test("recovery belongs on a work interval and needs a time or distance", () => {
    const issues = cardioIssues({
      durationMin: 30,
      intervals: [
        { id: "a", type: "warmup", repeat: 1, durationSec: 60, recovery: { type: "passive_recovery", durationSec: 30 } },
        { id: "b", type: "work", repeat: 2, durationSec: 60, recovery: { type: "passive_recovery" } },
      ],
    });
    expect(issues).toHaveLength(2);
  });

  test("schema rejects an inverted HR band and more than 20 intervals", () => {
    expect(CardioPrescription.safeParse({ modality: "Run", hrBpm: { min: 160, max: 140 } }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `i${i}`, type: "work", durationSec: 60 }));
    expect(CardioPrescription.safeParse({ modality: "Run", intervals: many }).success).toBe(false);
  });

  test("an old prescription still parses", () => {
    expect(CardioPrescription.safeParse({ modality: "Bike", durationMin: 30, hrZone: 2 }).success).toBe(true);
  });
});

describe("ProgramWeeksWrite", () => {
  const doc = (cardio: unknown) => [
    { week: 1, sessions: [{ id: "s1", name: "Cardio 1", seq: 1, order: 0, kind: "cardio", cardio }] },
  ];

  test("rejects a cardio session with no workload; reads still accept it", () => {
    expect(ProgramWeeksWrite.safeParse(doc({ modality: "Run" })).success).toBe(false);
    expect(ProgramWeeksDocument.safeParse(doc({ modality: "Run" })).success).toBe(true);
    expect(ProgramWeeksWrite.safeParse(doc({ modality: "Run", durationMin: 30 })).success).toBe(true);
  });
});

describe("coerceCardio", () => {
  test("drops bad optional fields and invalid intervals instead of failing", () => {
    const rx = coerceCardio({
      modality: "Run",
      durationMin: 999,
      paceSecPerKm: 330,
      hrBpm: { min: 170, max: 150 },
      intervals: [
        { type: "work", repeat: 5, durationSec: 120, rpe: 42 },
        { id: "x", type: "sprint", durationSec: 30 },
        { id: "y", type: "cooldown", durationSec: 300, recovery: { durationSec: 60 } },
      ],
    });
    expect(rx).not.toBeNull();
    expect(rx!.durationMin).toBeUndefined();
    expect(rx!.paceSecPerKm).toBe(330);
    expect(rx!.hrBpm).toBeUndefined();
    expect(rx!.intervals).toHaveLength(2);
    expect(rx!.intervals![0]).toMatchObject({ id: "i1", type: "work", repeat: 5, durationSec: 120 });
    expect(rx!.intervals![0].rpe).toBeUndefined();
    expect(rx!.intervals![1].recovery).toBeUndefined();
  });

  test("a recovery keeps its time when its target is bad, and its good target crosses", () => {
    const rx = coerceCardio({
      modality: "Run",
      intervals: [
        { id: "a", type: "work", repeat: 3, durationSec: 300, recovery: { type: "active_recovery", durationSec: 60, hrZone: 9, paceSecPerKm: 420 } },
        { id: "b", type: "work", repeat: 3, durationSec: 300, recovery: { type: "jog", durationSec: 60, hrZone: 1 } },
      ],
    });
    expect(rx!.intervals![0].recovery).toEqual({ type: "active_recovery", durationSec: 60, paceSecPerKm: 420 });
    expect(rx!.intervals![1].recovery).toEqual({ type: "passive_recovery", durationSec: 60, hrZone: 1 });
  });

  test("a draft session with old or messy cardio still parses", () => {
    const old = DraftSession.safeParse({ name: "Cardio", kind: "cardio", cardio: { modality: "Bike", durationMin: 30, hrZone: 2 } });
    expect(old.success).toBe(true);
    const messy = DraftSession.safeParse({ name: "Cardio", kind: "cardio", cardio: { modality: "Run", intervals: "lots" } });
    expect(messy.success).toBe(true);
  });
});

describe("cardio logs", () => {
  test("sessionLoad: RPE 4 × 42:15 = 169 AU", () => {
    expect(sessionLoad({ durationSec: 42 * 60 + 15, rpe: 4 })).toBe(169);
    expect(sessionLoad({ durationMin: 30, rpe: 5 })).toBe(150); // old row: minutes × 60
    expect(sessionLoad({ durationSec: 1800 })).toBeNull();
    expect(sessionLoad({ durationSec: 1800, rpe: 5, skipped: { reason: "time" } })).toBeNull();
  });

  test("cardioPace: 35:10 over 5.2 km is 6:46/km; split and speed by metric", () => {
    const log = { durationSec: 35 * 60 + 10, distanceKm: 5.2 };
    expect(cardioPace(log, "pace")).toEqual({ metric: "pace", secPerKm: 6 * 60 + 46 });
    expect(cardioPace(log, "split")).toEqual({ metric: "split", secPer500m: 203 });
    expect(cardioPace(log, "speed")).toEqual({ metric: "speed", kmh: 8.9 });
    expect(cardioPace(log, "none")).toBeNull();
    expect(cardioPace({ durationSec: 600 }, "pace")).toBeNull();
    expect(cardioPace({ durationSec: 600, distanceKm: 0 }, "pace")).toBeNull();
  });

  test("an old minutes-only log reads as seconds", () => {
    expect(cardioLogSec({ durationMin: 40 })).toBe(2400);
    expect(cardioLogSec({ durationSec: 2410, durationMin: 40 })).toBe(2410);
    expect(cardioLogSec({})).toBeNull();
    expect(upgradeCardioLog<CardioLog>({ modality: "Run", durationMin: 40, hrZone: 3 })).toEqual({
      modality: "Run",
      durationMin: 40,
      durationSec: 2400,
      hrZone: 3,
    });
    expect(CardioLog.safeParse({ modality: "Run", durationMin: 40, hrZone: 3 }).success).toBe(true);
  });

  test("writes mirror durationMin (rounded, at least 1)", () => {
    expect(withDurationMin<CardioLog>({ modality: "Run", durationSec: 2535 })).toEqual({ modality: "Run", durationSec: 2535, durationMin: 42 });
    expect(withDurationMin<CardioLog>({ modality: "Run", durationSec: 20 }).durationMin).toBe(1);
    expect(withDurationMin({ durationMin: 30 })).toEqual({ durationMin: 30 });
  });

  test("write rule: completed needs duration and RPE; skipped needs only a reason", () => {
    expect(cardioLogIssues({ modality: "Run", durationSec: 1800, rpe: 6 })).toEqual([]);
    expect(cardioLogIssues({ modality: "Run", durationSec: 1800 })).toHaveLength(1);
    expect(cardioLogIssues({ modality: "Run" })).toHaveLength(2);
    expect(cardioLogIssues({ modality: "Run", skipped: { reason: "pain" } })).toEqual([]);
    expect(CardioLog.safeParse({ modality: "Run", skipped: { reason: "bored" } }).success).toBe(false);
  });

  test("max HR must be at least the average", () => {
    expect(CardioLog.safeParse({ modality: "Run", avgHr: 150, maxHr: 140 }).success).toBe(false);
    expect(CardioLog.safeParse({ modality: "Run", avgHr: 150, maxHr: 172 }).success).toBe(true);
  });

  test("interval results and pain parse", () => {
    const log = CardioLog.parse({
      modality: "Run",
      durationSec: 1980,
      rpe: 7,
      pain: { reported: true, note: "left calf" },
      intervals: [{ intervalId: "b", rep: 1, durationSec: 178, avgHr: 168, rpe: 8 }],
    });
    expect(log.intervals).toHaveLength(1);
    expect(isSkippedCardio(log)).toBe(false);
  });
});
