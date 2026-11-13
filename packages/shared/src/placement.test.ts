import { describe, expect, test } from "bun:test";
import {
  ProgramWeek,
  addSession,
  applyPlacementToAllWeeks,
  migrateLegacyWeek,
  placeSession,
  sessionsByWeekday,
  switchSessionKind,
  nextSeq,
  type ProgramSession,
} from "./domain";
import { cardioLoad, placeSessions, placeWeeks, placementConflicts, sessionFocus } from "./placement";

const set = { setNumber: 1, type: "working" as const, reps: 5, amrap: false };
const ex = (id: string) => ({ id: `e-${id}-${Math.random()}`, exerciseId: id, order: 0, prescribedSets: [set] });
const lift = (seq: number, ids: string[]): ProgramSession => ({
  id: `L${seq}`,
  name: `Session ${seq}`,
  seq,
  order: 0,
  kind: "lifting",
  exercises: ids.map(ex),
  cardio: null,
});
const cardio = (seq: number): ProgramSession => ({
  id: `C${seq}`,
  name: `Cardio ${seq}`,
  seq,
  order: 0,
  kind: "cardio",
  exercises: [],
  cardio: { modality: "Bike", durationMin: 30, hrZone: 2 },
});
const patterns: Record<string, string> = { squat: "knee_dominant", dl: "hip_dominant", bench: "horizontal_push", row: "horizontal_pull" };
const patternOf = (id: string) => patterns[id];
const dayOf = (out: ProgramSession[], id: string) => out.find((s) => s.id === id)?.weekday;

describe("sessionFocus", () => {
  test("reads lower, upper, full from patterns", () => {
    expect(sessionFocus(lift(1, ["squat", "dl"]), patternOf)).toBe("lower");
    expect(sessionFocus(lift(1, ["bench", "row"]), patternOf)).toBe("upper");
    expect(sessionFocus(lift(1, ["squat", "bench"]), patternOf)).toBe("full");
    expect(sessionFocus(lift(1, ["mystery"]), patternOf)).toBe("none");
  });
});

describe("placeSessions", () => {
  test("no training days leaves everything unscheduled", () => {
    const out = placeSessions([lift(1, ["squat"]), cardio(1)], []);
    expect(out.every((s) => s.weekday === null)).toBe(true);
  });

  test("spreads lifting across the available days, Session 1 first", () => {
    const out = placeSessions([lift(1, ["squat"]), lift(2, ["bench"]), lift(3, ["dl"])], [1, 3, 5]);
    expect([1, 2, 3].map((n) => dayOf(out, `L${n}`))).toEqual([1, 3, 5]);
  });

  test("keeps two lower sessions off back-to-back days", () => {
    const out = placeSessions(
      [lift(1, ["squat", "dl"]), lift(2, ["squat", "dl"]), lift(3, ["bench", "row"]), lift(4, ["bench", "row"])],
      [1, 2, 4, 5],
      patternOf
    );
    const lower = [dayOf(out, "L1")!, dayOf(out, "L2")!];
    expect(Math.abs(lower[0] - lower[1])).toBeGreaterThan(1);
  });

  test("cardio goes to a training day without lifting first", () => {
    const out = placeSessions([lift(1, ["squat"]), lift(2, ["bench"]), cardio(1)], [1, 3, 5], patternOf);
    expect(dayOf(out, "C1")).toBe(3);
  });

  test("more sessions than days stack, lifting before cardio within the day", () => {
    const out = placeSessions([lift(1, ["squat"]), lift(2, ["bench"]), cardio(1)], [2, 4], patternOf);
    const byDay = sessionsByWeekday(out);
    expect(out.every((s) => s.weekday != null)).toBe(true);
    const stacked = [...byDay.values()].find((l) => l.length === 2)!;
    expect(stacked.map((s) => s.kind)).toEqual(["lifting", "cardio"]);
    expect(stacked.map((s) => s.order)).toEqual([0, 1]);
  });

  test("result validates as a week", () => {
    const out = placeSessions([lift(1, ["squat"]), lift(2, ["bench"]), cardio(1), cardio(2)], [1, 4], patternOf);
    expect(ProgramWeek.safeParse({ week: 1, sessions: out }).success).toBe(true);
  });
});

