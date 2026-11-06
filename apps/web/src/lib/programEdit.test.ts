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
