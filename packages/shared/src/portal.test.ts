import { describe, expect, test } from "bun:test";
import { localDateOf } from "./metrics";
import { lastComparable, lastSetsOf, nowOfDate, portalCardio, portalToday, portalWeekLabel, lastWeightsOf, portalLogEntry, PortalLogEntry, portalCardioRx, latestLogBySession, portalSessions, sessionDateIn } from "./portal";
import { computeHrZones, profileOn } from "./hr";

describe("lastWeightsOf", () => {
  test("newest log wins per exercise and set; the exercise key holds its latest load; no-kg sets are ignored", () => {
    const w = lastWeightsOf([
      { date: "2026-11-10", sets: [{ exerciseId: "a", setNumber: 1, weightKg: "60.00" }, { exerciseId: "a", setNumber: 2, weightKg: 62.5 }] },
      { date: "2026-11-03", sets: [{ exerciseId: "a", setNumber: 1, weightKg: 50 }, { exerciseId: "a", setNumber: 3, weightKg: 55 }] },
      { date: "2026-11-12", sets: [{ exerciseId: "a", setNumber: 1, weightKg: null }, { exerciseId: "b", setNumber: 1, weightKg: 0 }] },
    ]);
    expect(w.get("a#1")).toBe(60);
    expect(w.get("a#2")).toBe(62.5);
    expect(w.get("a#3")).toBe(55);
    expect(w.get("a")).toBe(62.5);
    expect(w.has("b")).toBe(false);
  });
});

describe("portalLogEntry", () => {
  test("picks the client's own entry by name: numbers parsed, ids and timestamps dropped", () => {
    const EX = "6f1c2c1e-6b1a-4c55-9a51-0d6f1f5c9a10";
    const entry = portalLogEntry(
      {
        id: "log-1", clientId: "c1", programId: "p1", createdAt: new Date(), kind: "exercises", cardio: null, notes: "knee ok",
        perceivedEnergy: 6, readiness: { sleep: 2 }, flags: [{ programExerciseId: null, exerciseId: EX, kind: "pain", note: "knee" }],
      } as never,
      [{ id: "s1", sessionLogId: "log-1", programExerciseId: "pe1", exerciseId: EX, setNumber: 1, type: "working", weightKg: "62.50", reps: 8, rpe: null, asPlanned: true, createdAt: new Date() }] as never,
    );
    expect(entry).toEqual({
      sets: [{ programExerciseId: "pe1", exerciseId: EX, setNumber: 1, type: "working", weightKg: 62.5, reps: 8, rpe: null, asPlanned: true }],
      cardio: null,
      notes: "knee ok",
      perceivedEnergy: 6,
      readiness: { sleep: 2 },
      flags: [{ programExerciseId: null, exerciseId: EX, kind: "pain", note: "knee" }],
      trainerFeedback: null,
      reviewedAt: null,
    });
    expect(PortalLogEntry.parse(entry)).toEqual(entry);
  });
});

describe("lastComparableSets (the 'Last:' line)", () => {
  const log = (date: string, sets: [string, number | null, number, number | null][]) => ({
    date,
    sets: sets.map(([exerciseId, weightKg, reps, rpe], i) => ({ exerciseId, setNumber: i + 1, weightKg, reps, rpe })),
  });
  const logs = [
    log("2026-11-02", [["sq", 100, 5, 8]]),
    log("2026-11-09", [["sq", 60, 8, 7], ["sq", 62.5, 8, 8], ["sq", 50, 15, null], ["bench", 80, 3, 9]]),
    log("2026-11-16", [["sq", 120, 2, 9]]),
  ];
  const last = lastSetsOf(logs, "2026-11-16");

  test("the newest earlier session's heaviest set in a comparable rep range", () => {
    expect(lastComparable(last, "sq", { min: 6, max: 8 })).toEqual({ date: "2026-11-09", weightKg: 62.5, reps: 8, rpe: 8 });
  });

  test("a different rep range is not comparable: an older session can be, else nothing", () => {
    expect(lastComparable(last, "sq", { min: 3, max: 5 })).toEqual({ date: "2026-11-02", weightKg: 100, reps: 5, rpe: 8 });
    expect(lastComparable(last, "sq", { min: 30, max: 30 })).toBeNull();
    expect(lastComparable(last, "deadlift", { min: 5, max: 5 })).toBeNull();
  });

  test("logs on or after the cutoff (this week) are not 'last time'", () => {
    expect(lastComparable(lastSetsOf(logs, "2026-11-20"), "sq", { min: 1, max: 2 })).toEqual({ date: "2026-11-16", weightKg: 120, reps: 2, rpe: 9 });
    expect(lastComparable(last, "sq", { min: 1, max: 2 })).toBeNull();
  });
});

