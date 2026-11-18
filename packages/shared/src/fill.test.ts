import { describe, expect, test } from "bun:test";
import { fillLockedWeeks, loggedWeeks, newBlockFillBlocker, weekRangeLabel } from "./fill";
import type { SignalProgram } from "./metrics";

const weeks = (n: number, ab = false) =>
  Array.from({ length: n }, (_, i) => ({
    week: i + 1,
    ...(ab ? { rotation: i % 2 ? ("B" as const) : ("A" as const) } : {}),
    sessions: [{ id: `s${i + 1}`, name: "S", seq: 1, order: 0, kind: "exercises" as const, exercises: [] }],
  }));

describe("fill lock rule", () => {
  test("no logs: the first week, or W1 + W2 in an A/B block", () => {
    expect(fillLockedWeeks(weeks(6), [])).toEqual([1]);
    expect(fillLockedWeeks(weeks(6, true), [])).toEqual([1, 2]);
  });
  test("everything up to the last logged week stays", () => {
    expect(fillLockedWeeks(weeks(6), [1, 3])).toEqual([1, 2, 3]);
    expect(fillLockedWeeks(weeks(6, true), [1])).toEqual([1, 2]);
  });
  test("logged weeks come from the logged session, else the log's date", () => {
    const program: SignalProgram = { id: "p", clientId: "c", name: "P", status: "active", weeks: weeks(4) as never, activatedAt: "2026-11-02", createdAt: "2026-11-01" };
    const logs = [
      { programId: "p", programSessionId: "s3", date: "2026-11-02" },
      { programId: "p", programSessionId: null, date: "2026-11-10" },
      { programId: "other", programSessionId: "s4", date: "2026-11-02" },
    ];
    expect(loggedWeeks(program, logs)).toEqual([2, 3]);
  });
  test("a new block can be filled only when some week is left after the trainer's", () => {
    expect(newBlockFillBlocker(2, true)).toContain("W1 and W2 are yours");
    expect(newBlockFillBlocker(3, true)).toBeNull();
    expect(newBlockFillBlocker(1, false)).toContain("W1 is yours");
    expect(newBlockFillBlocker(2, false)).toBeNull();
    expect(newBlockFillBlocker(13, false)).toBe("AI fills blocks of up to 12 weeks");
  });
  test("week labels", () => {
    expect(weekRangeLabel([3, 4, 5, 6])).toBe("W3–W6");
    expect(weekRangeLabel([2])).toBe("W2");
    expect(weekRangeLabel([2, 5])).toBe("W2, W5");
  });
});
