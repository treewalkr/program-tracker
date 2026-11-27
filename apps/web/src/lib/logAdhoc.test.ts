import { describe, expect, test } from "bun:test";
import type { ProgramWeek } from "@pt/shared";
import {
  ADHOC_PREFIX,
  addAdhocToProgram,
  adhocPrefill,
  adhocProgramExercise,
  adhocRows,
  clientNowWeek,
  isAdhocSlot,
  newAdhocSlot,
  weeksText,
  withoutAdhoc,
  withToProgram,
  wirePe,
} from "./logAdhoc";
import { draftJson, isDirty, parseDraft, prescribedSummary, rowsToSave, toLoggedSet, withExtraSet, type SheetRow } from "./logSheet";
import { EMPTY_READINESS, sessionFlags } from "./logFlags";

const FLY = "00000000-0000-4000-8000-0000000000f1";
const BENCH = "00000000-0000-4000-8000-0000000000b1";
const SLOT = "00000000-0000-4000-8000-0000000000a1";

const planned = (n: number): SheetRow => ({
  key: `${SLOT}-${n}`,
  exerciseId: BENCH,
  slotExerciseId: BENCH,
  programExerciseId: SLOT,
  setNumber: n,
  type: "working",
  prescribedReps: 5,
  weight: "",
  reps: "",
  rpe: "",
});

describe("ad-hoc slot ids", () => {
  test("the client-side id is never sent: the wire set and flag carry null", () => {
    const slot = newAdhocSlot();
    expect(slot.startsWith(ADHOC_PREFIX)).toBe(true);
    expect(isAdhocSlot(slot)).toBe(true);
    expect(wirePe(slot)).toBeNull();
    expect(wirePe(SLOT)).toBe(SLOT);

    const rows = adhocRows({ slot, exerciseId: FLY, sets: [{ weightKg: 20, reps: 12 }] });
    expect(toLoggedSet(rows[0])).toEqual({ programExerciseId: null, exerciseId: FLY, setNumber: 1, type: "working", weightKg: 20, reps: 12, rpe: undefined });
    // a pain flag on it goes out with no slot; skipping an unplanned exercise sends no flag at all
    expect(sessionFlags(rows, { [slot]: { kind: "pain", note: "" } })).toEqual([{ programExerciseId: null, exerciseId: FLY, kind: "pain" }]);
    const skipped = rows.map((r) => ({ ...r, exerciseSkip: { reason: "time" as const } }));
    expect(sessionFlags(skipped, {})).toEqual([]);
  });
});

describe("adhocPrefill", () => {
  const logs = [
    {
      date: "2026-11-01",
      sets: [
        { programExerciseId: null, exerciseId: FLY, setNumber: 1, weightKg: 15, reps: 12 },
        { programExerciseId: null, exerciseId: FLY, setNumber: 2, weightKg: 15, reps: 10 },
      ],
    },
    {
      date: "2026-11-08",
      sets: [
        { programExerciseId: SLOT, exerciseId: BENCH, setNumber: 1, weightKg: 80, reps: 5 },
        { programExerciseId: "slot-2", exerciseId: FLY, setNumber: 2, weightKg: "17.50", reps: 9 },
        { programExerciseId: "slot-2", exerciseId: FLY, setNumber: 1, weightKg: "17.50", reps: 11 },
        { programExerciseId: "slot-2", exerciseId: FLY, setNumber: 3, weightKg: null, reps: 8 },
      ],
    },
  ];

  test("the newest log's sets of that exercise, in set order, with count, loads and reps", () => {
    expect(adhocPrefill(logs, FLY)).toEqual([
      { weightKg: 17.5, reps: 11 },
      { weightKg: 17.5, reps: 9 },
      { weightKg: null, reps: 8 },
    ]);
  });

  test("a log holding the lift in two slots prefills from the first slot only", () => {
    const two = [
      {
        date: "2026-11-08",
        sets: [
          { programExerciseId: "a", exerciseId: FLY, setNumber: 1, weightKg: 10, reps: 12 },
          { programExerciseId: "b", exerciseId: FLY, setNumber: 1, weightKg: 30, reps: 5 },
        ],
      },
    ];
    expect(adhocPrefill(two, FLY)).toEqual([{ weightKg: 10, reps: 12 }]);
  });

  test("no history: 3 sets of 10, load blank", () => {
    expect(adhocPrefill([], FLY)).toEqual([
      { weightKg: null, reps: 10 },
      { weightKg: null, reps: 10 },
      { weightKg: null, reps: 10 },
    ]);
    expect(adhocPrefill(logs, "someone-else")).toHaveLength(3);
  });
});

