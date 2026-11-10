import { describe, expect, test } from "bun:test";
import {
  cellOrder,
  extrasHoldValues,
  fillDown,
  markTyped,
  nextCell,
  rowsToSave,
  sheetCounts,
  setSkipReason,
  skipExercise,
  skippedExercises,
  swapSlot,
  unskipExercise,
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

const squat = (): SheetRow[] => [
  row({ key: "a1", setNumber: 1 }),
  row({ key: "a2", setNumber: 2 }),
  row({ key: "a3", setNumber: 3 }),
  row({ key: "a4", setNumber: 4, type: "backoff" }),
  row({ key: "b1", programExerciseId: "pe2", exerciseId: "ex2", slotExerciseId: "ex2" }),
];

describe("fillDown", () => {
  test("copies a committed kg into the later blank sets, marked as copies", () => {
    const rows = squat();
    rows[0].weight = 70;
    const out = fillDown(rows, "a1", "weight");
    expect(out.map((r) => r.weight)).toEqual([70, 70, 70, "", ""]);
    expect(out[1].copied).toEqual(["weight"]);
    expect(out[0].copied).toBeUndefined();
  });

  test("skips back-off sets, unless the source is a back-off", () => {
    const rows = squat();
    rows[0].weight = 100;
    expect(fillDown(rows, "a1", "weight")[3].weight).toBe("");
    const bo = [...squat(), row({ key: "a5", setNumber: 5, type: "backoff" })];
    bo[3].weight = 80;
    expect(fillDown(bo, "a4", "weight")[5].weight).toBe(80);
  });

  test("never overwrites a typed cell, but refreshes earlier copies", () => {
    let rows = squat();
    rows[0].weight = 70;
    rows = fillDown(rows, "a1", "weight");
    rows[2] = markTyped({ ...rows[2], weight: 72.5 }, "weight");
    rows[0] = { ...rows[0], weight: 75 };
    rows = fillDown(rows, "a1", "weight");
    expect(rows.map((r) => r.weight)).toEqual([75, 75, 72.5, "", ""]);
    expect(rows[2].copied).toEqual([]);
  });

  test("stops at the exercise boundary and skips skipped and extra sets", () => {
    const rows = [
      row({ key: "a1", weight: 60 }),
      row({ key: "a2", setNumber: 2, skipped: true }),
      row({ key: "a3", setNumber: 3, extra: true, prescribedReps: null }),
      row({ key: "b1", programExerciseId: "pe2" }),
    ];
    expect(fillDown(rows, "a1", "weight").map((r) => r.weight)).toEqual([60, "", "", ""]);
  });

  test("a blank source copies nothing", () => {
    const rows = squat();
    expect(fillDown(rows, "a1", "weight")).toBe(rows);
    rows[0].weight = null;
    expect(fillDown(rows, "a1", "weight")).toBe(rows);
  });

  test("a swap drops the copy mark with the load", () => {
    const rows = fillDown([row({ key: "a1", weight: 50 }), row({ key: "a2", setNumber: 2 })], "a1", "weight");
    expect(swapSlot(rows, "pe1", "ex9")[1].copied).toEqual([]);
  });

  test("a filled-down load alone is not a logged set", () => {
    const rows = fillDown(
      [row({ key: "a1", weight: 70, reps: 5 }), row({ key: "a2", setNumber: 2 }), row({ key: "a3", setNumber: 3 })],
      "a1",
      "weight"
    );
    expect(rowsToSave(rows).map((r) => r.key)).toEqual(["a1"]);
    expect(sheetCounts(rows)).toMatchObject({ logged: 1, open: 2 });
    rows[1] = { ...rows[1], reps: 5 };
    expect(rowsToSave(rows).map((r) => [r.key, r.weight])).toEqual([["a1", 70], ["a2", 70]]);
  });
});

describe("cellOrder / nextCell", () => {
  const bw = (id: string) => id === "ex-bw";
  const rows = [
    row({ key: "a1" }),
    row({ key: "a2", setNumber: 2, skipped: true }),
    row({ key: "a3", setNumber: 3, extra: true }),
    row({ key: "b1", programExerciseId: "pe2", exerciseId: "ex-bw" }),
    row({ key: "b2", programExerciseId: "pe2", exerciseId: "ex-bw", setNumber: 2 }),
  ];
  const order = cellOrder(rows, bw);

  test("walks kg → reps → RPE, leaving out skipped rows", () => {
    expect(nextCell(order, "a1", "weight", 1)).toMatchObject({ key: "a1", field: "reps" });
    expect(nextCell(order, "a1", "rpe", 1)).toMatchObject({ key: "a3", field: "weight" });
    expect(order.some((c) => c.key === "a2")).toBe(false);
  });

  test("extra sets are in the walk; bodyweight rows have no kg stop", () => {
    expect(nextCell(order, "a3", "rpe", 1)).toEqual({ key: "b1", field: "reps", programExerciseId: "pe2" });
    expect(order.filter((c) => c.key === "b1").map((c) => c.field)).toEqual(["reps", "rpe"]);
    expect(nextCell(order, "b1", "rpe", 1)).toMatchObject({ key: "b2", field: "reps" });
  });

  test("crosses the exercise boundary both ways and ends at either edge", () => {
    expect(nextCell(order, "b1", "reps", -1)).toMatchObject({ key: "a3", field: "rpe", programExerciseId: "pe1" });
    expect(nextCell(order, "b2", "rpe", 1)).toBeNull();
    expect(nextCell(order, "a1", "weight", -1)).toBeNull();
  });

  test("from a cell outside the walk, moves to the row's listed cells", () => {
    expect(nextCell(order, "b1", "weight", 1)).toMatchObject({ key: "b1", field: "reps" });
    expect(nextCell(order, "b1", "weight", -1)).toMatchObject({ key: "a3", field: "rpe" });
    expect(nextCell(order, "zz", "reps", 1)).toBeNull();
  });
});

describe("skip a whole exercise", () => {
  const rows = [
    row({ key: "a1", weight: 60 }),
    row({ key: "a2", setNumber: 2, skipped: true }),
    row({ key: "ax", setNumber: 3, extra: true, reps: 8 }),
    row({ key: "b1", programExerciseId: "pe2", exerciseId: "ex2" }),
  ];

  test("skips every prescribed set and drops the extras", () => {
    expect(extrasHoldValues(rows, "pe1")).toBe(true);
    expect(extrasHoldValues(rows, "pe2")).toBe(false);
    const out = skipExercise(rows, "pe1");
    expect(out.map((r) => r.key)).toEqual(["a1", "a2", "b1"]);
    expect(out.slice(0, 2).every((r) => r.skipped && r.exerciseSkip)).toBe(true);
    expect(out[0].weight).toBe(60);
    expect(out[2].skipped).toBeUndefined();
  });

  test("records a reason and lists skipped exercises", () => {
    const out = setSkipReason(skipExercise(rows, "pe1"), "pe1", "pain");
    expect(skippedExercises(out)).toEqual([{ programExerciseId: "pe1", exerciseId: "ex1", reason: "pain" }]);
    expect(setSkipReason(rows, "pe1", "pain")).toEqual(rows);
  });

  test("undo restores the rows exactly, or un-skips without a snapshot", () => {
    const skipped = skipExercise(rows, "pe1");
    expect(unskipExercise(skipped, "pe1", rows.slice(0, 3))).toEqual(rows);
    const plain = unskipExercise(skipped, "pe1");
    expect(plain.map((r) => r.skipped)).toEqual([false, false, undefined]);
    expect(plain.every((r) => !r.exerciseSkip)).toBe(true);
  });
});
