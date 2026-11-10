import { describe, expect, test } from "bun:test";
import {
  dissolveGroup,
  exerciseUnits,
  groupIssues,
  groupKind,
  groupTag,
  linkWithNext,
  moveUnit,
  normalizeGroups,
  setGroupRounds,
  unlink,
  withSetCount,
} from "./groups";
import { ProgramSession, sortExercisesByRole } from "./domain";

const set = (n: number, reps = 8) => ({ setNumber: n, type: "working" as const, reps, amrap: false });
const ex = (id: string, sets = 3, group?: string, role?: string) => ({
  id,
  exerciseId: id,
  order: 0,
  prescribedSets: Array.from({ length: sets }, (_, i) => set(i + 1)),
  ...(group ? { group } : {}),
  ...(role ? { role } : {}),
});
const ids = (l: { id: string }[]) => l.map((e) => e.id).join(",");
const groups = (l: { group?: string | null }[]) => l.map((e) => e.group ?? "-").join("");

describe("exerciseUnits", () => {
  test("groups consecutive letters, ungrouped alone", () => {
    const u = exerciseUnits([ex("a"), ex("b", 3, "A"), ex("c", 3, "A"), ex("d")]);
    expect(u.map((x) => [x.group ?? "-", x.start, x.items.length])).toEqual([
      ["-", 0, 1],
      ["A", 1, 2],
      ["-", 3, 1],
    ]);
  });
});

describe("normalizeGroups", () => {
  test("re-letters by appearance", () => {
    expect(groups(normalizeGroups([ex("a", 3, "C"), ex("b", 3, "C"), ex("c", 3, "A"), ex("d", 3, "A")]))).toBe("AABB");
  });
  test("drops one-member groups", () => {
    const out = normalizeGroups([ex("a", 3, "A"), ex("b"), ex("c", 3, "B"), ex("d", 3, "B")]);
    expect(groups(out)).toBe("--AA");
    expect("group" in out[0]).toBe(false);
  });
  test("brings set counts up to the largest", () => {
    const out = normalizeGroups([ex("a", 2, "A"), ex("b", 4, "A")]);
    expect(out.map((e) => e.prescribedSets.length)).toEqual([4, 4]);
    expect(out[0].prescribedSets.map((s) => s.setNumber)).toEqual([1, 2, 3, 4]);
  });
  test("a split letter becomes separate units", () => {
    expect(groups(normalizeGroups([ex("a", 3, "A"), ex("b", 3, "A"), ex("c"), ex("d", 3, "A"), ex("e", 3, "A")]))).toBe("AA-BB");
  });
});

describe("tags and kinds", () => {
  test("groupTag", () => {
    const l = [ex("a"), ex("b", 3, "A"), ex("c", 3, "A")];
    expect([0, 1, 2].map((i) => groupTag(l, i))).toEqual([null, "A1", "A2"]);
  });
  test("groupKind", () => {
    expect(groupKind(2)).toBe("Superset");
    expect(groupKind(3)).toBe("Circuit");
  });
});

describe("setGroupRounds", () => {
  test("changes every member, nobody else", () => {
    const out = setGroupRounds([ex("a", 3, "A"), ex("b", 3, "A"), ex("c", 3)], "A", 5);
    expect(out.map((e) => e.prescribedSets.length)).toEqual([5, 5, 3]);
  });
  test("withSetCount clamps and renumbers", () => {
    expect(withSetCount([set(1), set(2)], 0).length).toBe(1);
    expect(withSetCount([set(1)], 30).length).toBe(20);
  });
});

