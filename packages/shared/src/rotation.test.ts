import { describe, expect, test } from "bun:test";
import {
  basisWeek,
  copyWeekTargets,
  copyWeekTo,
  firstWeekOfLetter,
  isAlternating,
  ProgramWeek,
  ProgramWeeksDocument,
  rotationOfWeek,
  setAlternating,
  stampAlternating,
  stampWeeks,
  type ProgramSession,
} from "./index";

const session = (name: string, exerciseId: string, weekday: number | null = 1): ProgramSession => ({
  id: crypto.randomUUID(),
  name,
  seq: 1,
  weekday,
  order: 0,
  kind: "lifting",
  exercises: [
    {
      id: crypto.randomUUID(),
      exerciseId,
      exerciseName: exerciseId,
      order: 0,
      prescribedSets: [{ setNumber: 1, type: "working", amrap: false, reps: 5 }],
    },
  ],
});

const exIds = (w: ProgramWeek) => w.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));

describe("rotation tag", () => {
  test("ProgramWeek keeps an A/B letter and rejects others", () => {
    const w = { week: 1, rotation: "A", sessions: [session("S", "squat")] };
    expect(ProgramWeek.parse(w).rotation).toBe("A");
    expect(ProgramWeek.safeParse({ ...w, rotation: "C" }).success).toBe(false);
    expect("rotation" in ProgramWeek.parse({ week: 1, sessions: [session("S", "squat")] })).toBe(false);
  });

  test("rotationOfWeek: odd A, even B", () => {
    expect([1, 2, 3, 4, 5].map(rotationOfWeek)).toEqual(["A", "B", "A", "B", "A"]);
  });
});

describe("stampAlternating", () => {
  test("odd weeks from A, even from B, tagged, fresh ids, valid document", () => {
    const weeks = stampAlternating([session("A", "squat")], [session("B", "deadlift", 3)], 6);
    expect(weeks.map((w) => w.rotation)).toEqual(["A", "B", "A", "B", "A", "B"]);
    expect(weeks.map((w) => exIds(w)[0])).toEqual(["squat", "deadlift", "squat", "deadlift", "squat", "deadlift"]);
    expect(weeks[1].sessions[0].weekday).toBe(3);
    const ids = weeks.flatMap((w) => w.sessions.flatMap((s) => [s.id, ...s.exercises.map((e) => e.id)]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(true);
  });

  test("odd block lengths end on A", () => {
    const weeks = stampAlternating([session("A", "squat")], [session("B", "deadlift")], 3);
    expect(weeks.map((w) => w.rotation)).toEqual(["A", "B", "A"]);
  });

  test("stampWeeks stays untagged", () => {
    expect(isAlternating(stampWeeks([session("A", "squat")], 4))).toBe(false);
  });
});

describe("setAlternating", () => {
  test("tags odd A / even B, untag drops the key", () => {
    const weeks = stampWeeks([session("A", "squat")], 4);
    const on = setAlternating(weeks, true);
    expect(on.map((w) => w.rotation)).toEqual(["A", "B", "A", "B"]);
    expect(on[1].sessions).toBe(weeks[1].sessions);
    const off = setAlternating(on, false);
    expect(off.every((w) => !("rotation" in w))).toBe(true);
  });
});

describe("basisWeek / firstWeekOfLetter", () => {
  const ab = stampAlternating([session("A", "squat")], [session("B", "deadlift")], 6);
  const plain = stampWeeks([session("A", "squat")], 6);

  test("A/B: last earlier same-letter week; null for the first of each letter", () => {
    expect(basisWeek(ab, 1)).toBeNull();
    expect(basisWeek(ab, 2)).toBeNull();
    expect(basisWeek(ab, 3)).toBe(1);
    expect(basisWeek(ab, 6)).toBe(4);
    expect(basisWeek(ab, 6, (n) => n === 4)).toBe(2);
  });

  test("no letters: the week before", () => {
    expect(basisWeek(plain, 1)).toBeNull();
    expect(basisWeek(plain, 4)).toBe(3);
    expect(basisWeek(plain, 4, (n) => n === 3)).toBe(2);
  });

  test("firstWeekOfLetter", () => {
    expect(firstWeekOfLetter(ab, 5)).toBe(1);
    expect(firstWeekOfLetter(ab, 6)).toBe(2);
    expect(firstWeekOfLetter(plain, 6)).toBe(1);
  });
});

describe("copyWeekTargets", () => {
  test("A/B week: every same-letter week, every week, then each week", () => {
    const ab = stampAlternating([session("A", "squat")], [session("B", "deadlift")], 6);
    const t = copyWeekTargets(ab, 2);
    expect(t[0]).toEqual({ kind: "letter", letter: "B", weeks: [4, 6] });
    expect(t[1]).toEqual({ kind: "all", weeks: [1, 3, 4, 5, 6] });
    expect(t.slice(2).map((x) => x.weeks[0])).toEqual([1, 3, 4, 5, 6]);
  });

  test("no letters: no letter target", () => {
    const t = copyWeekTargets(stampWeeks([session("A", "squat")], 3), 1);
    expect(t.map((x) => x.kind)).toEqual(["all", "week", "week"]);
  });

  test("one-week block: nothing to copy to", () => {
    expect(copyWeekTargets(stampWeeks([session("A", "squat")], 1), 1)).toEqual([]);
  });
});

describe("copyWeekTo", () => {
  test("copies content with fresh ids, keeps target week number and letter", () => {
    const ab = stampAlternating([session("A", "squat")], [session("B", "deadlift")], 6);
    const edited: ProgramWeek[] = ab.map((w) => (w.week === 2 ? { ...w, sessions: [session("B2", "row", 5)] } : w));
    const { weeks, skipped } = copyWeekTo(edited, 2, [4, 6], () => false);
    expect(skipped).toEqual([]);
    expect(weeks.map((w) => exIds(w)[0])).toEqual(["squat", "row", "squat", "row", "squat", "row"]);
    expect(weeks.map((w) => w.rotation)).toEqual(["A", "B", "A", "B", "A", "B"]);
    expect(weeks[3].week).toBe(4);
    expect(weeks[3].sessions[0].weekday).toBe(5);
    expect(weeks[3].sessions[0].id).not.toBe(weeks[1].sessions[0].id);
    expect(weeks[3].sessions[0].exercises[0].id).not.toBe(weeks[1].sessions[0].exercises[0].id);
    expect(weeks[0]).toBe(edited[0]);
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(true);
  });

  test("skips logged weeks and lists them", () => {
    const plain = stampWeeks([session("A", "squat")], 4);
    const edited = plain.map((w) => (w.week === 1 ? { ...w, sessions: [session("A2", "bench")] } : w));
    const { weeks, skipped } = copyWeekTo(edited, 1, [2, 3, 4], (n) => n === 3);
    expect(skipped).toEqual([3]);
    expect(weeks.map((w) => exIds(w)[0])).toEqual(["bench", "bench", "squat", "bench"]);
    expect(weeks[2]).toBe(edited[2]);
    expect(weeks.every((w) => !("rotation" in w))).toBe(true);
  });

  test("ignores the source week as a target and unknown sources", () => {
    const plain = stampWeeks([session("A", "squat")], 2);
    expect(copyWeekTo(plain, 1, [1], () => false).weeks[0]).toBe(plain[0]);
    expect(copyWeekTo(plain, 9, [1, 2], () => false).weeks).toBe(plain);
  });
});
