import { describe, expect, test } from "bun:test";
import { applyDraftEdit, type AiProgramDraft } from "@pt/shared";
import { followSelection, moveTargets, rowMenuItems, selectionActions } from "./draftEditMenu";

const set = (n: number) => ({ setNumber: n, type: "working" as const, reps: 8, amrap: false });
const ex = (name: string, role: string, group?: string) => ({
  exerciseName: name,
  role,
  prescribedSets: [set(1), set(2), set(3)],
  ...(group ? { group } : {}),
});

const draft: AiProgramDraft = {
  name: "Block",
  rationale: "",
  clientSummary: "",
  weeks: [{ week: 1, sessions: [
    {
      name: "Lower",
      kind: "lifting",
      exercises: [ex("Squat", "primary"), ex("Curl", "accessory", "A"), ex("Extension", "accessory", "A"), ex("Plank", "core")],
    },
    { name: "Run", kind: "cardio", exercises: [], cardio: { modality: "run", durationMin: 30 } },
    { name: "Upper", kind: "lifting", exercises: [ex("Bench", "primary"), ex("Row", "strength")] },
  ] }],
} as AiProgramDraft;

const labelsOf = (items: { label: string; disabled?: boolean; section?: string }[]) =>
  items.map((i) => `${i.disabled ? "(off) " : ""}${i.section ? `${i.section} › ` : ""}${i.label}`);

describe("row menu", () => {
  test("a superset's edge member: moves, superset, leave and move-to offered", () => {
    const items = rowMenuItems(draft, { day: 1, slot: 2 }, () => {});
    expect(labelsOf(items)).toEqual([
      "Move up",
      "Move down",
      "Superset with Squat",
      "Leave superset A",
      "Move to › Session 2 · Upper",
    ]);
  });

  test("cardio sessions are never targets; the top row can't move up", () => {
    const items = rowMenuItems(draft, { day: 3, slot: 1 }, () => {});
    expect(labelsOf(items)).toEqual([
      "(off) Move up",
      "Move down",
      "Superset with Row",
      "Move to › Session 1 · Lower",
    ]);
    expect(moveTargets(draft).map((t) => t.day)).toEqual([1, 3]);
  });

  test("moves across roles: the top Primary can move down, and Row can move up past it", () => {
    expect(labelsOf(rowMenuItems(draft, { day: 3, slot: 2 }, () => {})).slice(0, 2)).toEqual(["Move up", "(off) Move down"]);
    expect(labelsOf(rowMenuItems(draft, { day: 1, slot: 1 }, () => {})).slice(0, 2)).toEqual(["(off) Move up", "Move down"]);
    expect(selectionActions(draft, [{ day: 1, slot: 4 }]).up).not.toBeNull();
  });

  test("a trainer-ordered draft is offered moves as stored: Primary below Str can move up", () => {
    const w = draft.weeks[0].sessions;
    const d = { ...draft, weeks: [{ week: 1, sessions: [w[0], w[1], { ...w[2], exercises: [ex("Row", "strength"), ex("Bench", "primary")] }] }] };
    const keep = { keepOrder: true };
    expect(labelsOf(rowMenuItems(d, { day: 3, slot: 2 }, () => {}, undefined, keep)).slice(0, 3)).toEqual([
      "Move up",
      "(off) Move down",
      "Superset with Row",
    ]);
    // Without keepOrder the same rows show role-sorted: Bench on top.
    expect(labelsOf(rowMenuItems(d, { day: 3, slot: 2 }, () => {})).slice(0, 3)).toEqual([
      "(off) Move up",
      "Move down",
      "Superset with Row",
    ]);
  });

  test("picking an item runs its op", () => {
    let ran: unknown = null;
    rowMenuItems(draft, { day: 1, slot: 2 }, (ops) => (ran = ops))
      .find((i) => i.label === "Leave superset A")!
      .onselect();
    expect(ran).toEqual([{ op: "leave", ref: { day: 1, slot: 2 } }]);
  });
});

describe("select bar", () => {
  test("superset needs 2+ rows in one session", () => {
    expect(selectionActions(draft, [{ day: 1, slot: 4 }]).superset).toBeNull();
    expect(selectionActions(draft, [{ day: 1, slot: 4 }, { day: 3, slot: 2 }]).superset).toBeNull();
    expect(selectionActions(draft, [{ day: 1, slot: 3 }, { day: 1, slot: 4 }]).superset).toEqual({
      op: "group",
      refs: [{ day: 1, slot: 3 }, { day: 1, slot: 4 }],
    });
  });

  test("move-to is off where it would empty a session", () => {
    const acts = selectionActions(draft, [{ day: 3, slot: 1 }, { day: 3, slot: 2 }]);
    expect(acts.moveTo.map((t) => [t.label, t.disabled])).toEqual([
      ["Session 1 · Lower", true],
      ["Session 2 · Upper", true],
    ]);
  });

  test("ticked rows follow their exercises to the new version", () => {
    const res = applyDraftEdit(draft, [{ op: "moveTo", refs: [{ day: 1, slot: 4 }], day: 3 }]);
    expect(followSelection(["1:4", "1:1"], [res.inverse])).toEqual(["3:3", "1:1"]);
  });
});
