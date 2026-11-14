import { describe, expect, test } from "bun:test";
import type { AiProgramDraft } from "./ai";
import {
  applyDraftEdit,
  canApplyDraftEdit,
  DraftEditError,
  type DraftEditOp,
  DraftEditOps,
  draftEditNote,
  draftEditRevisionMessage,
  foldDraftEdit,
  parseDraftEditNote,
  parseDraftEditRevision,
  leaveSuperset,
  moveDraftExercise,
  moveToSession,
  sameDraft,
  supersetSelected,
  supersetWith,
} from "./draftEdit";
import { groupIssues } from "./groups";

const set = (n: number) => ({ setNumber: n, type: "working" as const, reps: 8, amrap: false });
const ex = (name: string, opts: { role?: string; group?: string; sets?: number } = {}) => ({
  exerciseName: name,
  prescribedSets: Array.from({ length: opts.sets ?? 3 }, (_, i) => set(i + 1)),
  ...(opts.role ? { role: opts.role } : {}),
  ...(opts.group ? { group: opts.group } : {}),
});
const lifting = (name: string, exercises: ReturnType<typeof ex>[]) => ({ name, kind: "lifting" as const, exercises });

/** All accessory unless said otherwise, so role order never interferes. */
function draft(...sessions: ReturnType<typeof ex>[][]): AiProgramDraft {
  return {
    name: "Block",
    rationale: "",
    clientSummary: "",
    weeks: [{ week: 1, sessions: sessions.map((exs, i) => lifting(`Day ${i + 1}`, exs)) }],
  } as AiProgramDraft;
}
const aux = (name: string, group?: string, sets?: number) => ex(name, { role: "accessory", group, sets });

/** "A·B·[C D]·E" — groups bracketed with their letter. */
function shape(d: AiProgramDraft, day = 1): string {
  const out: string[] = [];
  const l = d.weeks[0].sessions[day - 1].exercises;
  for (let i = 0; i < l.length; i++) {
    const g = l[i].group;
    if (!g) {
      out.push(l[i].exerciseName!);
      continue;
    }
    const m: string[] = [];
    while (i < l.length && l[i].group === g) m.push(l[i++].exerciseName!);
    i--;
    out.push(`${g}[${m.join(" ")}]`);
  }
  return out.join("·");
}

const r = (day: number, slot: number) => ({ day, slot });

// Session: P · Q · A[R S] · T
const base = () => draft([aux("P"), aux("Q"), aux("R", "A"), aux("S", "A"), aux("T")], [aux("X"), aux("Y")]);

