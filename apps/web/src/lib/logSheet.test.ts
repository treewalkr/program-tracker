import { describe, expect, test } from "bun:test";
import {
  asPrescribed,
  prescriptionOf,
  blocksOf,
  blockIndexOf,
  cellOrder,
  nextCell,
  roundOrder,
  skipExercise,
  unskipExercise,
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
  loggedBySession,
  prescribedSummary,
  isDirty,
  draftJson,
  draftKey,
  parseDraft,
  type SheetRow,
} from "./logSheet";
import { EMPTY_READINESS } from "./logFlags";

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

describe("prescriptionOf (F22)", () => {
  const ctx = { bodyweight: false, swapped: false, last: { date: "x", weightKg: 95, reps: 5, rpe: null } };

  test("a %1RM set logs its resolved kg", () => {
    const rx = prescriptionOf({ setNumber: 1, type: "working", reps: 5, amrap: false, percent1rm: 75 }, 140);
    expect(rx.targetWeightKg).toBe(105);
    expect(asPrescribed(rx, ctx).weight).toBe(105);
  });

  test("without the 1RM a %1RM set falls back like any unloaded set (the slot's last load)", () => {
    const rx = prescriptionOf({ setNumber: 1, type: "working", reps: 5, amrap: false, percent1rm: 75 }, null);
    expect(asPrescribed(rx, ctx).weight).toBe(95);
  });

  test("AMRAP logs its stop RPE; RIR alone logs as 10 − RIR", () => {
    expect(prescriptionOf({ setNumber: 1, type: "working", reps: 0, amrap: true, stopRpe: 9 }, null).targetRpe).toBe(9);
    expect(prescriptionOf({ setNumber: 1, type: "working", reps: 5, amrap: false, targetRir: 2 }, null).targetRpe).toBe(8);
    expect(prescriptionOf({ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpeMin: 7, targetRpe: 8 }, null).targetRpe).toBe(8);
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

describe("loggedBySession", () => {
  const log = (id: string, programSessionId: string | null, date: string, sets = 3, programId = "pg1") => ({
    id,
    programId,
    programSessionId,
    date,
    sets: Array.from({ length: sets }, () => ({})),
  });

  test("groups one program's logs by session, newest first", () => {
    const m = loggedBySession(
      [log("a", "s1", "2026-11-02", 14), log("b", "s1", "2026-11-07T10:00:00.000Z", 12), log("c", "s2", "2026-11-03")],
      "pg1"
    );
    expect(m.get("s1")).toEqual([
      { id: "b", date: "2026-11-07", setCount: 12 },
      { id: "a", date: "2026-11-02", setCount: 14 },
    ]);
    expect(m.get("s2")?.map((l) => l.id)).toEqual(["c"]);
  });

  test("ad-hoc logs and other programs are left out", () => {
    const m = loggedBySession([log("a", null, "2026-11-02"), log("b", "s1", "2026-11-02", 3, "pg2")], "pg1");
    expect(m.size).toBe(0);
  });
});

describe("prescribedSummary", () => {
  const bw = (id: string) => id === "pushup";

  test("counts the sets a save sends", () => {
    const s = prescribedSummary(
      [row({ key: "a", weight: 100, reps: 5 }), row({ key: "b", weight: 100, reps: 5, skipped: true })],
      bw
    );
    expect(s).toEqual({ sets: 1, missingLoad: [], missingLoadSets: 0, openAmrap: 0 });
  });

  test("lists cards whose sets would log no kg, once each, in sheet order", () => {
    const s = prescribedSummary(
      [
        row({ key: "a1", programExerciseId: "squat", reps: 5 }),
        row({ key: "a2", programExerciseId: "squat", reps: 5 }),
        row({ key: "b1", programExerciseId: "hack", reps: 8 }),
        row({ key: "c1", programExerciseId: "rdl", reps: 8, weight: 80 }),
      ],
      bw
    );
    expect(s.missingLoad).toEqual(["squat", "hack"]);
    expect(s.missingLoadSets).toBe(3);
    expect(s.sets).toBe(4);
  });

  test("bodyweight moves never miss a load", () => {
    const s = prescribedSummary([row({ exerciseId: "pushup", slotExerciseId: "pushup", reps: 12 })], bw);
    expect(s.missingLoad).toEqual([]);
  });

  test("a prescribed set with no reps is an open AMRAP and isn't counted as a set", () => {
    const s = prescribedSummary([row({ key: "a", weight: 60, reps: 5 }), row({ key: "b", weight: 60, reps: "" })], bw);
    expect(s.openAmrap).toBe(1);
    expect(s.sets).toBe(1);
    expect(s.missingLoad).toEqual([]);
  });

  test("a blank extra set is ignored, a skipped AMRAP isn't open", () => {
    const s = prescribedSummary([row({ key: "x", extra: true }), row({ key: "b", reps: "", skipped: true })], bw);
    expect(s).toEqual({ sets: 0, missingLoad: [], missingLoadSets: 0, openAmrap: 0 });
  });
});

describe("isDirty", () => {
  const none = EMPTY_READINESS;
  test("a fresh sheet is clean", () => {
    expect(isDirty([row()], "", none, {})).toBe(false);
    expect(isDirty([row({ weight: null, reps: undefined })], "  ", none, {})).toBe(false);
  });

  test("a typed value, a skip, an extra set or a swap is dirty", () => {
    expect(isDirty([row({ reps: 5 })], "", none, {})).toBe(true);
    expect(isDirty([row({ rpe: 8 })], "", none, {})).toBe(true);
    expect(isDirty([row({ skipped: true })], "", none, {})).toBe(true);
    expect(isDirty([row({ extra: true })], "", none, {})).toBe(true);
    expect(isDirty([row({ exerciseId: "other" })], "", none, {})).toBe(true);
  });

  test("notes, any readiness tap or a flag are dirty", () => {
    expect(isDirty([row()], "felt slow", none, {})).toBe(true);
    expect(isDirty([row()], "", { ...none, energy: 9 }, {})).toBe(true);
    expect(isDirty([row()], "", { ...none, sleep: 2 }, {})).toBe(true);
    expect(isDirty([row()], "", { ...none, soreness: 4 }, {})).toBe(true);
    expect(isDirty([row()], "", none, { pe1: { kind: "technique", note: "" } })).toBe(true);
  });
});

describe("drafts", () => {
  const fresh = [row({ key: "a" }), row({ key: "b" })];
  const draft = (rows: SheetRow[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({ rows, notes: "n", energy: 8, date: "2026-11-09", savedAt: "2026-11-09T10:00:00Z", ...extra });

  test("draftKey is per client and session", () => {
    expect(draftKey("c1", "s1")).not.toBe(draftKey("c1", "s2"));
    expect(draftKey("c1", "s1")).not.toBe(draftKey("c2", "s1"));
  });

  test("a draft that covers the session comes back with its extras", () => {
    const d = parseDraft(draft([row({ key: "a", reps: 5 }), row({ key: "b" }), row({ key: "x", extra: true })]), fresh);
    expect(d?.rows.map((r) => r.key)).toEqual(["a", "b", "x"]);
    // A draft from before the readiness strip: energy alone, no flags.
    expect(d?.readiness).toEqual({ energy: 8, sleep: null, soreness: null });
    expect(d?.flags).toEqual({});
  });

  test("readiness and flags round-trip through draftJson", () => {
    const saved = {
      rows: fresh,
      notes: "",
      readiness: { energy: null, sleep: 2, soreness: 5 },
      flags: { pe1: { kind: "pain" as const, note: "knee" } },
      date: "2026-11-09",
      savedAt: "2026-11-09T10:00:00Z",
    };
    expect(parseDraft(draftJson(saved), fresh)).toEqual(saved);
  });

  test("bad readiness values or flags in a draft read as unset", () => {
    const d = parseDraft(draft(fresh, { energy: 11, readiness: { sleep: 9, soreness: "3" }, flags: { pe1: { kind: "ouch" }, pe2: { kind: "pain" } } }), fresh);
    expect(d?.readiness).toEqual({ energy: null, sleep: null, soreness: null });
    expect(d?.flags).toEqual({ pe2: { kind: "pain", note: "" } });
  });

  test("a draft from an edited session, junk or nothing is dropped", () => {
    expect(parseDraft(draft([row({ key: "a" })]), fresh)).toBeNull();
    expect(parseDraft(draft([row({ key: "a" }), row({ key: "z" })]), fresh)).toBeNull();
    expect(parseDraft("{not json", fresh)).toBeNull();
    expect(parseDraft(JSON.stringify({ rows: [] }), fresh)).toBeNull();
    expect(parseDraft(null, fresh)).toBeNull();
  });
});

describe("supersets on the sheet", () => {

  const r = (pe: string, n: number, group?: string): SheetRow =>
    row({ key: `${pe}-${n}`, programExerciseId: pe, exerciseId: `ex-${pe}`, slotExerciseId: `ex-${pe}`, setNumber: n, ...(group ? { group } : {}) });
  // built exercise by exercise, as freshRows does before roundOrder
  const built = () => [r("sq", 1), r("sq", 2), r("a1", 1, "A"), r("a1", 2, "A"), r("a1", 3, "A"), r("a2", 1, "A"), r("a2", 2, "A"), r("a2", 3, "A"), r("core", 1)];
  const keys = (rs: SheetRow[]) => rs.map((x) => x.key);

  test("a group's rows run round by round", () => {
    expect(keys(roundOrder(built()))).toEqual(["sq-1", "sq-2", "a1-1", "a2-1", "a1-2", "a2-2", "a1-3", "a2-3", "core-1"]);
  });

  test("blocks are units: the whole group is one card", () => {
    const blocks = blocksOf(roundOrder(built()));
    expect(blocks.map((b) => [b.key, b.memberIds.join("+"), b.rows.length])).toEqual([
      ["sq", "sq", 2],
      ["group:A", "a1+a2", 6],
      ["core", "core", 1],
    ]);
    expect(blockIndexOf(blocks, "a2")).toBe(1);
    expect(blockIndexOf(blocks, "nope")).toBe(-1);
  });

  test("Enter goes A1 → A2 → round 2", () => {
    const order = cellOrder(roundOrder(built()), () => true); // bodyweight: reps, rpe only
    const a1Rpe = nextCell(order, "a1-1", "rpe", 1);
    expect(a1Rpe).toMatchObject({ key: "a2-1", field: "reps" });
    expect(nextCell(order, "a2-1", "rpe", 1)).toMatchObject({ key: "a1-2", field: "reps" });
  });

  test("+Set on a member lands after the last round, in the group", () => {
    const rows = roundOrder(built());
    const out = withExtraSet(rows, "a1", (n) => ({ ...r("a1", n, "A"), key: "a1-x", extra: true }));
    expect(keys(out).slice(2, 9)).toEqual(["a1-1", "a2-1", "a1-2", "a2-2", "a1-3", "a2-3", "a1-x"]);
    expect(blocksOf(out)).toHaveLength(3);
  });

  test("undo skip puts a member's rows back in place", () => {
    const rows = roundOrder(built());
    const before = rows.filter((x) => x.programExerciseId === "a1").map((x) => ({ ...x, reps: 9 }));
    const out = unskipExercise(skipExercise(rows, "a1"), "a1", before);
    expect(keys(out)).toEqual(keys(rows));
    expect(out.filter((x) => x.programExerciseId === "a1").every((x) => x.reps === 9 && !x.skipped)).toBe(true);
  });
});
