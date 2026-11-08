import { describe, expect, test } from "bun:test";
import {
  asPrescribed,
  blocksOf,
  isBlank,
  isSwapped,
  lastBySlot,
  rowFilled,
  rowLabels,
  rowsToSave,
  serverFieldErrors,
  sheetCounts,
  slotIds,
  slotSwaps,
  stepCell,
  swapSlot,
  toLoggedSet,
  validateRows,
  withExtraSet,
  withoutExtra,
  type SheetRow,
} from "./logSheet";

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  key: "pe1-1",
  exerciseId: "ex1",
  slotExerciseId: "ex1",
  programExerciseId: "pe1",
  setNumber: 1,
  type: "working",
  prescribedReps: 5,
  weight: "",
  reps: "",
  rpe: "",
  ...over,
});

describe("isBlank", () => {
  test("number-input binds yield null/undefined when cleared", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank("0")).toBe(false);
  });
});

describe("toLoggedSet", () => {
  test("an explicit 0 reps stays 0 — a missed set is not the prescription", () => {
    expect(toLoggedSet(row({ reps: 0, weight: 100 })).reps).toBe(0);
    expect(toLoggedSet(row({ reps: "0", weight: 100 })).reps).toBe(0);
  });

  test("blank reps with a weight falls back to the prescription", () => {
    expect(toLoggedSet(row({ reps: "", weight: 100 })).reps).toBe(5);
    expect(toLoggedSet(row({ reps: null, weight: 100 })).reps).toBe(5);
  });

  test("cleared RPE and kg are omitted, not sent as 0", () => {
    const s = toLoggedSet(row({ reps: 5, weight: null, rpe: null }));
    expect(s.rpe).toBeUndefined();
    expect(s.weightKg).toBeUndefined();
  });

  test("numbers pass through", () => {
    const s = toLoggedSet(row({ reps: 3, weight: 102.5, rpe: 8.5 }));
    expect(s).toMatchObject({ reps: 3, weightKg: 102.5, rpe: 8.5, setNumber: 1, type: "working" });
  });
});

describe("rowFilled", () => {
  test("cleared cells count as empty", () => {
    expect(rowFilled(row({ reps: null, weight: null }))).toBe(false);
    expect(rowFilled(row({ reps: 0 }))).toBe(true);
    expect(rowFilled(row({ weight: 60 }))).toBe(true);
  });
});

describe("validateRows", () => {
  test("flags each bad cell by row key and field", () => {
    const errs = validateRows([
      row({ key: "a", reps: 5, rpe: 0 }),
      row({ key: "b", reps: -1, weight: 700 }),
      row({ key: "c", reps: 2.5 }),
      row({ key: "d", reps: 5, rpe: 8 }),
    ]);
    expect(errs.a?.rpe).toBe("RPE is 1–10");
    expect(errs.b?.reps).toBe("Reps 0–200");
    expect(errs.b?.weight).toBe("kg 0–600");
    expect(errs.c?.reps).toBe("Whole reps only");
    expect(errs.d).toBeUndefined();
  });

  test("a set with no prescription needs its reps entered", () => {
    const errs = validateRows([row({ key: "x", prescribedReps: null, weight: 60 }), row({ key: "y", weight: 60 })]);
    expect(errs.x?.reps).toBe("Enter reps");
    expect(errs.y).toBeUndefined();
  });

  test("skipped rows are not validated", () => {
    expect(validateRows([row({ key: "s", reps: -4, skipped: true })])).toEqual({});
  });
});