describe("move", () => {
  test("ungrouped rows swap with an ungrouped neighbour", () => {
    const res = moveDraftExercise(base(), r(1, 2), "up");
    expect(shape(res.draft)).toBe("Q·P·A[R S]·T");
    expect(res.changes).toEqual(["moved Q up in Session 1"]);
    expect(res.changed).toBe(true);
  });

  test("an ungrouped row steps over a whole group, never into it", () => {
    expect(shape(moveDraftExercise(base(), r(1, 2), "down").draft)).toBe("P·A[R S]·Q·T");
    expect(shape(moveDraftExercise(base(), r(1, 5), "up").draft)).toBe("P·Q·T·A[R S]");
  });

  test("inside a group a member swaps with the next member", () => {
    expect(shape(moveDraftExercise(base(), r(1, 3), "down").draft)).toBe("P·Q·A[S R]·T");
    expect(shape(moveDraftExercise(base(), r(1, 4), "up").draft)).toBe("P·Q·A[S R]·T");
  });

  test("first member moving up leaves the group and steps over the row above; a two-member group dissolves", () => {
    const res = moveDraftExercise(base(), r(1, 3), "up");
    expect(shape(res.draft)).toBe("P·R·Q·S·T");
    expect(groupIssues(res.draft.weeks[0].sessions[0].exercises)).toEqual([]);
  });

  test("last member moving down leaves the group, a three-member group stays", () => {
    const d = draft([aux("P"), aux("R", "A"), aux("S", "A"), aux("U", "A"), aux("T")]);
    expect(shape(moveDraftExercise(d, r(1, 4), "down").draft)).toBe("P·A[R S]·T·U");
  });

  test("top of the session can't move up, bottom can't move down", () => {
    expect(moveDraftExercise(base(), r(1, 1), "up").changed).toBe(false);
    expect(moveDraftExercise(base(), r(1, 5), "down").changed).toBe(false);
    expect(canApplyDraftEdit(base(), { op: "move", refs: [r(1, 1)], dir: "up" })).toBe(false);
  });

  test("the trainer's order wins: a row moves up past a higher-ranked role", () => {
    const d = draft([ex("Squat", { role: "primary" }), ex("Curl", { role: "accessory" })]);
    const res = moveDraftExercise(d, r(1, 2), "up");
    expect(res.changed).toBe(true);
    expect(shape(res.draft)).toBe("Curl·Squat");
    expect(canApplyDraftEdit(d, { op: "move", refs: [r(1, 1)], dir: "down" })).toBe(true);
  });

  test("an AI draft is edited as shown (role-sorted), then stored in the trainer's order", () => {
    // Stored Str first; shown Primary first.
    const d = draft([ex("Lunge", { role: "strength" }), ex("Squat", { role: "primary" }), aux("Curl")]);
    expect(canApplyDraftEdit(d, { op: "move", refs: [r(1, 2)], dir: "up" })).toBe(false); // already on top as shown
    const res = moveDraftExercise(d, r(1, 2), "down");
    expect(shape(res.draft)).toBe("Lunge·Squat·Curl");
    expect(res.changed).toBe(true);
  });

  test("a trainer-ordered draft is edited as stored, Primary below Str", () => {
    const d = draft([ex("Lunge", { role: "strength" }), ex("Squat", { role: "primary" }), aux("Curl")]);
    const keep = { keepOrder: true };
    expect(canApplyDraftEdit(d, { op: "move", refs: [r(1, 2)], dir: "up" }, undefined, keep)).toBe(true);
    expect(canApplyDraftEdit(d, { op: "move", refs: [r(1, 1)], dir: "up" }, undefined, keep)).toBe(false);
    const res = moveDraftExercise(d, r(1, 2), "down", undefined, keep);
    expect(shape(res.draft)).toBe("Lunge·Curl·Squat");
    // A second edit keeps the first one's order.
    const again = moveDraftExercise(res.draft, r(1, 2), "up", undefined, keep);
    expect(shape(again.draft)).toBe("Curl·Lunge·Squat");
  });

  test("moving up past a superset steps over the whole group, across roles", () => {
    const d = draft([ex("Squat", { role: "primary", group: "A" }), aux("Curl", "A"), ex("Lunge", { role: "strength" })]);
    const res = moveDraftExercise(d, r(1, 3), "up", undefined, { keepOrder: true });
    expect(shape(res.draft)).toBe("Lunge·A[Squat Curl]");
  });

  test("several rows move together; a selected neighbour blocks", () => {
    const res = applyDraftEdit(base(), [{ op: "move", refs: [r(1, 2), r(1, 5)], dir: "up" }]);
    expect(shape(res.draft)).toBe("Q·P·T·A[R S]");
    expect(res.changes).toEqual(["moved Q, T up in Session 1"]);

    const blocked = applyDraftEdit(base(), [{ op: "move", refs: [r(1, 1), r(1, 2)], dir: "up" }]);
    expect(blocked.changed).toBe(false);
  });
});

describe("superset with a neighbour", () => {
  test("two ungrouped rows start a superset", () => {
    const res = supersetWith(base(), r(1, 2), "above");
    expect(shape(res.draft)).toBe("A[P Q]·B[R S]·T");
    expect(res.changes).toEqual(["superset A in Session 1: P + Q"]);
  });

  test("joining the group below makes a circuit", () => {
    const res = supersetWith(base(), r(1, 2), "below");
    expect(shape(res.draft)).toBe("P·A[Q R S]·T");
    expect(res.changes).toEqual(["circuit A in Session 1: Q + R + S"]);
  });

  test("a group's edge member switches to the neighbouring group; its old group dissolves", () => {
    const res = supersetWith(base(), r(1, 3), "above");
    expect(shape(res.draft)).toBe("P·A[Q R]·S·T");
  });

  test("set counts match the group's largest", () => {
    const d = draft([aux("P", undefined, 3), aux("Q", undefined, 5)]);
    const res = supersetWith(d, r(1, 1), "below");
    expect(res.draft.weeks[0].sessions[0].exercises.map((e) => e.prescribedSets.length)).toEqual([5, 5]);
  });

  test("no neighbour, or already together, is refused", () => {
    expect(() => supersetWith(base(), r(1, 1), "above")).toThrow(DraftEditError);
    expect(() => supersetWith(base(), r(1, 4), "above")).toThrow("already in that superset");
  });
});

