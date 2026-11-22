import { describe, expect, test } from "bun:test";
import {
  applyForward,
  applyPlacementToAllWeeks,
  blockEditText,
  groupedSetsOf,
  moveToBlock,
  orderByBlock,
  forwardWeeks,
  ProgramWeeksDocument,
  sessionKey,
  setAlternating,
  stampWeeks,
  weekStructureDiff,
  type Phasing,
  type ProgramExercise,
  type ProgramSession,
  type ProgramWeek,
} from "./index";

const ex = (exerciseId: string, kg: number | null = 60, order = 0): ProgramExercise => ({
  id: crypto.randomUUID(),
  exerciseId,
  exerciseName: exerciseId,
  order,
  prescribedSets: [{ setNumber: 1, type: "working", amrap: false, reps: 5, targetWeightKg: kg }],
});

const session = (seq: number, name: string, exercises: ProgramExercise[], weekday: number | null = seq): ProgramSession => ({
  id: crypto.randomUUID(),
  name,
  seq,
  weekday,
  order: 0,
  kind: "exercises",
  exercises: exercises.map((e, i) => ({ ...e, order: i })),
});

/** Six identical weeks: Session 1 (Squat, Bench) Mon, Session 2 (Deadlift) Wed. */
const block = (n = 6): ProgramWeek[] =>
  stampWeeks([session(1, "Lower", [ex("squat", 100), ex("bench", 60)], 1), session(2, "Pull", [ex("deadlift", 120)], 3)], n);

const clone = (w: ProgramWeek): ProgramWeek => structuredClone(w);
const noLogs = { sessionHasLogs: () => false, exerciseHasLogs: () => false };
const names = (w: ProgramWeek) => w.sessions.map((s) => s.name).sort();
const exIds = (w: ProgramWeek, key: string) =>
  w.sessions.find((s) => sessionKey(s) === key)?.exercises.map((e) => e.exerciseId) ?? [];
const kgOf = (w: ProgramWeek, key: string, exerciseId: string) =>
  w.sessions.find((s) => sessionKey(s) === key)?.exercises.find((e) => e.exerciseId === exerciseId)?.prescribedSets[0].targetWeightKg;

describe("weekStructureDiff", () => {
  test("no edits for an unchanged week or set-only changes", () => {
    const w = block()[0];
    const after = clone(w);
    after.sessions[0].exercises[0].prescribedSets[0].targetWeightKg = 105;
    after.sessions[0].exercises[0].notes = "pause";
    after.sessions[0].weekday = 2;
    expect(weekStructureDiff(w, clone(w))).toEqual([]);
    expect(weekStructureDiff(w, after)).toEqual([]);
  });

  test("add, remove, rename sessions; add, remove, swap exercises", () => {
    const w = block()[0];
    const after = clone(w);
    after.sessions[0].name = "Legs";
    after.sessions[0].exercises = [after.sessions[0].exercises[0], ex("row", 50, 1)]; // bench removed, row added
    after.sessions[1].exercises[0] = { ...after.sessions[1].exercises[0], exerciseId: "rdl", exerciseName: "RDL" }; // swap
    const home = session(3, "Home", [ex("pushup", null)], 6);
    after.sessions.push(home);
    const edits = weekStructureDiff(w, after);
    expect(edits.map((e) => e.kind).sort()).toEqual(["addExercise", "addSession", "removeExercise", "renameSession", "swapExercise"]);
    expect(edits.find((e) => e.kind === "swapExercise")).toMatchObject({ ref: { key: "exercises:2", exerciseId: "deadlift", occurrence: 0 }, exerciseId: "rdl" });
    const removed = clone(w);
    removed.sessions = [removed.sessions[0]];
    expect(weekStructureDiff(w, removed)).toEqual([{ kind: "removeSession", key: "exercises:2", name: "Pull" }]);
  });
});