describe("serverFieldErrors", () => {
  test("maps a 422 treeified issue onto the submitted row", () => {
    const rows = [row({ key: "a" }), row({ key: "b" })];
    const issues = {
      errors: [],
      properties: {
        sets: { errors: [], items: [null, { errors: [], properties: { rpe: { errors: ["Too small: expected number to be >=1"] } } }] },
      },
    };
    expect(serverFieldErrors(issues, rows)).toEqual({ b: { rpe: "RPE is 1–10" } });
  });

  test("ignores shapes it does not understand", () => {
    expect(serverFieldErrors(undefined, [row()])).toEqual({});
    expect(serverFieldErrors({ errors: ["x"] }, [row()])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Skip / extra / swap, as-prescribed, last-by-slot, labels (F10 F14 F33 F34)
// ---------------------------------------------------------------------------

const prog = {
  weeks: [1, 2].map((week) => ({
    week,
    sessions: [
      {
        id: `s1-w${week}`,
        kind: "lifting" as const,
        seq: 1,
        exercises: [
          { id: `w${week}-dl`, exerciseId: "dl", order: 0 },
          { id: `w${week}-bench-top`, exerciseId: "bench", order: 1 },
          { id: `w${week}-bench-bo`, exerciseId: "bench", order: 2 },
        ],
      },
      {
        id: `s2-w${week}`,
        kind: "lifting" as const,
        seq: 2,
        exercises: [{ id: `w${week}-dl-s2`, exerciseId: "dl", order: 0 }],
      },
    ],
  })),
};

const set = (programExerciseId: string, exerciseId: string, setNumber: number, weightKg: number | null, reps: number) => ({
  programExerciseId,
  exerciseId,
  setNumber,
  weightKg,
  reps,
  rpe: null,
});

describe("slotIds", () => {
  test("the same slot keeps its id across weeks; repeated exercises get an occurrence", () => {
    const ids = slotIds(prog);
    expect(ids.get("w1-dl")).toBe(ids.get("w2-dl"));
    expect(ids.get("w1-bench-top")).not.toBe(ids.get("w1-bench-bo"));
    expect(ids.get("w1-bench-bo")).toBe(ids.get("w2-bench-bo"));
    expect(ids.get("w1-dl")).not.toBe(ids.get("w1-dl-s2"));
  });
});

describe("lastBySlot (F34)", () => {
  test("last is the latest log of the same session slot and set, never another session", () => {
    const logs = [
      { date: "2026-10-27", sets: [set("w1-dl", "dl", 1, 180, 3)] },
      { date: "2026-11-01", sets: [set("w1-dl-s2", "dl", 1, 192.5, 2)] },
    ];
    const last = lastBySlot(prog, logs);
    const ids = slotIds(prog);
    expect(last.get(`${ids.get("w2-dl")}#1`)).toMatchObject({ date: "2026-10-27", weightKg: 180, reps: 3 });
    expect(last.get(`${ids.get("w2-dl-s2")}#1`)?.weightKg).toBe(192.5);
  });

  test("newest log wins regardless of input order; swapped sets don't count", () => {
    const logs = [
      { date: "2026-11-03", sets: [set("w2-bench-top", "bench", 1, 107.5, 3)] },
      { date: "2026-10-27", sets: [set("w1-bench-top", "bench", 1, 100, 3)] },
      { date: "2026-11-05", sets: [set("w2-bench-top", "db-press", 1, 40, 8)] },
    ];
    const last = lastBySlot(prog, logs);
    expect(last.get(`${slotIds(prog).get("w1-bench-top")}#1`)?.weightKg).toBe(107.5);
  });
});

describe("asPrescribed (F14)", () => {
  const base = { reps: 5, amrap: false };
  test("load = target, else last load of the same slot, else empty", () => {
    expect(asPrescribed({ ...base, targetWeightKg: 100 }, { bodyweight: false, swapped: false, last: null }).weight).toBe(100);
    const last = { date: "x", weightKg: 90, reps: 5, rpe: null };
    expect(asPrescribed(base, { bodyweight: false, swapped: false, last }).weight).toBe(90);
    expect(asPrescribed(base, { bodyweight: false, swapped: false, last: null }).weight).toBeNull();
  });

  test("bodyweight stays bodyweight even if a plate was used last time", () => {
    const last = { date: "x", weightKg: 10, reps: 45, rpe: null };
    const out = asPrescribed({ reps: 0, amrap: false, durationSeconds: 45 }, { bodyweight: true, swapped: false, last });
    expect(out).toEqual({ weight: null, reps: 45, rpe: null });
  });

  test("a weighted bodyweight move with a prescribed load still gets it", () => {
    expect(asPrescribed({ ...base, targetWeightKg: 10 }, { bodyweight: true, swapped: false, last: null }).weight).toBe(10);
  });

  test("a swapped exercise never inherits the original's load", () => {
    const last = { date: "x", weightKg: 150, reps: 3, rpe: null };
    const out = asPrescribed({ ...base, targetWeightKg: 150, targetRpe: 8 }, { bodyweight: false, swapped: true, last });
    expect(out).toEqual({ weight: null, reps: 5, rpe: 8 });
  });

  test("rep ranges log the bottom; AMRAP to failure has no reps to assume", () => {
    expect(asPrescribed({ reps: 6, repsMin: 4, amrap: false }, { bodyweight: false, swapped: false, last: null }).reps).toBe(4);
    expect(asPrescribed({ reps: 0, amrap: true }, { bodyweight: false, swapped: false, last: null }).reps).toBeNull();
    expect(asPrescribed({ reps: 8, amrap: true }, { bodyweight: false, swapped: false, last: null }).reps).toBe(8);
  });

  test("an extra set has no prescription", () => {
    expect(asPrescribed(null, { bodyweight: false, swapped: false, last: null })).toEqual({ weight: null, reps: null, rpe: null });
  });
});

describe("skip (F10)", () => {
  test("skipped rows are never sent, even when filled", () => {
    const rows = [row({ key: "a", reps: 5 }), row({ key: "b", reps: 5, skipped: true }), row({ key: "c" })];
    expect(rowsToSave(rows).map((r) => r.key)).toEqual(["a"]);
    expect(sheetCounts(rows)).toEqual({ logged: 1, skipped: 1, open: 1, total: 3 });
  });
});

describe("extra sets", () => {
  const slot = (key: string, pe: string, n: number, over: Partial<SheetRow> = {}) =>
    row({ key, programExerciseId: pe, setNumber: n, ...over });
  const make = (pe: string, n: number) => slot(`${pe}-x${n}`, pe, n, { extra: true, prescribedReps: null });

  test("appends after the slot's last row with the next set number", () => {
    const rows = [slot("a1", "a", 1), slot("a2", "a", 2), slot("b1", "b", 1)];
    const out = withExtraSet(rows, "a", (n) => make("a", n));
    expect(out.map((r) => `${r.key}:${r.setNumber}`)).toEqual(["a1:1", "a2:2", "a-x3:3", "b1:1"]);
  });

  test("stops at 20 sets", () => {
    const rows = Array.from({ length: 20 }, (_, i) => slot(`a${i + 1}`, "a", i + 1));
    expect(withExtraSet(rows, "a", (n) => make("a", n))).toBe(rows);
  });

  test("removing an extra renumbers the extras after it", () => {
    let rows = [slot("a1", "a", 1)];
    rows = withExtraSet(rows, "a", (n) => make("a", n));
    rows = withExtraSet(rows, "a", (n) => make("a", n));
    const out = withoutExtra(rows, "a-x2");
    expect(out.map((r) => r.setNumber)).toEqual([1, 2]);
  });
});

describe("swapSlot", () => {
  test("re-points every row of the slot and clears loads; picking the original undoes it", () => {
    const rows = [
      row({ key: "a1", programExerciseId: "a", exerciseId: "squat", slotExerciseId: "squat", weight: 150, reps: 3 }),
      row({ key: "b1", programExerciseId: "b", exerciseId: "bench", slotExerciseId: "bench", weight: 100 }),
    ];
    const out = swapSlot(rows, "a", "front-squat");
    expect(out[0]).toMatchObject({ exerciseId: "front-squat", weight: null, reps: 3 });
    expect(out[1]).toBe(rows[1]);
    expect(isSwapped(out[0])).toBe(true);
    expect(isSwapped(swapSlot(out, "a", "squat")[0])).toBe(false);
  });
});

describe("rowLabels (F33)", () => {
  test("every label is unique and names the set type", () => {
    const rows = [
      row({ key: "t1", programExerciseId: "top", exerciseId: "bench", setNumber: 1 }),
      row({ key: "b1", programExerciseId: "bo", exerciseId: "bench", setNumber: 1, type: "backoff" }),
      row({ key: "b2", programExerciseId: "bo", exerciseId: "bench", setNumber: 2, type: "backoff" }),
      row({ key: "x1", programExerciseId: "a1", exerciseId: "row", setNumber: 1 }),
      row({ key: "x2", programExerciseId: "a2", exerciseId: "row", setNumber: 1 }),
      row({ key: "e3", programExerciseId: "top", exerciseId: "bench", setNumber: 2, extra: true }),
    ];
    const labels = rowLabels(rows, (id) => ({ bench: "Bench", row: "Row" })[id] ?? id);
    expect(labels.get("t1")).toBe("Bench set 1");
    expect(labels.get("b2")).toBe("Bench back-off set 2");
    expect(labels.get("e3")).toBe("Bench extra set 2");
    expect(labels.get("x1")).toBe("Row set 1 (1st)");
    expect(labels.get("x2")).toBe("Row set 1 (2nd)");
    expect(new Set(labels.values()).size).toBe(rows.length);
  });
});

describe("stepCell", () => {
  test("steps from the value, or from the target when blank; clamps and keeps halves exact", () => {
    expect(stepCell(100, 2.5, { min: 0, max: 600 })).toBe(102.5);
    expect(stepCell("", 2.5, { min: 0, max: 600, from: 150 })).toBe(152.5);
    expect(stepCell(null, -1, { min: 0, max: 200 })).toBe(0);
    expect(stepCell(9.5, 0.5, { min: 1, max: 10 })).toBe(10);
    expect(stepCell(10, 0.5, { min: 1, max: 10 })).toBe(10);
    expect(stepCell(0.1, 0.2, { min: 0, max: 600 })).toBe(0.3);
    expect(stepCell("junk", 1, { min: 0, max: 200, from: 5 })).toBe(6);
  });
});

describe("blocksOf", () => {
  test("groups rows by slot in sheet order", () => {
    const rows = [row({ key: "a1", programExerciseId: "a" }), row({ key: "a2", programExerciseId: "a" }), row({ key: "b1", programExerciseId: "b" })];
    expect(blocksOf(rows).map((b) => [b.programExerciseId, b.rows.length])).toEqual([["a", 2], ["b", 1]]);
  });
});

describe("slotSwaps (history)", () => {
  test("lists each swapped slot once per log, newest first", () => {
    const logs = [
      { date: "2026-11-01", sets: [set("w1-dl", "rdl", 1, 100, 5), set("w1-dl", "rdl", 2, 100, 5)] },
      { date: "2026-11-05", sets: [set("w2-bench-top", "db-press", 1, 40, 8), set("w2-dl", "dl", 1, 180, 3)] },
    ];
    expect(slotSwaps(prog, logs)).toEqual([
      { date: "2026-11-05", fromExerciseId: "bench", toExerciseId: "db-press", sets: 1 },
      { date: "2026-11-01", fromExerciseId: "dl", toExerciseId: "rdl", sets: 2 },
    ]);
  });
});