describe("link / unlink", () => {
  test("link two ungrouped makes a group with synced rounds", () => {
    const out = linkWithNext([ex("a", 2), ex("b", 4), ex("c")], 0);
    expect(groups(out)).toBe("AA-");
    expect(out[0].prescribedSets.length).toBe(4);
  });
  test("link from a group grows it", () => {
    expect(groups(linkWithNext([ex("a", 3, "A"), ex("b", 3, "A"), ex("c")], 1))).toBe("AAA");
  });
  test("link two groups merges them", () => {
    expect(groups(linkWithNext([ex("a", 3, "A"), ex("b", 3, "A"), ex("c", 3, "B"), ex("d", 3, "B")], 0))).toBe("AAAA");
  });
  test("link on the last exercise does nothing", () => {
    expect(groups(linkWithNext([ex("a"), ex("b")], 1))).toBe("--");
  });
  test("unlink a middle member moves it after the group", () => {
    const out = unlink([ex("a", 3, "A"), ex("b", 3, "A"), ex("c", 3, "A"), ex("d")], 1);
    expect(ids(out)).toBe("a,c,b,d");
    expect(groups(out)).toBe("AA--");
    expect(out.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });
  test("unlink in a pair dissolves the group", () => {
    expect(groups(unlink([ex("a", 3, "A"), ex("b", 3, "A")], 0))).toBe("--");
  });
});

describe("moveUnit", () => {
  const l = () => [ex("x"), ex("a", 3, "A"), ex("b", 3, "A"), ex("y")];
  test("member moves inside its group", () => {
    expect(ids(moveUnit(l(), 1, 1))).toBe("x,b,a,y");
  });
  test("member stops at the group edge", () => {
    expect(ids(moveUnit(l(), 1, -1))).toBe("x,a,b,y");
    expect(ids(moveUnit(l(), 2, 1))).toBe("x,a,b,y");
  });
  test("ungrouped jumps over a whole group", () => {
    expect(ids(moveUnit(l(), 0, 1))).toBe("a,b,x,y");
    expect(ids(moveUnit(l(), 3, -1))).toBe("x,y,a,b");
  });
  test("whole group moves as a unit", () => {
    const out = moveUnit(l(), 2, -1, "unit");
    expect(ids(out)).toBe("a,b,x,y");
    expect(out.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });
  test("edges are no-ops", () => {
    expect(ids(moveUnit(l(), 0, -1))).toBe("x,a,b,y");
    expect(ids(moveUnit(l(), 3, 1))).toBe("x,a,b,y");
  });
});

describe("sortExercisesByRole with groups", () => {
  test("a group sorts as one unit by its best member, inner order kept", () => {
    const out = sortExercisesByRole([
      ex("core", 3, undefined, "core"),
      ex("acc", 3, "A", "accessory"),
      ex("main", 3, "A", "primary"),
      ex("sec", 3, undefined, "secondary"),
    ]);
    expect(ids(out)).toBe("acc,main,sec,core");
  });
});

describe("ProgramSession group rules", () => {
  const session = (exercises: ReturnType<typeof ex>[]) => ({
    id: "s",
    name: "S",
    seq: 1,
    order: 0,
    kind: "lifting",
    exercises: exercises.map((e, i) => ({ ...e, order: i })),
  });
  test("accepts a valid group", () => {
    expect(ProgramSession.safeParse(session([ex("a", 3, "A"), ex("b", 3, "A")])).success).toBe(true);
  });
  const tidy = (list: ReturnType<typeof ex>[]) => {
    const r = ProgramSession.safeParse(session(list));
    if (!r.success) throw new Error("expected success");
    return r.data.exercises;
  };
  test("tidies a split group into two groups", () => {
    expect(groups(tidy([ex("a", 3, "A"), ex("b", 3, "A"), ex("c"), ex("d", 3, "A"), ex("e", 3, "A")]))).toBe("AA-BB");
  });
  test("drops a one-member group", () => {
    expect(groups(tidy([ex("a", 3, "A"), ex("b")]))).toBe("--");
  });
  test("evens unequal set counts up to the largest", () => {
    expect(tidy([ex("a", 3, "A"), ex("b", 2, "A")]).map((e) => e.prescribedSets.length)).toEqual([3, 3]);
  });
  test("re-letters a non-letter group", () => {
    expect(groups(tidy([ex("a", 3, "A1"), ex("b", 3, "A1")]))).toBe("AA");
  });
  test("groupIssues still names each problem", () => {
    expect(groupIssues([ex("a", 3, "A"), ex("b", 2, "A"), ex("c"), ex("d", 3, "A")])).toEqual([
      "group A members must have the same number of sets",
      "group A members must be adjacent",
      "group A needs at least two exercises",
    ]);
  });
});

describe("dissolveGroup", () => {
  test("ungroups every member, leaves other groups", () => {
    const out = dissolveGroup([ex("a", 3, "A"), ex("b", 3, "A"), ex("c", 3, "B"), ex("d", 3, "B")], "A");
    expect(groups(out)).toBe("--BB");
  });
});