describe("the added card on the sheet", () => {
  const slot = newAdhocSlot();
  const added = adhocRows({ slot, exerciseId: FLY, sets: [{ weightKg: null, reps: 10 }, { weightKg: 20, reps: 10 }] });
  const sheet: SheetRow[] = [planned(1), planned(2), ...added];

  test("rows are numbered from 1, filled with the prefill and not marked extra", () => {
    expect(added.map((r) => [r.setNumber, r.weight, r.reps, !!r.extra])).toEqual([
      [1, "", 10, false],
      [2, 20, 10, false],
    ]);
  });

  test("+ Set works on the added card", () => {
    const more = withExtraSet(sheet, slot, (n) => ({ ...added[0], key: `${slot}-x`, setNumber: n, extra: true, reps: "" }));
    expect(more.filter((r) => r.programExerciseId === slot).map((r) => r.setNumber)).toEqual([1, 2, 3]);
  });

  test("removing it before save leaves the programmed sets untouched", () => {
    expect(withoutAdhoc(sheet, slot)).toEqual([planned(1), planned(2)]);
    // a programmed slot is never removed this way
    expect(withoutAdhoc(sheet, SLOT)).toBe(sheet);
  });

  test("it saves with a null slot and counts toward the log", () => {
    const sent = rowsToSave(sheet).map(toLoggedSet);
    expect(sent.map((s) => s.programExerciseId)).toEqual([null, null]);
    expect(sent.map((s) => s.exerciseId)).toEqual([FLY, FLY]);
  });

  test("it makes the sheet dirty, and the toggle reaches every set", () => {
    expect(isDirty([planned(1)], "", EMPTY_READINESS, {})).toBe(false);
    expect(isDirty(sheet, "", EMPTY_READINESS, {})).toBe(true);
    expect(withToProgram(sheet, slot, true).filter((r) => r.toProgram).length).toBe(2);
    expect(withToProgram(sheet, slot, true).find((r) => r.programExerciseId === SLOT)?.toProgram).toBeUndefined();
  });

  test("a restored draft keeps the added card", () => {
    const raw = draftJson({ rows: sheet, notes: "", readiness: EMPTY_READINESS, flags: {}, date: "2026-11-27", savedAt: "x" });
    const draft = parseDraft(raw, [planned(1), planned(2)]);
    expect(draft?.rows.filter((r) => r.programExerciseId === slot)).toHaveLength(2);
    // …and a program that changed under the draft still discards it
    expect(parseDraft(raw, [planned(1), planned(2), planned(3)])).toBeNull();
  });

  test("Log as prescribed treats its sets like extras: never an open AMRAP", () => {
    const rows = [planned(1), ...adhocRows({ slot, exerciseId: FLY, sets: [{ weightKg: 20, reps: 10 }] })].map((r) => ({ ...r }));
    rows[0] = { ...rows[0], reps: 5, weight: 80 };
    const blank = { ...rows[1], reps: "", weight: "" };
    expect(prescribedSummary([rows[0], blank], () => false).openAmrap).toBe(0);
  });
});

