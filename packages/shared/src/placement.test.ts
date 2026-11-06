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
import { placeSessions, placeWeeks, sessionFocus } from "./placement";

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