describe("leave a superset", () => {
  test("the row lands right after its group; a one-member group dissolves", () => {
    const res = leaveSuperset(base(), r(1, 3));
    expect(shape(res.draft)).toBe("P·Q·S·R·T");
    expect(res.changes).toEqual(["took R out of superset A in Session 1"]);
  });

  test("a circuit keeps its other members", () => {
    const d = draft([aux("R", "A"), aux("S", "A"), aux("U", "A"), aux("T")]);
    expect(shape(leaveSuperset(d, r(1, 1)).draft)).toBe("A[S U]·R·T");
  });

  test("an ungrouped row is refused", () => {
    expect(() => leaveSuperset(base(), r(1, 1))).toThrow("not in a superset");
  });
});

describe("move to another session", () => {
  test("appends to the end, out of its group", () => {
    const res = moveToSession(base(), [r(1, 3)], 2);
    expect(shape(res.draft, 1)).toBe("P·Q·S·T");
    expect(shape(res.draft, 2)).toBe("X·Y·R");
    expect(res.changes).toEqual(["moved R to Session 2"]);
  });

  test("several rows, from several sessions, keep their order", () => {
    const res = moveToSession(base(), [r(2, 1), r(1, 1)], 2);
    expect(shape(res.draft, 2)).toBe("Y·P·X");
    expect(res.changes).toEqual(["moved P, X to Session 2"]);
  });

  test("the moved exercise stays at the end, whatever its role", () => {
    const d = draft([ex("Squat", { role: "primary" }), aux("Curl")], [aux("Row")]);
    const res = moveToSession(d, [r(1, 1)], 2);
    expect(res.draft.weeks[0].sessions[1].exercises.map((e) => e.exerciseName)).toEqual(["Row", "Squat"]);
  });

  test("never empties a session, and never lands in a cardio session", () => {
    expect(() => moveToSession(base(), [r(2, 1), r(2, 2)], 1)).toThrow("Session 2 would have no exercises");
    const d = base();
    d.weeks[0].sessions.push({ name: "Run", kind: "cardio", exercises: [], cardio: { modality: "run", durationMin: 30 } } as never);
    expect(() => moveToSession(d, [r(1, 1)], 3)).toThrow("cardio session");
  });
});

describe("superset the selected rows", () => {
  test("rows become adjacent at the first one's place", () => {
    const res = supersetSelected(base(), [r(1, 5), r(1, 1)]);
    expect(shape(res.draft)).toBe("A[P T]·Q·B[R S]");
    expect(res.changes).toEqual(["made superset A in Session 1: P + T"]);
  });

  test("never lands inside another group", () => {
    const d = draft([aux("R", "A"), aux("S", "A"), aux("U", "A"), aux("P"), aux("Q")]);
    // S is first; R and U stay together, so the new group goes after them.
    const res = supersetSelected(d, [r(1, 2), r(1, 5)]);
    expect(shape(res.draft)).toBe("A[R U]·B[S Q]·P");
  });

  test("three rows make a circuit", () => {
    expect(supersetSelected(base(), [r(1, 1), r(1, 2), r(1, 5)]).changes).toEqual([
      "made circuit A in Session 1: P + Q + T",
    ]);
  });

  test("needs two rows from one session", () => {
    expect(() => supersetSelected(base(), [r(1, 1), r(2, 1)])).toThrow("one session");
    expect(() => supersetSelected(base(), [r(1, 1), r(1, 1)])).toThrow("two or more");
  });
});