describe("placeWeeks", () => {
  test("every week gets week 1's placement by session key", () => {
    const wk = (n: number) => ({ week: n, sessions: [lift(1, ["squat"]), lift(2, ["bench"])].map((s) => ({ ...s, id: `${s.id}-w${n}` })) });
    const weeks = placeWeeks([wk(1), wk(2)], [2, 5], patternOf);
    expect(weeks[1].sessions.map((s) => s.weekday)).toEqual(weeks[0].sessions.map((s) => s.weekday));
  });

  test("A/B weeks: each letter's first week is placed and its letter's weeks follow it", () => {
    const wk = (n: number, sessions: ProgramSession[]) => ({
      week: n,
      rotation: n % 2 ? ("A" as const) : ("B" as const),
      sessions: sessions.map((s) => ({ ...s, id: `${s.id}-w${n}`, weekday: 7 })),
    });
    const a = () => [lift(1, ["squat"]), lift(2, ["bench"])];
    const b = () => [lift(1, ["deadlift"])];
    const weeks = placeWeeks([wk(1, a()), wk(2, b()), wk(3, a()), wk(4, b())], [2, 5], patternOf);
    const days = (i: number) => weeks[i].sessions.map((s) => s.weekday);
    expect(days(0)).not.toContain(7);
    expect(days(1)).not.toContain(7);
    expect(days(2)).toEqual(days(0));
    expect(days(3)).toEqual(days(1));
  });
});

describe("placement editing", () => {
  const week = () => ({ week: 1, sessions: [{ ...lift(1, ["squat"]), weekday: 1 }, { ...lift(2, ["bench"]), weekday: 3 }, { ...cardio(1), weekday: null }] });

  test("placeSession stacks onto a day at an index and compacts the old day", () => {
    const w = placeSession(week(), "L2", 1, 0);
    const mon = sessionsByWeekday(w.sessions).get(1)!;
    expect(mon.map((s) => [s.id, s.order])).toEqual([["L2", 0], ["L1", 1]]);
    expect(sessionsByWeekday(w.sessions).get(3)).toEqual([]);
  });

  test("placeSession to null unschedules without touching content", () => {
    const before = week();
    const w = placeSession(before, "L1", null, 9);
    const moved = w.sessions.find((s) => s.id === "L1")!;
    expect(moved.weekday).toBeNull();
    expect(moved.exercises).toEqual(before.sessions[0].exercises);
  });

  test("applyPlacementToAllWeeks on A/B weeks only reaches the same letter", () => {
    const tag = (w: ReturnType<typeof week>, n: number) => ({ ...w, week: n, rotation: n % 2 ? ("A" as const) : ("B" as const) });
    const w2 = { ...tag(week(), 2), sessions: week().sessions.map((s) => ({ ...s, weekday: 7 })) };
    const w3 = { ...tag(week(), 3), sessions: week().sessions.map((s) => ({ ...s, weekday: 6 })) };
    const out = applyPlacementToAllWeeks([tag(week(), 1), w2, w3], 1);
    expect(out[1]).toBe(w2);
    expect(out[2].sessions.map((s) => s.weekday)).toEqual([1, 3, null]);
  });

  test("applyPlacementToAllWeeks copies by key, not id", () => {
    const w2 = { week: 2, sessions: week().sessions.map((s) => ({ ...s, id: `${s.id}b`, weekday: 7 })) };
    const [, out] = applyPlacementToAllWeeks([week(), w2], 1);
    expect(out.sessions.map((s) => s.weekday)).toEqual([1, 3, null]);
  });

  test("addSession numbers per track and never reuses a gap", () => {
    let w = { week: 1, sessions: [lift(1, ["squat"]), lift(3, ["bench"])] };
    w = addSession(w, "lifting", 2);
    w = addSession(w, "cardio");
    expect(w.sessions.slice(2).map((s) => [s.kind, s.seq, s.weekday])).toEqual([["lifting", 4, 2], ["cardio", 1, null]]);
  });

  test("switching kind takes the next seq on the new track", () => {
    const w = week();
    const s = switchSessionKind(w.sessions[1], "cardio", nextSeq(w.sessions, "cardio"));
    expect([s.kind, s.seq, s.exercises.length]).toEqual(["cardio", 2, 0]);
  });
});

