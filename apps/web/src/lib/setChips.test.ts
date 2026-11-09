import { describe, expect, test } from "bun:test";
import type { PrescribedSetDto } from "./api/types";
import { describeGroup, groupSets, restWords, rpeWords, spokenGroup } from "./setChips";

const set = (o: Partial<PrescribedSetDto>, n = 1): PrescribedSetDto =>
  ({ setNumber: n, type: "working", reps: 5, amrap: false, ...o }) as PrescribedSetDto;

describe("groupSets", () => {
  test("uniform sets collapse to one chip", () => {
    const g = groupSets([1, 2, 3].map((n) => set({ reps: 8, repsMin: 6, targetRpe: 7, restSeconds: 120 }, n)));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ count: 3, main: "6–8", rpe: "7", rest: "120s" });
  });

  test("a uniform RPE ramp reads as a progression, RIR stays hidden behind RPE", () => {
    const g = groupSets([
      set({ reps: 10, targetRpe: 7, targetRir: 3 }),
      set({ reps: 10, targetRpe: 7, targetRir: 3 }),
      set({ reps: 10, targetRpe: 8, targetRir: 2 }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ count: 3, rpe: "7→8", rir: null, maxRpe: 8 });
  });

  test("a top set and its back-offs become two runs, not one chip per set", () => {
    const g = groupSets([
      set({ reps: 3, targetRpe: 8, restSeconds: 180 }),
      set({ reps: 5, targetRpe: 7, restSeconds: 150, type: "backoff" }),
      set({ reps: 5, targetRpe: 7, restSeconds: 150, type: "backoff" }),
      set({ reps: 5, targetRpe: 7, restSeconds: 150, type: "backoff" }),
    ]);
    expect(g.map((x) => [x.count, x.main, x.rpe])).toEqual([
      [1, "3", "8"],
      [3, "5", "7"],
    ]);
  });

  test("only consecutive sets join a run", () => {
    const g = groupSets([set({ reps: 5, targetRpe: 7 }), set({ reps: 3, targetRpe: 8 }), set({ reps: 5, targetRpe: 7 })]);
    expect(g.map((x) => x.count)).toEqual([1, 1, 1]);
  });

  test("RIR shows only when a set has no RPE", () => {
    expect(groupSets([set({ targetRir: 2 })])[0]).toMatchObject({ rpe: null, rir: 2 });
  });

  test("load sits in its own fields, so sets×reps stays pure", () => {
    const [g] = groupSets([1, 2, 3].map((n) => set({ reps: 5, percent1rm: 75, targetRpe: 7 }, n)), 140);
    expect(g).toMatchObject({ count: 3, main: "5", kg: "105kg", pct: "75%" });
    const [noMax] = groupSets([set({ reps: 5, percent1rm: 75 })]);
    expect(noMax).toMatchObject({ main: "5", kg: null, pct: "75%" });
    const [kgOnly] = groupSets([set({ reps: 5, targetWeightKg: 100 })]);
    expect(kgOnly).toMatchObject({ main: "5", kg: "100kg", pct: null });
  });

  test("an AMRAP's stop RPE reads as effort, not inside the reps", () => {
    const [g] = groupSets([set({ reps: 8, amrap: true, stopRpe: 9 })]);
    expect(g).toMatchObject({ main: "8+ AMRAP", stop: 9, rpe: null });
    expect(describeGroup(g)).toBe("1 set × 8+ AMRAP · stop at RPE 9");
  });

  test("a heavier top set splits from back-offs by load", () => {
    const g = groupSets([
      set({ reps: 3, targetWeightKg: 120, targetRpe: 8 }),
      set({ reps: 3, targetWeightKg: 105, targetRpe: 8 }),
      set({ reps: 3, targetWeightKg: 105, targetRpe: 8 }),
    ]);
    expect(g.map((x) => [x.count, x.kg])).toEqual([
      [1, "120kg"],
      [2, "105kg"],
    ]);
    expect(describeGroup(g[1])).toBe("2 sets × 3 reps at 105kg · RPE 8");
  });

  test("no sets, no chips", () => {
    expect(groupSets([])).toEqual([]);
  });
});

describe("plain words", () => {
  test("rpeWords tells a ramp from a range", () => {
    expect(rpeWords("8")).toBe("RPE 8");
    expect(rpeWords("7–8")).toBe("RPE 7 to 8");
    expect(rpeWords("7→8")).toBe("RPE rising 7 to 8");
    expect(rpeWords("9→8")).toBe("RPE falling 9 to 8");
    expect(rpeWords("7/9/8")).toBe("RPE 7, 9, 8");
  });

  test("restWords speaks minutes", () => {
    expect(restWords("45s")).toBe("rest 45 sec");
    expect(restWords("90s")).toBe("rest 90 sec");
    expect(restWords("120s")).toBe("rest 2 min");
    expect(restWords("150s")).toBe("rest 2 min 30 sec");
  });

  test("describe and spoken forms", () => {
    const [g] = groupSets([1, 2, 3].map((n) => set({ reps: 10, repsMin: 8, targetRpe: n === 3 ? 8 : 7, tempo: "3-1-1-0", restSeconds: 90 }, n)));
    expect(describeGroup(g)).toBe("3 sets × 8 to 10 reps · RPE rising 7 to 8 · tempo 3-1-1-0 · rest 90 sec");
    expect(spokenGroup(g)).toBe("3 sets × 8 to 10 reps · RPE rising 7 to 8 · tempo 3 1 1 0 · rest 90 sec");
  });
});