describe("portalWeekLabel", () => {
  const phasing = { phase: "Hypertrophy", plannedWeeks: 4, weeks: [{ week: 3, directive: "deload" }, { week: 4, directive: "test" }, { week: 2, directive: "+volume" }] } as never;
  test("deload and test weeks get a client-safe label; anything else, or no phasing, none", () => {
    expect(portalWeekLabel(phasing, 3)).toBe("deload");
    expect(portalWeekLabel(phasing, 4)).toBe("test");
    expect(portalWeekLabel(phasing, 2)).toBeNull();
    expect(portalWeekLabel(null, 3)).toBeNull();
  });
});

describe("portalCardio", () => {
  const MON = new Date(2026, 10, 16, 12).getTime(); // Monday
  const WED = new Date(2026, 10, 18, 12).getTime();
  const run = (date: string, min: number) => ({ date, kind: "cardio", cardio: { modality: "Run", durationMin: min, hrZone: 2 } });
  test("this ISO week's cardio against the coach's weekly target, the same count the coach's signal uses", () => {
    const logs = [run("2026-11-15", 60), run("2026-11-16", 30), run("2026-11-18", 60)];
    expect(portalCardio({ unit: "minutes", value: 120 }, logs, WED)).toEqual({ unit: "minutes", target: 120, done: 90, sessions: 2, minutes: 90 });
    expect(portalCardio({ unit: "sessions", value: 3 }, logs.slice(0, 2), MON)).toEqual({ unit: "sessions", target: 3, done: 1, sessions: 1, minutes: 30 });
    expect(portalCardio(null, logs, WED)).toBeNull();
  });
});

describe("the client's today (time zones)", () => {
  const NOW = new Date(2026, 10, 17, 3).getTime(); // 03:00 local on 17 Nov
  test("the client's own date counts within a day either way of the server's", () => {
    expect(portalToday(undefined, NOW)).toBe("2026-11-17");
    expect(portalToday("2026-11-18", NOW)).toBe("2026-11-18");
    expect(portalToday("2026-11-16", NOW)).toBe("2026-11-16");
    expect(portalToday("2026-11-19", NOW)).toBeNull();
    expect(portalToday("nonsense", NOW)).toBeNull();
  });
  test("a date's clock time lands on that date locally, so the week math reads the client's day", () => {
    expect(localDateOf(nowOfDate("2026-11-18"))).toBe("2026-11-18");
  });
});