describe("also add to program", () => {
  const ex = (id: string, exerciseId: string, order: number) => ({
    id,
    exerciseId,
    exerciseName: exerciseId,
    order,
    prescribedSets: [{ setNumber: 1, type: "working" as const, reps: 5, amrap: false }],
  });
  const session = (week: number, seq: number, exercises = [ex(`b${week}${seq}`, BENCH, 0)]) => ({
    id: `s${week}-${seq}`,
    name: `Session ${seq}`,
    seq,
    kind: "exercises" as const,
    order: 0,
    weekday: seq,
    exercises,
  });
  const weeks = (n: number, rotation = false): ProgramWeek[] =>
    Array.from({ length: n }, (_, i) => ({
      week: i + 1,
      ...(rotation ? { rotation: i % 2 === 0 ? ("A" as const) : ("B" as const) } : {}),
      sessions: [session(i + 1, 1), session(i + 1, 2)],
    }));

  const exercise = adhocProgramExercise({
    exerciseId: FLY,
    exerciseName: "Cable fly",
    sets: [
      { type: "working", weightKg: 20, reps: 12, rpe: 8 },
      { type: "working", weightKg: 20, reps: 10 },
      { type: "working", reps: 0 },
    ],
  })!;

  test("targets come from the logged sets, role Aux; a missed set (0 reps) is left out", () => {
    expect(exercise.role).toBe("accessory");
    expect(exercise.prescribedSets).toEqual([
      { setNumber: 1, type: "working", reps: 12, amrap: false, targetWeightKg: 20, targetRpe: 8 },
      { setNumber: 2, type: "working", reps: 10, amrap: false, targetWeightKg: 20 },
    ]);
    expect(adhocProgramExercise({ exerciseId: FLY, exerciseName: "x", sets: [{ type: "working", reps: 0 }] })).toBeNull();
  });

  test("lands last in the same session of every week after the logged one, never touching other sessions", () => {
    const r = addAdhocToProgram(weeks(4), { from: 2, session: { kind: "exercises", seq: 2, name: "Session 2" }, exercise, nowWeek: 2 });
    expect(r.changed).toEqual([3, 4]);
    for (const w of r.weeks) {
      const s2 = w.sessions.find((s) => s.seq === 2)!;
      const s1 = w.sessions.find((s) => s.seq === 1)!;
      expect(s1.exercises).toHaveLength(1);
      if (w.week >= 3) {
        expect(s2.exercises.map((e) => e.exerciseId)).toEqual([BENCH, FLY]);
        expect(s2.exercises[1].id).not.toBe(exercise.id);
        expect(s2.exercises[1].order).toBe(1);
      } else expect(s2.exercises).toHaveLength(1);
    }
  });

  test("never touches a finished week, even when the logged week is an old one", () => {
    const r = addAdhocToProgram(weeks(5), { from: 1, session: { kind: "exercises", seq: 1, name: "Session 1" }, exercise, nowWeek: 4 });
    expect(r.changed).toEqual([4, 5]);
    expect(r.weeks[1].sessions[0].exercises).toHaveLength(1);
    expect(r.weeks[2].sessions[0].exercises).toHaveLength(1);
  });

  test("an A/B block only gets the same letter", () => {
    const r = addAdhocToProgram(weeks(6, true), { from: 1, session: { kind: "exercises", seq: 1, name: "Session 1" }, exercise, nowWeek: 1 });
    expect(r.changed).toEqual([3, 5]);
  });

  test("a week that already holds the exercise is left alone", () => {
    const w = weeks(3);
    w[2].sessions[0].exercises.push(ex("fly", FLY, 1));
    const r = addAdhocToProgram(w, { from: 1, session: { kind: "exercises", seq: 1, name: "Session 1" }, exercise, nowWeek: 1 });
    expect(r.changed).toEqual([2]);
    expect(r.already).toEqual([3]);
  });

  test("the last week has nothing after it: no change", () => {
    const r = addAdhocToProgram(weeks(3), { from: 3, session: { kind: "exercises", seq: 1, name: "Session 1" }, exercise, nowWeek: 3 });
    expect(r.changed).toEqual([]);
  });

  test("the client's week: now, W1 before the start, past the end nothing later, drafts none", () => {
    const d = (...states: ("past" | "now" | "upcoming")[]) => states.map((state, i) => ({ week: i + 1, state }));
    expect(clientNowWeek(d("past", "now", "upcoming"))).toBe(2);
    expect(clientNowWeek(d("upcoming", "upcoming"))).toBe(1);
    expect(clientNowWeek(d("past", "past"))).toBe(3);
    expect(clientNowWeek(null)).toBeNull();
  });

  test("weeks read as a range or a list", () => {
    expect([weeksText([4]), weeksText([3, 4, 5]), weeksText([3, 5])]).toEqual(["week 4", "weeks 3–5", "weeks 3, 5"]);
  });
});
