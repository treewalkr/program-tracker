import { describe, expect, test } from "bun:test";
import type { ProgramWeek } from "@pt/shared";
import { isDeloaded, toggleDeload, type DeloadUndo } from "./deloadUndo";

const week = (): ProgramWeek =>
  ({
    week: 4,
    sessions: [
      {
        id: "s1",
        kind: "lifting",
        weekday: 1,
        exercises: [
          {
            exerciseId: "sq",
            prescribedSets: [1, 2, 3, 4].map((n) => ({ setNumber: n, reps: 5, targetWeightKg: 100, setType: "working" })),
          },
        ],
      },
    ],
  }) as unknown as ProgramWeek;

const sets = (w: ProgramWeek) => (w.sessions[0] as any).exercises[0].prescribedSets;

describe("toggleDeload", () => {
  test("a second press undoes instead of deloading again", () => {
    const undo: DeloadUndo = new Map();
    const once = toggleDeload(undo, week());
    expect(sets(once)).toHaveLength(2);
    expect(sets(once)[0].targetWeightKg).toBe(90);
    expect(isDeloaded(undo, once)).toBe(true);

    const back = toggleDeload(undo, once);
    expect(sets(back)).toHaveLength(4);
    expect(sets(back)[0].targetWeightKg).toBe(100);
    expect(isDeloaded(undo, back)).toBe(false);
  });

  test("editing the deloaded week ends the undo window", () => {
    const undo: DeloadUndo = new Map();
    const once = toggleDeload(undo, week());
    sets(once)[0].reps = 6;
    expect(isDeloaded(undo, once)).toBe(false);
  });
});