describe("portalCardioRx", () => {
  const zones = [1, 2, 3, 4, 5].map((zone) => ({ zone, min: 100 + zone * 12, max: 111 + zone * 12 }));

  test("intervals and bpm cross; zone bands resolve, the coach's own band wins; library ids stay home", () => {
    const rx = portalCardioRx(
      {
        modality: "Running",
        hrZone: 2,
        modalityId: "secret-modality",
        templateId: "secret-template",
        intervals: [
          { id: "w", type: "warmup", repeat: 1, durationSec: 600, hrZone: 1 },
          { id: "r", type: "work", repeat: 4, durationSec: 180, hrZone: 4, hrBpm: { min: 160, max: 170 }, recovery: { type: "active_recovery", durationSec: 120 } },
        ],
      },
      zones
    );
    expect(rx.hrBpm).toEqual({ min: 124, max: 135 });
    expect(rx.intervals![0].hrBpm).toEqual({ min: 112, max: 123 });
    expect(rx.intervals![1].hrBpm).toEqual({ min: 160, max: 170 });
    expect(rx.intervals![1].recovery).toEqual({ type: "active_recovery", durationSec: 120, distanceM: undefined });
    expect(JSON.stringify(rx)).not.toContain("secret");
    expect(portalCardioRx({ modality: "Bike", hrZone: 2 }, null).hrBpm).toBeUndefined();
    // a recovery's own target crosses, its zone resolved to bpm
    const jog = portalCardioRx(
      { modality: "Running", intervals: [{ id: "r", type: "work", repeat: 3, durationSec: 300, recovery: { type: "active_recovery", durationSec: 60, hrZone: 1, paceSecPerKm: 420 } }] },
      zones
    );
    expect(jog.intervals![0].recovery).toMatchObject({ hrZone: 1, hrBpm: { min: 112, max: 123 }, paceSecPerKm: 420 });
  });
});

describe("latestLogBySession", () => {
  test("a skipped cardio log carries skipped; a done one doesn't", () => {
    const m = latestLogBySession([
      { id: "a", programSessionId: "s1", date: "2026-11-18", loggedBy: "client" as const, cardio: { modality: "Running", skipped: { reason: "time" } } },
      { id: "b", programSessionId: "s2", date: "2026-11-18", loggedBy: "client" as const, cardio: { modality: "Running", durationSec: 600 } },
      { id: "c", programSessionId: "s3", date: "2026-11-18", loggedBy: "trainer" as const, cardio: null },
    ]);
    expect(m.get("s1")).toEqual({ id: "a", loggedBy: "client", date: "2026-11-18", skipped: true });
    expect(m.get("s2")).toEqual({ id: "b", loggedBy: "client", date: "2026-11-18" });
    expect(m.get("s3")).toEqual({ id: "c", loggedBy: "trainer", date: "2026-11-18" });
  });
});

describe("sessionDateIn", () => {
  test("a weekday lands inside a block week that starts mid-week; any day is the start", () => {
    // 2026-11-25 is a Wednesday
    expect(sessionDateIn("2026-11-25", 3)).toBe("2026-11-25");
    expect(sessionDateIn("2026-11-25", 1)).toBe("2026-11-30");
    expect(sessionDateIn("2026-11-25", 7)).toBe("2026-11-29");
    expect(sessionDateIn("2026-11-25", null)).toBe("2026-11-25");
  });

  test("a profile effective 30 Nov reaches the Monday session of the week that starts 25 Nov, not the Wednesday one", () => {
    const old = computeHrZones("hrmax", { maxHr: 190 })!;
    const next = computeHrZones("hrmax", { maxHr: 200 })!;
    const versions = [
      { version: 1, effectiveFrom: "2026-10-01", zones: old },
      { version: 2, effectiveFrom: "2026-11-30", zones: next },
    ];
    const zonesFor = (wd: number | null) => profileOn(versions, sessionDateIn("2026-11-25", wd))?.zones ?? null;
    const run = (weekday: number) => ({ id: `s${weekday}`, name: "Run", seq: weekday, order: 0, kind: "cardio" as const, weekday, exercises: [], cardio: { modality: "Running", durationMin: 40, hrZone: 2 } });
    const out = portalSessions([run(3), run(1)], null, () => null, { hrZonesFor: zonesFor });
    expect(out.find((s) => s.weekday === 3)?.cardio?.hrBpm).toEqual({ min: old[1].min, max: old[1].max });
    expect(out.find((s) => s.weekday === 1)?.cardio?.hrBpm).toEqual({ min: next[1].min, max: next[1].max });
  });
});