describe("forwardWeeks", () => {
  test("later weeks from the client's current week; every later week for a draft", () => {
    const weeks = block();
    expect(forwardWeeks(weeks, 2, 2)).toEqual([3, 4, 5, 6]);
    expect(forwardWeeks(weeks, 1, 2)).toEqual([2, 3, 4, 5, 6]); // FB-017: an edit on a finished week reaches the client
    expect(forwardWeeks(weeks, 2, 4)).toEqual([4, 5, 6]);
    expect(forwardWeeks(weeks, 1, null)).toEqual([2, 3, 4, 5, 6]);
    expect(forwardWeeks(weeks, 6, 2)).toEqual([]);
  });
  test("A/B: same letter only", () => {
    const weeks = setAlternating(block(), true);
    expect(forwardWeeks(weeks, 1, 1)).toEqual([3, 5]);
    expect(forwardWeeks(weeks, 2, 3)).toEqual([4, 6]);
  });
});

describe("applyForward", () => {
  test("FB-017: a session added to W2 reaches W3–W6 with fresh ids; W1 untouched", () => {
    const weeks = block();
    const after = clone(weeks[1]);
    after.sessions.push(session(3, "Home", [ex("pushup", null)], 6));
    const edits = weekStructureDiff(weeks[1], after);
    weeks[1] = after;
    const r = applyForward(weeks, 2, edits, { targets: forwardWeeks(weeks, 2, 2), ...noLogs });
    expect(r.changed).toEqual([3, 4, 5, 6]);
    expect(r.skipped).toEqual([]);
    expect(names(r.weeks[0])).toEqual(["Lower", "Pull"]);
    for (const w of r.weeks.slice(1)) expect(names(w)).toEqual(["Home", "Lower", "Pull"]);
    const ids = r.weeks.flatMap((w) => w.sessions.filter((s) => s.name === "Home").map((s) => s.id));
    expect(new Set(ids).size).toBe(5);
    expect(r.weeks[0]).toBe(weeks[0]);
    expect(ProgramWeeksDocument.safeParse(r.weeks).success).toBe(true);
  });

  test("an added cardio session is deep-copied into each later week", () => {
    const weeks = block(3);
    const after = clone(weeks[0]);
    const cardio: ProgramSession = {
      id: crypto.randomUUID(),
      name: "Intervals",
      seq: 1,
      weekday: 5,
      order: 0,
      kind: "cardio",
      exercises: [],
      cardio: { modality: "Run", intervals: [{ id: "i1", type: "work", repeat: 4, durationSec: 180 }] },
    };
    after.sessions.push(cardio);
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: [2, 3], ...noLogs });
    const [a, b] = [r.weeks[1], r.weeks[2]].map((w) => w.sessions.find((s) => s.kind === "cardio")!.cardio!.intervals!);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });

  test("a session whose key the target already has is skipped", () => {
    const weeks = block(3);
    weeks[2].sessions.push(session(3, "Other", [ex("curl")], 5));
    const after = clone(weeks[0]);
    after.sessions.push(session(3, "Home", [ex("pushup")], 6));
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: [2, 3], ...noLogs });
    expect(r.changed).toEqual([2]);
    expect(r.skipped.map((s) => [s.week, s.reason])).toEqual([[3, "exists"]]);
    expect(names(r.weeks[2])).toEqual(["Lower", "Other", "Pull"]);
  });

  test("removes and swaps skip weeks with logs", () => {
    const weeks = block(4);
    const after = clone(weeks[0]);
    after.sessions[0].exercises = [after.sessions[0].exercises[0]]; // remove bench
    after.sessions[1].exercises[0] = { ...after.sessions[1].exercises[0], exerciseId: "rdl", exerciseName: "RDL" };
    const loggedBench = (week: number, _s: string, e: ProgramExercise) => week === 2 && (e.exerciseId === "bench" || e.exerciseId === "deadlift");
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), {
      targets: [2, 3, 4],
      sessionHasLogs: () => false,
      exerciseHasLogs: loggedBench,
    });
    expect(exIds(r.weeks[1], "exercises:1")).toEqual(["squat", "bench"]);
    expect(exIds(r.weeks[1], "exercises:2")).toEqual(["deadlift"]);
    expect(exIds(r.weeks[2], "exercises:1")).toEqual(["squat"]);
    expect(exIds(r.weeks[3], "exercises:2")).toEqual(["rdl"]);
    expect(r.skipped.map((s) => [s.week, s.reason, s.edit.kind])).toEqual([
      [2, "logged", "removeExercise"],
      [2, "logged", "swapExercise"],
    ]);
  });

  test("a logged session is never removed", () => {
    const weeks = block(3);
    const after = clone(weeks[0]);
    after.sessions = [after.sessions[0]];
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), {
      targets: [2, 3],
      sessionHasLogs: (w) => w === 2,
      exerciseHasLogs: () => false,
    });
    expect(names(r.weeks[1])).toEqual(["Lower", "Pull"]);
    expect(names(r.weeks[2])).toEqual(["Lower"]);
    expect(r.skipped.map((s) => [s.week, s.reason])).toEqual([[2, "logged"]]);
  });

  test("renames follow the session key; the second same exercise is found by occurrence", () => {
    const weeks = stampWeeks([session(1, "A", [ex("bench", 60), ex("bench", 50), ex("row")], 1)], 3);
    const after = clone(weeks[0]);
    after.sessions[0].name = "Push";
    after.sessions[0].exercises = after.sessions[0].exercises.filter((_, i) => i !== 1);
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: [2, 3], ...noLogs });
    for (const w of r.weeks.slice(1)) {
      expect(w.sessions[0].name).toBe("Push");
      expect(w.sessions[0].exercises.map((e) => [e.exerciseId, e.prescribedSets[0].targetWeightKg, e.order])).toEqual([
        ["bench", 60, 0],
        ["row", 60, 1],
      ]);
    }
  });

  test("an added exercise follows the block's progression, deload included", () => {
    const weeks = block(5);
    const phasing: Pick<Phasing, "weeks"> = {
      weeks: [
        { week: 2, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
        { week: 3, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
        { week: 4, directive: "deload" },
        { week: 5, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      ] as Phasing["weeks"],
    };
    const after = clone(weeks[0]);
    after.sessions[1].exercises.push(ex("row", 50, 1));
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: [2, 3, 4, 5], phasing, ...noLogs });
    expect(r.weeks.slice(1).map((w) => kgOf(w, "exercises:2", "row"))).toEqual([52.5, 55, 55, 57.5]);
    // Untouched exercises keep their own sets.
    expect(r.weeks.slice(1).map((w) => kgOf(w, "exercises:1", "squat"))).toEqual([100, 100, 100, 100]);
  });

  test("with no rules an added exercise is a copy; an added session's exercises progress too", () => {
    const weeks = block(3);
    const after = clone(weeks[0]);
    after.sessions.push(session(3, "Home", [ex("goblet", 20)], 6));
    const plain = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: [2, 3], ...noLogs });
    expect(plain.weeks.slice(1).map((w) => kgOf(w, "exercises:3", "goblet"))).toEqual([20, 20]);
    const phasing = { weeks: [{ week: 2, directive: "+intensity", progression: { kind: "kg", amount: 2 } }, { week: 3, directive: "+intensity", progression: { kind: "kg", amount: 2 } }] } as Pick<Phasing, "weeks">;
    const prog = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: [2, 3], phasing, ...noLogs });
    expect(prog.weeks.slice(1).map((w) => kgOf(w, "exercises:3", "goblet"))).toEqual([22, 24]);
  });

  test("A/B: the chain steps through same-letter weeks only", () => {
    const weeks = setAlternating(block(6), true);
    const phasing = { weeks: [3, 5].map((week) => ({ week, directive: "+intensity", progression: { kind: "kg", amount: 5 } })) } as Pick<Phasing, "weeks">;
    const after = clone(weeks[0]);
    after.sessions[0].exercises.push(ex("lunge", 40, 2));
    const r = applyForward(weeks, 1, weekStructureDiff(weeks[0], after), { targets: forwardWeeks(weeks, 1, 1), phasing, ...noLogs });
    expect(r.changed).toEqual([3, 5]);
    expect([3, 5].map((n) => kgOf(r.weeks[n - 1], "exercises:1", "lunge"))).toEqual([45, 50]);
    expect(exIds(r.weeks[1], "exercises:1")).toEqual(["squat", "bench"]);
  });

  test("nothing to do without targets or edits", () => {
    const weeks = block(2);
    expect(applyForward(weeks, 1, [], { targets: [2], ...noLogs }).weeks).toBe(weeks);
    expect(applyForward(weeks, 2, [{ kind: "renameSession", key: "exercises:1", name: "x", from: "Lower" }], { targets: [], ...noLogs }).changed).toEqual([]);
  });
});

