import { describe, expect, test } from "bun:test";
import type { PrescribedSetDto, ProgramDto } from "./api/types";
import { copyNotice, copyTargetLabel, currentWeekIndex, endedNote, matchNotice, isUniform, parseRange, patchAll, programSubline, setMode, snapshot, weekLine, weekRangeLabel, weekTabDates, withMode, withSetCount } from "./programEdit";

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

describe("snapshot", () => {
  test("ignores key order, so a saved program read back from jsonb is not dirty (F31)", () => {
    const edited = { weeks: [], phasing: { plannedWeeks: 2, phase: "acc", nextPhase: null, weeks: [{ week: 2, directive: "+volume" as const, target: { metric: "overall_volume" as const, deltaPercent: 6 } }] } };
    const fromDb = { weeks: [], phasing: { nextPhase: null, phase: "acc", plannedWeeks: 2, weeks: [{ week: 2, target: { deltaPercent: 6, metric: "overall_volume" as const }, directive: "+volume" as const }] } };
    expect(snapshot(edited)).toBe(snapshot(fromDb));
  });

  test("still sees a real change", () => {
    const a = { weeks: [], phasing: { plannedWeeks: 2, phase: "acc" } };
    expect(snapshot(a)).not.toBe(snapshot({ ...a, phasing: { ...a.phasing, phase: "int" } }));
  });
});

describe("copy this week to…", () => {
  test("menu rows list the weeks each group target covers", () => {
    expect(copyTargetLabel({ kind: "letter", letter: "B", weeks: [4, 6] })).toEqual({ label: "Every B week", hint: "W4, W6" });
    expect(copyTargetLabel({ kind: "all", weeks: [1, 3] })).toEqual({ label: "Every week", hint: "W1, W3" });
    expect(copyTargetLabel({ kind: "week", weeks: [5] })).toEqual({ label: "Week 5" });
  });

  test("notice names the copied weeks and the logged weeks it kept", () => {
    expect(copyNotice(2, [4, 6], [])).toBe("Copied W2 to W4, W6.");
    expect(copyNotice(2, [1, 3, 4], [1])).toBe("Copied W2 to W3, W4. W1 kept: has logs.");
    expect(copyNotice(2, [1, 3], [1, 3])).toBe("Nothing copied. W1, W3 kept: have logs.");
  });
});

describe("matchNotice", () => {
  test("names the letter and the weeks kept", () => {
    expect(matchNotice("A", { logged: [], deload: [] })).toBe("Every week now follows Week A.");
    expect(matchNotice("B", { logged: [1, 3], deload: [6] })).toBe("Every week now follows Week B. W1, W3 kept: have logs. W6 kept: deload week.");
  });
});

describe("weekTabDates", () => {
  const prog = (o: Partial<{ status: string; activatedAt: string | null }> = {}) => ({
    id: "p1",
    status: "active",
    activatedAt: "2026-11-10T09:00:00Z",
    createdAt: "2026-11-01T00:00:00Z",
    weeks: [1, 2, 3, 4].map((week) => ({ week })),
    ...o,
  });

  test("dates each week from the anchor and marks the current one", () => {
    const d = weekTabDates(prog(), [], "2026-11-19")!;
    expect(d.map((w) => [w.week, w.start, w.end, w.state])).toEqual([
      [1, "2026-11-10", "2026-11-16", "past"],
      [2, "2026-11-17", "2026-11-23", "now"],
      [3, "2026-11-24", "2026-11-30", "upcoming"],
      [4, "2026-12-01", "2026-12-07", "upcoming"],
    ]);
    expect(currentWeekIndex(d)).toBe(1);
  });

  test("a log before activation moves the anchor (same buckets as the logs)", () => {
    const d = weekTabDates(prog(), [{ programId: "p1", date: "2026-11-08" }, { programId: "other", date: "2026-11-01" }], "2026-11-19")!;
    expect(d[0].start).toBe("2026-11-08");
    expect(d[1].state).toBe("now");
  });

  test("drafts have no dates and open on week 1", () => {
    expect(weekTabDates(prog({ status: "draft", activatedAt: null }), [], "2026-11-19")).toBeNull();
    expect(currentWeekIndex(null)).toBe(0);
  });

  test("after the block every week is past and the page opens on the last", () => {
    const d = weekTabDates(prog({ status: "archived" }), [], "2027-02-01")!;
    expect(d.every((w) => w.state === "past")).toBe(true);
    expect(currentWeekIndex(d)).toBe(3);
    expect(weekLine(d)).toBe("Week 1 started Tue 10 Nov · ended");
  });

  test("labels", () => {
    const d = weekTabDates(prog(), [], "2026-11-19")!;
    expect(weekRangeLabel(d[1].start, d[1].end)).toBe("17–23 Nov");
    expect(weekRangeLabel(d[2].start, d[2].end)).toBe("24–30 Nov");
    expect(weekRangeLabel(d[3].start, d[3].end)).toBe("1–7 Dec");
    expect(weekRangeLabel("2026-11-28", "2026-12-04")).toBe("28 Nov–4 Dec");
    expect(weekLine(d)).toBe("Week 1 started Tue 10 Nov · now W2");
    expect(endedNote(d, 1, "Ann Lee")).toBe("W1 ended 16 Nov — Ann is in W2.");
    expect(endedNote(d, 2, "Ann Lee")).toBeNull();
    expect(endedNote(d, 1, null)).toBe("W1 ended 16 Nov — The client is in W2.");
  });

  test("a block that hasn't started yet", () => {
    const d = weekTabDates(prog({ activatedAt: "2026-11-23T00:00:00Z" }), [], "2026-11-19")!;
    expect(d.every((w) => w.state === "upcoming")).toBe(true);
    expect(currentWeekIndex(d)).toBe(0);
    expect(weekLine(d)).toBe("Week 1 starts Mon 23 Nov");
  });

  test("programSubline carries the week line", () => {
    const p = { version: 2, aiAssisted: false, createdFromProgramId: null } as unknown as ProgramDto;
    expect(programSubline(p, null, "Week 1 started Tue 10 Nov · now W2")).toBe("v2 · Week 1 started Tue 10 Nov · now W2");
  });
});
