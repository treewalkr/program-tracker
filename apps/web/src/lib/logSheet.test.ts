import { describe, expect, test } from "bun:test";
import { isBlank, rowFilled, serverFieldErrors, toLoggedSet, validateRows, type SheetRow } from "./logSheet";

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  key: "pe1-1",
  exerciseId: "ex1",
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
