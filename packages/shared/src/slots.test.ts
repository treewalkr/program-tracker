import { expect, test } from "bun:test";
import { diffDraftSlots, rxLabel, unproposedChanges, type SlotDiffDraft } from "./slots";

const set = (reps: number, rpe: number, rest: number) => ({ reps, targetRpe: rpe, restSeconds: rest });
const ex = (name: string, sets = [set(5, 7, 120)]) => ({ exerciseName: name, prescribedSets: sets });
const draft = (...days: ReturnType<typeof ex>[][]): SlotDiffDraft => ({ sessions: days.map((exercises, i) => ({ name: `Day ${i + 1}`, exercises })) });

test("rxLabel", () => {
  expect(rxLabel([set(5, 7, 180), set(5, 8, 180)])).toBe("2×5 @RPE 7–8 · rest 180s");
  expect(rxLabel([{ reps: 0, durationSeconds: 45, targetRpe: 7, restSeconds: 60 }])).toBe("1×45s @RPE 7 · rest 60s");
});

test("diffDraftSlots covers swap, rx, added, removed", () => {
  const before = draft([ex("Squat"), ex("RDL"), ex("Plank")], [ex("Bench"), ex("Row")]);
  const after = draft([ex("Paused Squat"), ex("RDL", [set(5, 7, 150)]), ex("Plank")], [ex("Bench"), ex("Row"), ex("Face Pull")]);
  expect(diffDraftSlots(before, after)).toEqual([
    { day: 1, beforeSlot: 1, afterSlot: 1, kind: "swap", exercise: "Paused Squat", from: "Squat", to: "Paused Squat" },
    { day: 1, beforeSlot: 2, afterSlot: 2, kind: "rx", exercise: "RDL", from: "rest 120s", to: "rest 150s" },
    { day: 2, beforeSlot: null, afterSlot: 3, kind: "added", exercise: "Face Pull", from: null, to: "1×5 @RPE 7 · rest 120s" },
  ]);
  const removed = diffDraftSlots(draft([ex("A"), ex("B"), ex("C")]), draft([ex("A"), ex("C")]));
  expect(removed).toEqual([{ day: 1, beforeSlot: 2, afterSlot: null, kind: "removed", exercise: "B", from: "1×5 @RPE 7 · rest 120s", to: null }]);
});

test("unproposedChanges", () => {
  const before = draft([ex("Squat"), ex("RDL")]);
  const after = draft([ex("Paused Squat"), ex("RDL", [set(5, 7, 150)])]);
  const extra = unproposedChanges(diffDraftSlots(before, after), { changes: [{ day: 1, slot: 1, kind: "swap" }] });
  expect(extra.map((c) => c.exercise)).toEqual(["RDL"]);
});