describe("undo", () => {
  const ops: DraftEditOp[] = [
    { op: "move", refs: [r(1, 2)], dir: "down" },
    { op: "superset", ref: r(1, 2), with: "below" },
    { op: "leave", ref: r(1, 3) },
    { op: "moveTo", refs: [r(1, 3), r(1, 1)], day: 2 },
    { op: "group", refs: [r(1, 1), r(1, 5)] },
  ];

  for (const op of ops) {
    test(`the inverse of ${op.op} restores the draft exactly`, () => {
      const before = base();
      before.weeks[0].sessions[0].exercises[0].prescribedSets.push(set(4)); // uneven sets, grown by a superset
      const res = applyDraftEdit(before, [op]);
      expect(res.changed).toBe(true);
      const undone = applyDraftEdit(res.draft, [res.inverse]);
      expect(undone.changed).toBe(true);
      expect(sameDraft(undone.draft, before)).toBe(true);
      expect(undone.changes).toEqual(["undid the last hand edit"]);
    });
  }

  test("undoing the first edit of an AI draft puts back the role order it was shown in", () => {
    const before = draft([ex("Lunge", { role: "strength" }), ex("Squat", { role: "primary" }), aux("Curl")]);
    const res = moveDraftExercise(before, r(1, 3), "up");
    expect(shape(res.draft)).toBe("Squat·Curl·Lunge");
    const undone = applyDraftEdit(res.draft, [res.inverse], undefined, { keepOrder: true });
    expect(shape(undone.draft)).toBe("Squat·Lunge·Curl");
  });

  test("a request of several ops undoes as one", () => {
    const before = base();
    const res = applyDraftEdit(before, [
      { op: "moveTo", refs: [r(1, 1)], day: 2 },
      { op: "superset", ref: r(2, 3), with: "above" },
    ]);
    expect(res.changes).toEqual(["moved P to Session 2", "superset A in Session 2: Y + P"]);
    expect(sameDraft(applyDraftEdit(res.draft, [res.inverse]).draft, before)).toBe(true);
  });

  test("a restore must place every exercise once", () => {
    const d = base();
    const twice = { op: "restore" as const, sessions: [[{ from: r(1, 1), group: null, sets: 3 }, { from: r(1, 1), group: null, sets: 3 }], []] };
    expect(() => applyDraftEdit(d, [twice])).toThrow("listed twice");
    const missing = { op: "restore" as const, sessions: [[{ from: r(1, 1), group: null, sets: 3 }], [{ from: r(2, 1), group: null, sets: 3 }]] };
    expect(() => applyDraftEdit(d, [missing])).toThrow("every exercise");
  });
});