describe("migrateLegacyWeek", () => {
  test("Day N → Session N on its weekday, ids kept, stacked days keep order", () => {
    const legacy = {
      week: 1,
      days: [
        { id: "d2", day: 2, weekday: null, sessions: [{ ...lift(9, ["bench"]), id: "b", order: 0 }] },
        {
          id: "d1",
          day: 1,
          weekday: 2,
          sessions: [{ ...lift(9, ["squat"]), id: "a", order: 0 }, { ...cardio(9), id: "c", order: 1 }],
        },
      ],
    };
    const w = migrateLegacyWeek(legacy);
    expect(w.sessions.map((s) => [s.id, s.kind, s.seq, s.weekday, s.order])).toEqual([
      ["a", "lifting", 1, 2, 0],
      ["c", "cardio", 1, 2, 1],
      ["b", "lifting", 2, null, 0],
    ]);
    expect("days" in w).toBe(false);
    expect(ProgramWeek.safeParse(w).success).toBe(true);
  });

  test("flat weeks pass through", () => {
    const flat = { week: 1, sessions: [lift(1, ["squat"])] };
    expect(migrateLegacyWeek(flat)).toBe(flat);
  });
});

// ---- concurrent training (F03, F26) ----

const run = (seq: number, name: string, durationMin: number, hrZone: number, intensity?: string): ProgramSession => ({
  id: `C${seq}`,
  name,
  seq,
  order: 0,
  kind: "cardio",
  exercises: [],
  cardio: { modality: "Run", durationMin, hrZone, ...(intensity ? { intensity } : {}) },
});

/** Priya: 2 lifting days (heavy lower + full body), 4 runs, Sunday long run. */
const priya = () => [
  { ...lift(1, ["squat", "dl"]), name: "Lower — heavy squat" },
  { ...lift(2, ["squat", "dl", "bench", "row"]), name: "Full body" },
  run(1, "Easy run", 40, 2),
  run(2, "Tempo run", 30, 3, "tempo"),
  run(3, "Easy run", 35, 2),
  run(4, "Long run", 80, 2),
];
const priyaDays = { trainingDays: [1, 2, 4, 5], cardioDays: [2, 3, 5, 7], longRunDay: 7 };

describe("cardioLoad", () => {
  test("long by duration or name, hard by zone or intensity, else easy", () => {
    expect(cardioLoad(run(1, "Long run", 80, 2))).toBe("long");
    expect(cardioLoad(run(1, "Sunday long", 50, 2))).toBe("long");
    expect(cardioLoad(run(1, "Tempo run", 30, 3))).toBe("hard");
    expect(cardioLoad(run(1, "Run", 30, 3, "threshold"))).toBe("hard");
    expect(cardioLoad(run(1, "Hills", 30, 4))).toBe("hard");
    expect(cardioLoad(run(1, "Easy run", 40, 2))).toBe("easy");
    expect(cardioLoad(lift(1, ["squat"]))).toBeNull();
  });
});

describe("placeSessions — Priya's concurrent week", () => {
  const out = placeSessions(priya(), priyaDays, patternOf);

  test("heavy lower is never Monday (the day after the Sunday long run)", () => {
    expect(dayOf(out, "L1")).not.toBe(1);
  });

  test("tempo and long run are on different days", () => {
    expect(dayOf(out, "C2")).not.toBe(dayOf(out, "C4"));
  });

  test("the easy runs are on different days", () => {
    expect(dayOf(out, "C1")).not.toBe(dayOf(out, "C3"));
  });

  test("Sunday is used: the long run sits on the long-run day", () => {
    expect(dayOf(out, "C4")).toBe(7);
  });

  test("heavy lower is neither the day after nor the day before a key run", () => {
    const lower = dayOf(out, "L1")!;
    for (const k of [dayOf(out, "C2")!, dayOf(out, "C4")!]) {
      expect((lower - k + 7) % 7).not.toBe(1);
      expect((k - lower + 7) % 7).toBeGreaterThan(1);
    }
  });

  test("the result breaks no placement rule", () => {
    expect(placementConflicts(out, priyaDays, patternOf)).toEqual([]);
  });

  test("everything is scheduled and lifting stays on lifting days", () => {
    expect(out.every((s) => s.weekday != null)).toBe(true);
    expect(priyaDays.trainingDays).toContain(dayOf(out, "L1")!);
    expect(priyaDays.trainingDays).toContain(dayOf(out, "L2")!);
  });

  test("lays the week out: Tue lower + easy, Wed easy, Thu full body, Fri tempo, Sun long", () => {
    expect(["L1", "L2", "C1", "C2", "C3", "C4"].map((id) => dayOf(out, id))).toEqual([2, 4, 3, 5, 2, 7]);
  });
});

