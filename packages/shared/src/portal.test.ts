import { describe, expect, test } from "bun:test";
import { lastComparable, lastSetsOf, portalCardio, portalWeekLabel, lastWeightsOf, portalLogEntry, PortalLogEntry } from "./portal";

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
        id: "log-1", clientId: "c1", programId: "p1", createdAt: new Date(), kind: "lifting", cardio: null, notes: "knee ok",
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
    expect(portalCardio({ unit: "minutes", value: 120 }, logs, WED)).toEqual({ unit: "minutes", target: 120, done: 90 });
    expect(portalCardio({ unit: "sessions", value: 3 }, logs.slice(0, 2), MON)).toEqual({ unit: "sessions", target: 3, done: 1 });
    expect(portalCardio(null, logs, WED)).toBeNull();
  });
});