describe("refs and wording", () => {
  test("a stale ref is refused", () => {
    expect(() => moveDraftExercise(base(), r(1, 9), "up")).toThrow("no exercise at session 1, slot 9");
  });

  test("ops parse from JSON and bad ops are refused", () => {
    expect(DraftEditOps.safeParse([{ op: "move", refs: [r(1, 1)], dir: "up" }]).success).toBe(true);
    expect(DraftEditOps.safeParse([{ op: "move", refs: [r(0, 1)], dir: "up" }]).success).toBe(false);
    expect(DraftEditOps.safeParse([{ op: "rename", ref: r(1, 1) }]).success).toBe(false);
    expect(DraftEditOps.safeParse([]).success).toBe(false);
  });

  test("note and revision message", () => {
    const changes = ["moved Plank to Session 2", "superset A in Session 1: Box Jump + Plank"];
    expect(draftEditNote(3, changes)).toBe(
      "Edited the draft by hand (v3): moved Plank to Session 2; superset A in Session 1: Box Jump + Plank."
    );
    expect(draftEditRevisionMessage(changes)).toBe(
      "Edited by you: moved Plank to Session 2; superset A in Session 1: Box Jump + Plank"
    );
  });

  test("a long revision message is summarised as …and N more, and reads back", () => {
    const many = Array.from({ length: 12 }, (_, i) => `moved Exercise Number ${i + 1} to Session 2`);
    const msg = draftEditRevisionMessage(many);
    expect(msg.length).toBeLessThan(200);
    expect(msg).toMatch(/ …and \d+ more$/);
    const back = parseDraftEditRevision(msg);
    expect(back.changes.length + back.more).toBe(12);
    expect(back.changes[0]).toBe(many[0]);
    expect(draftEditRevisionMessage(back.changes, back.more)).toBe(msg);
    expect(parseDraftEditRevision("Edited by you: changes undone")).toEqual({ changes: [], more: 0 });
    expect(parseDraftEditRevision("Block plan edited by you")).toEqual({ changes: [], more: 0 });
  });

  test("notes read back, continued or undone", () => {
    expect(parseDraftEditNote(draftEditNote(4, ["a", "b"]))).toEqual({ version: 4, continued: false, changes: ["a", "b"] });
    const cont = draftEditNote(5, ["c"], { continued: true });
    expect(cont).toBe("Edited the draft by hand (v5, continued): c.");
    expect(parseDraftEditNote(cont)).toEqual({ version: 5, continued: true, changes: ["c"] });
    const undone = draftEditNote(5, ["c"], { undone: true });
    expect(undone).toBe("Edited the draft by hand (v5): changes undone, the draft is back to v4.");
    expect(parseDraftEditNote(undone)?.changes).toEqual([]);
    expect(parseDraftEditNote("Why is this better?")).toBeNull();
  });

  test("folding accumulates the label and the note", () => {
    const first = { revisionMessage: draftEditRevisionMessage(["a"]), note: draftEditNote(3, ["a"]) };
    const inPlace = foldDraftEdit({ version: 3, revisionMessage: first.revisionMessage, lastNote: first.note, changes: ["b"], same: false });
    expect(inPlace).toEqual({ revisionMessage: "Edited by you: a; b", note: "Edited the draft by hand (v3): a; b." });

    const after = foldDraftEdit({ version: 3, revisionMessage: inPlace.revisionMessage, lastNote: null, changes: ["c"], same: false });
    expect(after).toEqual({ revisionMessage: "Edited by you: a; b; c", note: "Edited the draft by hand (v3, continued): c." });

    const more = foldDraftEdit({ version: 3, revisionMessage: after.revisionMessage, lastNote: after.note, changes: ["d"], same: false });
    expect(more.note).toBe("Edited the draft by hand (v3, continued): c; d.");

    const undone = foldDraftEdit({ version: 3, revisionMessage: more.revisionMessage, lastNote: more.note, changes: ["undid the last hand edit"], same: true });
    expect(undone).toEqual({
      revisionMessage: "Edited by you: changes undone",
      note: "Edited the draft by hand (v3, continued): changes undone, the draft is back to v2.",
    });
    // Editing on from "changes undone" starts a fresh list.
    expect(foldDraftEdit({ version: 3, revisionMessage: undone.revisionMessage, lastNote: undone.note, changes: ["e"], same: false })).toEqual({
      revisionMessage: "Edited by you: e",
      note: "Edited the draft by hand (v3, continued): e.",
    });
  });

  test("works on proxied drafts (Svelte $state), which structuredClone refuses", () => {
    const d = base();
    const proxied = new Proxy(d, {}) as AiProgramDraft;
    expect(() => structuredClone(proxied)).toThrow();
    expect(applyDraftEdit(proxied, [{ op: "leave", ref: r(1, 3) }]).changed).toBe(true);
  });

  test("the input draft is never mutated", () => {
    const d = base();
    const copy = structuredClone(d);
    applyDraftEdit(d, [{ op: "group", refs: [r(1, 1), r(1, 5)] }]);
    expect(d).toEqual(copy);
  });
});

describe("weeks", () => {
  const twoWeeks = (): AiProgramDraft => {
    const d = draft([aux("A"), aux("B")]);
    return { ...d, weeks: [d.weeks[0], { week: 2, sessions: structuredClone(d.weeks[0].sessions) }] };
  };

  test("an op edits only its week, and its undo names that week", () => {
    const d = twoWeeks();
    const res = applyDraftEdit(d, [{ op: "move", refs: [{ day: 1, slot: 2 }], dir: "up", week: 2 }]);
    expect(shape(res.draft)).toBe("A·B");
    expect(res.draft.weeks[1].sessions[0].exercises.map((e) => e.exerciseName)).toEqual(["B", "A"]);
    expect(res.changes[0]).toEndWith("(W2)");
    expect(res.inverse).toMatchObject({ op: "restore", week: 2 });
    const back = applyDraftEdit(res.draft, [res.inverse], undefined, { keepOrder: true });
    expect(back.draft.weeks[1].sessions[0].exercises.map((e) => e.exerciseName)).toEqual(["A", "B"]);
  });

  test("one request edits one week", () => {
    const d = twoWeeks();
    expect(() =>
      applyDraftEdit(d, [
        { op: "move", refs: [{ day: 1, slot: 2 }], dir: "up", week: 1 },
        { op: "move", refs: [{ day: 1, slot: 2 }], dir: "up", week: 2 },
      ])
    ).toThrow(DraftEditError);
  });
});