describe("applyPlacementToAllWeeks with targets", () => {
  test("only the target weeks follow; finished weeks keep their placement", () => {
    const weeks = block(4);
    weeks[1].sessions[0].weekday = 2;
    const out = applyPlacementToAllWeeks(weeks, 2, [3, 4]);
    expect(out.map((w) => w.sessions[0].weekday)).toEqual([1, 2, 2, 2]);
  });
});

describe("session block edits", () => {
  const lower = "exercises:1";
  test("a block change is its own edit and goes forward", () => {
    const weeks = block(3);
    const after = clone(weeks[0]);
    after.sessions[0].exercises = moveToBlock(after.sessions[0].exercises, 1, "prep");
    const edits = weekStructureDiff(weeks[0], after);
    expect(edits).toEqual([{ kind: "blockExercise", ref: { key: lower, exerciseId: "bench", occurrence: 0 }, name: "bench", to: "prep" }]);
    expect(blockEditText("Band pull-apart", "prep")).toBe("Band pull-apart → movement prep");
    const r = applyForward([after, weeks[1], weeks[2]], 1, edits, { targets: [2, 3], ...noLogs });
    expect(r.changed).toEqual([2, 3]);
    const s = r.weeks[1].sessions.find((x) => sessionKey(x) === lower)!;
    expect(s.exercises.map((e) => [e.exerciseId, e.block ?? "main", e.order])).toEqual([["bench", "prep", 0], ["squat", "main", 1]]);
    expect(ProgramWeeksDocument.safeParse(r.weeks).success).toBe(true);
  });

  test("prep never takes a session's last main exercise; a logged slot is kept", () => {
    const weeks = block(2);
    const edit = { kind: "blockExercise" as const, ref: { key: "exercises:2", exerciseId: "deadlift", occurrence: 0 }, name: "deadlift", to: "prep" as const };
    expect(applyForward(weeks, 1, [edit], { targets: [2], ...noLogs }).skipped.map((x) => x.reason)).toEqual(["empty"]);
    const benchEdit = { ...edit, ref: { key: lower, exerciseId: "bench", occurrence: 0 }, name: "bench" };
    const logged = applyForward(weeks, 1, [benchEdit], { targets: [2], sessionHasLogs: () => false, exerciseHasLogs: () => true });
    expect(logged.skipped.map((x) => x.reason)).toEqual(["logged"]);
  });

  test("an added prep exercise lands at the end of prep in later weeks", () => {
    const weeks = block(2);
    const after = clone(weeks[0]);
    const band = { ...ex("band", null), block: "prep" as const };
    after.sessions[0].exercises = orderByBlock([...after.sessions[0].exercises, { ...band, order: 2 }]);
    const edits = weekStructureDiff(weeks[0], after);
    expect(edits.map((e) => e.kind)).toEqual(["addExercise"]);
    const r = applyForward([after, weeks[1]], 1, edits, { targets: [2], ...noLogs });
    expect(exIds(r.weeks[1], lower)).toEqual(["band", "squat", "bench"]);
  });

  test("the draft diff shows a block move as a change", () => {
    const a = [{ prescribedSets: [{ reps: 8, amrap: false }] }];
    expect(groupedSetsOf(a, 0)).toBe("8");
    expect(groupedSetsOf([{ ...a[0], block: "prep" }], 0)).toBe("8 · prep");
  });
});