describe("placeSessions — key runs", () => {
  test("two key runs never share a day when there is another day", () => {
    const out = placeSessions([run(1, "Tempo", 30, 3, "tempo"), run(2, "Intervals", 30, 5)], { trainingDays: [2], cardioDays: [4] });
    expect(dayOf(out, "C1")).not.toBe(dayOf(out, "C2"));
  });

  test("heavy lower is not placed the day after a hard run", () => {
    const out = placeSessions([lift(1, ["squat", "dl"]), run(1, "Intervals", 30, 5)], { trainingDays: [3, 5], cardioDays: [2, 4] }, patternOf);
    const gap = (dayOf(out, "L1")! - dayOf(out, "C1")! + 7) % 7;
    expect(gap).not.toBe(1);
  });

  test("cardio may use cardioDays beyond the lifting days", () => {
    const out = placeSessions([lift(1, ["squat"]), run(1, "Easy", 30, 2)], { trainingDays: [1], cardioDays: [6] }, patternOf);
    expect(dayOf(out, "C1")).toBe(6);
  });

  test("lifting never goes on a cardio-only day", () => {
    const out = placeSessions([lift(1, ["squat"]), lift(2, ["bench"])], { trainingDays: [1], cardioDays: [3, 5] }, patternOf);
    expect(out.map((s) => s.weekday)).toEqual([1, 1]);
  });
});

describe("placeSessions — AI weekdays", () => {
  test("keeps AI weekdays that pass the rules", () => {
    const ai = priya().map((s, i) => ({ ...s, weekday: [2, 4, 3, 5, 2, 7][i] }));
    const out = placeSessions(ai, priyaDays, patternOf, { keepWeekdays: true });
    expect(out.map((s) => [s.id, s.weekday])).toEqual(ai.map((s) => [s.id, s.weekday]));
  });

  test("re-places the AI weekdays that break a rule and keeps the rest", () => {
    // Heavy lower on Monday (day after the long run) and tempo stacked on the long run.
    const ai = priya().map((s, i) => ({ ...s, weekday: [1, 4, 3, 7, 2, 7][i] }));
    const out = placeSessions(ai, priyaDays, patternOf, { keepWeekdays: true });
    expect(dayOf(out, "L1")).not.toBe(1);
    expect(dayOf(out, "C2")).not.toBe(7);
    expect([dayOf(out, "L2"), dayOf(out, "C1"), dayOf(out, "C3"), dayOf(out, "C4")]).toEqual([4, 3, 2, 7]);
    expect(placementConflicts(out, priyaDays, patternOf)).toEqual([]);
  });

  test("without keepWeekdays the given weekdays are ignored", () => {
    const ai = priya().map((s) => ({ ...s, weekday: 6 }));
    const out = placeSessions(ai, priyaDays, patternOf);
    expect(out.some((s) => s.weekday === 6)).toBe(false);
  });
});

describe("placementConflicts", () => {
  test("names each broken rule", () => {
    const week = priya().map((s, i) => ({ ...s, weekday: [6, 4, 3, 5, 3, 5][i] }));
    const rules = placementConflicts(week, priyaDays, patternOf).map((c) => c.rule);
    expect([...new Set(rules)].sort()).toEqual(["key-runs-same-day", "long-run-day", "lower-after-key", "off-day"]);
  });

  test("unscheduled sessions conflict with nothing", () => {
    expect(placementConflicts(priya(), priyaDays, patternOf)).toEqual([]);
  });
});
