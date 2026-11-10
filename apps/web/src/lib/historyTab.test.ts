import { describe, expect, test } from "bun:test";
import type { ProgramDto, SessionLogDto } from "./api/types";
import { liftProgress, mondayOf, rangeStart, sessionsByWeek, timedSetTest, weekLabel } from "./historyTab";

const program: ProgramDto = {
  id: "p1",
  clientId: "c1",
  name: "Week 11",
  description: null,
  status: "archived",
  version: 1,
  aiAssisted: false,
  createdFromProgramId: null,
  createdAt: "2026-10-19T00:00:00.000Z",
  weeks: [
    {
      week: 1,
      sessions: [
        {
          id: "s1",
          name: "Upper",
          seq: 1,
          order: 0,
          weekday: 1,
          kind: "lifting",
          exercises: [
            { id: "e-bench", exerciseId: "bench", role: "primary", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
            { id: "e-row", exerciseId: "row", role: "accessory", order: 1, prescribedSets: [{ setNumber: 1, type: "working", reps: 8, amrap: false }] },
            {
              id: "e-plank",
              exerciseId: "plank",
              order: 2,
              prescribedSets: [{ setNumber: 1, type: "working", reps: 0, amrap: false, durationSeconds: 45 }],
            },
          ],
        },
        { id: "s2", name: "", seq: 2, order: 0, weekday: 3, kind: "lifting", exercises: [] },
      ],
    },
  ],
};

let n = 0;
const log = (over: Partial<SessionLogDto>): SessionLogDto => ({
  id: `l${++n}`,
  clientId: "c1",
  programId: "p1",
  programSessionId: null,
  date: "2026-10-19",
  kind: "lifting",
  notes: null,
  perceivedEnergy: null,
  readiness: null,
  flags: null,
  sets: [],
  ...over,
});
const set = (exerciseId: string, weightKg: number | null, reps: number, setNumber = 1, programExerciseId: string | null = null) => ({
  exerciseId,
  weightKg,
  reps,
  setNumber,
  type: "working" as const,
  programExerciseId,
});
const names: Record<string, string> = { bench: "Bench Press", row: "Bent-over Row", plank: "Plank", curl: "Curl" };
const nameOf = (id: string) => names[id] ?? "Unknown";

describe("rangeStart", () => {
  test("8 weeks counts today as day 56", () => {
    expect(rangeStart("8w", "2026-11-09")).toBe("2026-09-15");
  });
  test("6 months goes back 182 days", () => {
    expect(rangeStart("6m", "2026-11-09")).toBe("2026-05-11");
  });
  test("all has no start", () => {
    expect(rangeStart("all", "2026-11-09")).toBeNull();
  });
});

describe("liftProgress", () => {
  test("main lifts first, then the most recently trained", () => {
    const logs = [
      log({ date: "2026-10-19", sets: [set("bench", 45, 5)] }),
      log({ date: "2026-10-26", sets: [set("row", 60, 8)] }),
      log({ date: "2026-10-28", sets: [set("curl", 12, 10)] }),
    ];
    expect(liftProgress(logs, [program], nameOf).map((r) => r.exerciseId)).toEqual(["bench", "curl", "row"]);
    expect(liftProgress(logs, [program], nameOf)[0].main).toBe(true);
  });

  test("recent sets are the newest six by date, whatever the log order", () => {
    const logs = [
      log({ date: "2026-10-28", sets: [set("bench", 50, 5, 1), set("bench", 50, 5, 2)] }),
      log({ date: "2026-10-19", sets: [set("bench", 40, 5, 1), set("bench", 45, 5, 2), set("bench", 45, 5, 3)] }),
      log({ date: "2026-10-22", sets: [set("bench", 47.5, 5, 1), set("bench", 47.5, 4, 2)] }),
    ];
    const [bench] = liftProgress(logs, [program], nameOf);
    expect(bench.recentSets.map((s) => s.label)).toEqual([
      "45 kg × 5",
      "45 kg × 5",
      "47.5 kg × 5",
      "47.5 kg × 4",
      "50 kg × 5",
      "50 kg × 5",
    ]);
    expect(bench.recentSets[0].date).toBe("2026-10-19");
    expect(bench.lastDate).toBe("2026-10-28");
  });

  test("series is the best e1RM per day, oldest first", () => {
    const logs = [
      log({ date: "2026-10-22", sets: [set("bench", 50, 5)] }),
      log({ date: "2026-10-19", sets: [set("bench", 45, 5), set("bench", 40, 10, 2)] }),
      log({ date: "2026-10-22", sets: [set("bench", 40, 3)] }),
    ];
    const [bench] = liftProgress(logs, [program], nameOf);
    expect(bench.series).toEqual([
      { date: "2026-10-19", value: 53.3 },
      { date: "2026-10-22", value: 58.3 },
    ]);
    expect(bench.bestE1rm).toBe(58.3);
    expect(bench.unit).toBe("kg");
  });

  test("bodyweight-only lifts have no e1RM or series", () => {
    const [row] = liftProgress([log({ sets: [set("row", null, 12)] })], [program], nameOf);
    expect(row.bestE1rm).toBeNull();
    expect(row.series).toEqual([]);
    expect(row.recentSets[0].label).toBe("BW × 12");
  });

  test("timed holds: no e1RM, the series is the longest hold per day in seconds", () => {
    const logs = [
      log({ date: "2026-10-19", sets: [set("plank", null, 40), set("plank", null, 45, 2)] }),
      log({ date: "2026-10-22", sets: [set("plank", 10, 50)] }),
    ];
    const [plank] = liftProgress(logs, [program], nameOf);
    expect(plank.timed).toBe(true);
    expect(plank.bestE1rm).toBeNull();
    expect(plank.unit).toBe("s");
    expect(plank.series).toEqual([
      { date: "2026-10-19", value: 45 },
      { date: "2026-10-22", value: 50 },
    ]);
    expect(plank.recentSets.map((s) => s.label)).toEqual(["40 s", "45 s", "10 kg · 50 s"]);
  });

  test("a swap logged against a timed slot counts as timed", () => {
    const isTimed = timedSetTest([program]);
    expect(isTimed({ exerciseId: "curl", programExerciseId: "e-plank" })).toBe(true);
    expect(isTimed({ exerciseId: "curl", programExerciseId: "e-row" })).toBe(false);
    expect(isTimed({ exerciseId: "plank", programExerciseId: null })).toBe(true);
  });
});

describe("sessionsByWeek", () => {
  test("Monday starts a new week; newest week and session first", () => {
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(mondayOf("2026-10-26")).toBe("2026-10-26"); // Monday
    const logs = [
      log({ date: "2026-10-25", sets: [set("bench", 45, 5)] }),
      log({ date: "2026-10-26", sets: [set("bench", 50, 5)] }),
      log({ date: "2026-10-19", sets: [set("bench", 40, 5)] }),
    ];
    const weeks = sessionsByWeek(logs, [program], nameOf);
    expect(weeks.map((w) => [w.label, w.sessions.map((s) => s.date)])).toEqual([
      ["Week of 26 Oct", ["2026-10-26"]],
      ["Week of 19 Oct", ["2026-10-25", "2026-10-19"]],
    ]);
    expect(weekLabel("2026-10-19")).toBe("Week of 19 Oct");
  });

  test("session names come from the program weeks; sets grouped per exercise", () => {
    const [week] = sessionsByWeek(
      [
        log({
          programSessionId: "s1",
          notes: "felt strong",
          sets: [set("row", 70, 5, 2), set("bench", 45, 5, 1), set("row", 60, 5, 1), set("plank", null, 45, 3)],
        }),
        log({ programSessionId: "s2", date: "2026-10-21", sets: [set("bench", 45, 5)] }),
      ],
      [program],
      nameOf,
    );
    const [wed, mon] = week.sessions;
    expect(wed.name).toBe("Session 2");
    expect(mon).toMatchObject({
      name: "Upper",
      dateLabel: "Mon 19 Oct",
      programId: "p1",
      programName: "Week 11",
      setCount: 4,
      notes: "felt strong",
      cardio: null,
    });
    expect(mon.exercises).toEqual([
      { exerciseId: "bench", name: "Bench Press", sets: ["45 kg × 5"] },
      { exerciseId: "row", name: "Bent-over Row", sets: ["60 kg × 5", "70 kg × 5"] },
      { exerciseId: "plank", name: "Plank", sets: ["45 s"] },
    ]);
  });

  test("each row carries its readiness and flags; old logs have none", () => {
    const [week] = sessionsByWeek(
      [
        log({
          perceivedEnergy: 6,
          readiness: { sleep: 2, soreness: 4 },
          flags: [
            { programExerciseId: null, exerciseId: "bench", kind: "pain", note: "shoulder" },
            { programExerciseId: null, exerciseId: "row", kind: "skipped", reason: "time" },
          ],
          sets: [set("bench", 45, 5)],
        }),
        log({ date: "2026-10-20", sets: [set("bench", 45, 5)] }),
      ],
      [program],
      nameOf,
    );
    const [plain, flagged] = week.sessions;
    expect(flagged.readiness).toBe("Energy 6/10 · Sleep 2/5 · Soreness 4/5");
    expect(flagged.flags.map((f) => [f.text, f.note])).toEqual([
      ["Pain · Bench Press", "shoulder"],
      ["Skipped · Bent-over Row · time", null],
    ]);
    expect(flagged.pain).toBe(true);
    expect(plain).toMatchObject({ readiness: null, flags: [], pain: false });
  });

  test("freestyle and cardio rows", () => {
    const [week] = sessionsByWeek(
      [
        log({ programSessionId: "gone", sets: [set("curl", 12, 10)] }),
        log({
          date: "2026-10-20",
          kind: "cardio",
          cardio: { modality: "Run", durationMin: 35, hrZone: 2, distanceKm: 5.5 },
        }),
      ],
      [program],
      nameOf,
    );
    const [run, free] = week.sessions;
    expect(free.name).toBe("Freestyle");
    expect(run.name).toBe("Run");
    expect(run.cardio).toBe("Run · 35 min · Z2 · 5.5 km");
    expect(run.setCount).toBe(0);
  });
});
