import { describe, expect, test } from "bun:test";
import type { PrescribedSetDto, ProgramDto } from "./api/types";
import { isUniform, parseRange, patchAll, programSubline, setMode, withMode, withSetCount } from "./programEdit";

const set = (o: Partial<PrescribedSetDto> = {}): PrescribedSetDto => ({
  setNumber: 1,
  type: "working",
  reps: 5,
  amrap: false,
  targetRpe: 8,
  restSeconds: 180,
  ...o,
});

describe("isUniform", () => {
  test("ignores set numbers", () => {
    expect(isUniform([set(), set({ setNumber: 2 })])).toBe(true);
  });
  test("ignores null vs missing load", () => {
    expect(isUniform([set({ targetWeightKg: null }), set({ setNumber: 2 })])).toBe(true);
  });
  test("differs on RPE", () => {
    expect(isUniform([set(), set({ setNumber: 2, targetRpe: 9 })])).toBe(false);
  });
});

describe("withSetCount", () => {
  test("grows by copying the last set and renumbers", () => {
    const r = withSetCount([set({ reps: 3 })], 3);
    expect(r.map((s) => [s.setNumber, s.reps])).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
  test("shrinks from the end and clamps to 1", () => {
    expect(withSetCount([set(), set({ setNumber: 2 })], 0)).toHaveLength(1);
  });
});

describe("modes", () => {
  test("timed drops reps and keeps rest", () => {
    const r = withMode(set({ repsMin: 3 }), "timed");
    expect(setMode(r)).toBe("timed");
    expect(r).toMatchObject({ reps: 0, durationSeconds: 30, restSeconds: 180, repsMin: undefined });
  });
  test("back to reps restores a rep count", () => {
    const r = withMode(withMode(set(), "max"), "reps");
    expect(setMode(r)).toBe("reps");
    expect(r.reps).toBe(8);
  });
});

test("patchAll applies to every set", () => {
  expect(patchAll([set(), set({ setNumber: 2 })], (s) => ({ ...s, targetRpe: 7 })).map((s) => s.targetRpe)).toEqual([7, 7]);
});

test("parseRange reads single values and ranges", () => {
  expect(parseRange("8")).toEqual({ min: null, max: 8 });
  expect(parseRange("10-6")).toEqual({ min: 6, max: 10 });
  expect(parseRange("7–8")).toEqual({ min: 7, max: 8 });
  expect(parseRange("abc")).toBeNull();
});

test("subline never says draft", () => {
  const p = { version: 1, aiAssisted: true, createdFromProgramId: null } as unknown as ProgramDto;
  expect(programSubline(p, null)).toBe("v1 · AI-assisted");
});

import { loadCell, rpeCell, withLoad, withRir, withRpe, withTempo } from "./programEdit";

describe("prescription cells (F22)", () => {
  test("load takes kg or a %1RM; one replaces the other", () => {
    expect(withLoad(set({ targetWeightKg: 100 }), "75%")).toMatchObject({ percent1rm: 75, targetWeightKg: undefined });
    expect(withLoad(set({ percent1rm: 75 }), "102.5")).toMatchObject({ targetWeightKg: 102.5, percent1rm: undefined });
    expect(withLoad(set({ targetWeightKg: 100 }), "")).toMatchObject({ targetWeightKg: null, percent1rm: undefined });
    expect(withLoad(set({ targetWeightKg: 100 }), "abc").targetWeightKg).toBe(100);
    expect([loadCell(set({ percent1rm: 75 })), loadCell(set({ targetWeightKg: 80 })), loadCell(set())]).toEqual(["75%", "80", ""]);
  });

  test("RPE takes a single value or a range; on AMRAP it is the stop RPE", () => {
    expect(withRpe(set(), "7-8", "reps")).toMatchObject({ targetRpeMin: 7, targetRpe: 8 });
    expect(withRpe(set({ targetRpeMin: 7, targetRpe: 8 }), "9", "reps")).toMatchObject({ targetRpe: 9, targetRpeMin: undefined });
    expect(withRpe(set({ amrap: true, reps: 0 }), "9", "max")).toMatchObject({ stopRpe: 9, targetRpe: undefined });
    expect(rpeCell(set({ targetRpeMin: 7, targetRpe: 8 }), "reps")).toBe("7–8");
    expect(rpeCell(set({ amrap: true, reps: 0, stopRpe: 9 }), "max")).toBe("9");
  });

  test("switching to Max moves the RPE to the stop; switching back restores it", () => {
    const max = withMode(set({ targetRpe: 9 }), "max");
    expect([max.stopRpe, max.targetRpe]).toEqual([9, undefined]);
    const back = withMode(max, "reps");
    expect([back.targetRpe, back.stopRpe]).toEqual([9, undefined]);
  });

  test("tempo uppercases and drops invalid input; RIR clamps to 0–10", () => {
    expect(withTempo(set(), "3-1-x-0").tempo).toBe("3-1-X-0");
    expect(withTempo(set({ tempo: "31X0" }), "slow").tempo).toBe("31X0");
    expect(withTempo(set({ tempo: "31X0" }), "").tempo).toBeUndefined();
    expect(withRir(set(), "2").targetRir).toBe(2);
    expect(withRir(set({ targetRir: 2 }), "").targetRir).toBeUndefined();
    expect(withRir(set(), "14").targetRir).toBe(10);
  });
});
