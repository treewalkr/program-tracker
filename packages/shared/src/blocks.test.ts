import { describe, expect, test } from "bun:test";
import { blockOf, mainWork, moveToBlock, orderByBlock, prepTag, sessionBlocks } from "./blocks";
import { DraftExerciseRef } from "./ai";
import { deloadWeek } from "./deload";
import { blockIssues, ProgramSession, sessionsPatternBalance, sortExercisesByRole, type ProgramWeek } from "./domain";
import { moveUnit, normalizeGroups } from "./groups";
import { plannedVolume } from "./load";
import { mainLiftIds } from "./metrics";
import { sessionFocus } from "./placement";
import { progressExercise } from "./progression";
import { BUILTIN_ROLE_LABELS, fixDraftRoles } from "./roles";

const set = (n: number) => ({ setNumber: n, type: "working" as const, reps: 8, amrap: false });
const ex = (id: string, o: { block?: "prep" | "main"; role?: string; group?: string; sets?: number } = {}) => ({
  id,
  exerciseId: id,
  order: 0,
  prescribedSets: Array.from({ length: o.sets ?? 3 }, (_, i) => set(i + 1)),
  ...(o.block ? { block: o.block } : {}),
  ...(o.role ? { role: o.role } : {}),
  ...(o.group ? { group: o.group } : {}),
});
const ids = (l: { id: string }[]) => l.map((e) => e.id).join(",");
const session = (exercises: unknown[]) => ({ id: "s", name: "Day", seq: 1, order: 0, kind: "exercises", exercises });

describe("blockOf", () => {
  test("absent block reads as main", () => {
    expect(blockOf({})).toBe("main");
    expect(blockOf({ role: "primary" })).toBe("main");
  });
  test("the legacy movement_prep role reads as prep", () => {
    expect(blockOf({ role: "movement_prep" })).toBe("prep");
  });
  test("an explicit block wins over the role", () => {
    expect(blockOf({ role: "movement_prep", block: "main" })).toBe("main");
    expect(blockOf({ role: "mobility", block: "prep" })).toBe("prep");
  });
});

describe("sessionBlocks / mainWork", () => {
  test("splits one list into the two views", () => {
    const list = [ex("a", { block: "prep" }), ex("b", { role: "movement_prep" }), ex("c"), ex("d", { block: "main" })];
    const v = sessionBlocks({ exercises: list });
    expect(ids(v.movementPrep)).toBe("a,b");
    expect(ids(v.mainWork)).toBe("c,d");
    expect(ids(mainWork(list))).toBe("c,d");
  });
});

describe("prepTag", () => {
  test("ticked of the session's prep items; none without prep", () => {
    const list = [ex("p1", { block: "prep" }), ex("p2", { role: "movement_prep" }), ex("m1")];
    expect(prepTag(list, ["p2", "m1", "gone"])).toBe("Prep 1/2");
    expect(prepTag([ex("m1")], [])).toBeNull();
    expect(prepTag(null, null)).toBeNull();
  });
});

describe("orderByBlock", () => {
  test("puts prep first, stable, and renumbers order", () => {
    const out = orderByBlock([ex("m1"), ex("p1", { block: "prep" }), ex("m2"), ex("p2", { block: "prep" })]);
    expect(ids(out)).toBe("p1,p2,m1,m2");
    expect(out.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });
  test("an ordered list comes back untouched", () => {
    const list = [{ ...ex("p", { block: "prep" }), order: 5 }, ex("m")];
    expect(orderByBlock(list).map((e) => e.order)).toEqual([5, 0]);
  });
});

describe("moveToBlock", () => {
  test("moves to the end of main work and leaves its superset", () => {
    const list = normalizeGroups([ex("p1", { block: "prep", group: "A" }), ex("p2", { block: "prep", group: "A" }), ex("m1")]);
    const out = normalizeGroups(moveToBlock(list, 0, "main"));
    expect(ids(out)).toBe("p2,m1,p1");
    expect(out.map((e) => e.group ?? "-").join("")).toBe("---");
    expect(out[2].block).toBe("main");
  });
  test("moves to the end of movement prep", () => {
    const out = moveToBlock([ex("p1", { block: "prep" }), ex("m1"), ex("m2")], 2, "prep");
    expect(ids(out)).toBe("p1,m2,m1");
    expect(out.map((e) => e.order)).toEqual([0, 1, 2]);
  });
});

describe("moveUnit stays inside its block", () => {
  test("main never moves above prep, prep never below main", () => {
    const list = [ex("p1", { block: "prep" }), ex("m1"), ex("m2")];
    expect(ids(moveUnit(list, 1, -1))).toBe("p1,m1,m2");
    expect(ids(moveUnit(list, 0, 1))).toBe("p1,m1,m2");
    expect(ids(moveUnit(list, 2, -1))).toBe("p1,m2,m1");
  });
});

describe("ProgramSession block rules", () => {
  test("prep is sorted before main on the way in", () => {
    const s = ProgramSession.parse(session([ex("m1"), ex("p1", { block: "prep" })]));
    expect(ids(s.exercises)).toBe("p1,m1");
    expect(s.exercises.map((e) => e.order)).toEqual([0, 1]);
  });
  test("a superset spanning the boundary is split", () => {
    const s = ProgramSession.parse(
      session([ex("p1", { block: "prep", group: "A" }), ex("p2", { block: "prep", group: "A" }), ex("m1", { group: "A" }), ex("m2", { group: "A" })])
    );
    expect(s.exercises.map((e) => e.group).join("")).toBe("AABB");
  });
  test("a lone member left on one side is ungrouped", () => {
    const s = ProgramSession.parse(session([ex("p1", { block: "prep", group: "A" }), ex("m1", { group: "A" }), ex("m2")]));
    expect(s.exercises.map((e) => e.group ?? "-").join("")).toBe("---");
  });
  test("a circuit inside prep is fine", () => {
    const s = ProgramSession.parse(
      session([ex("p1", { block: "prep", group: "A" }), ex("p2", { block: "prep", group: "A" }), ex("p3", { block: "prep", group: "A" }), ex("m1")])
    );
    expect(s.exercises.map((e) => e.group ?? "-").join("")).toBe("AAA-");
  });
  test("needs at least one main exercise", () => {
    expect(ProgramSession.safeParse(session([ex("p1", { block: "prep" })])).success).toBe(false);
  });
  test("a legacy session of only movement_prep labels still parses", () => {
    expect(ProgramSession.safeParse(session([ex("p1", { role: "movement_prep" })])).success).toBe(true);
  });
  test("caps: prep ≤ 8, main ≤ 20", () => {
    const prep = (n: number) => Array.from({ length: n }, (_, i) => ex(`p${i}`, { block: "prep" }));
    const main = (n: number) => Array.from({ length: n }, (_, i) => ex(`m${i}`));
    expect(ProgramSession.safeParse(session([...prep(8), ...main(20)])).success).toBe(true);
    expect(ProgramSession.safeParse(session([...prep(9), ...main(1)])).success).toBe(false);
    expect(ProgramSession.safeParse(session(main(21))).success).toBe(false);
    expect(blockIssues([...prep(9), ...main(1)])).toEqual(["movement prep holds at most 8 exercises"]);
  });
  test("a bad block value fails the write", () => {
    expect(ProgramSession.safeParse(session([{ ...ex("m"), block: "warmup" }])).success).toBe(false);
  });
});

describe("sortExercisesByRole", () => {
  test("never sorts prep into main", () => {
    const out = sortExercisesByRole([ex("acc", { role: "accessory" }), ex("prim", { role: "primary" }), ex("mob", { role: "mobility", block: "prep" })]);
    expect(ids(out)).toBe("mob,prim,acc");
  });
  test("a Primary placed in prep stays in prep", () => {
    const out = sortExercisesByRole([ex("acc", { role: "accessory" }), ex("pw", { role: "power", block: "prep" })]);
    expect(ids(out)).toBe("pw,acc");
    const out2 = sortExercisesByRole([ex("pw", { role: "power", block: "prep" }), ex("prim", { role: "primary" })]);
    expect(ids(out2)).toBe("pw,prim");
  });
});

describe("DraftExerciseRef.block", () => {
  test("keeps a valid block, drops a bad one", () => {
    const base = { exerciseName: "Band pull-apart", prescribedSets: [set(1)] };
    expect(DraftExerciseRef.parse({ ...base, block: "prep" }).block).toBe("prep");
    expect(DraftExerciseRef.parse({ ...base, block: "warmup" }).block).toBeUndefined();
  });
});

describe("every planned counter ignores prep", () => {
  const loaded = (id: string, o: { block?: "prep"; role?: string } = {}) => ({
    ...ex(id, o),
    prescribedSets: [1, 2, 3].map((n) => ({ ...set(n), targetWeightKg: 100 })),
  });
  const pattern = (id: string) => (id.startsWith("sq") ? "knee_dominant" : id.startsWith("bp") ? "horizontal_push" : null);
  const lower = { kind: "exercises", exercises: [loaded("band", { block: "prep" }), loaded("sq")] };

  test("sessionsPatternBalance and plannedVolume", () => {
    const b = sessionsPatternBalance([{ exercises: [loaded("bp1", { block: "prep" }), loaded("sq")] }], pattern);
    expect(b.push).toBe(0);
    expect(b.knee).toBe(3);
    expect(plannedVolume([lower], null)).toBe(2400);
  });
  test("sessionFocus", () => {
    const s = { kind: "exercises" as const, exercises: [loaded("bp1", { block: "prep" }), loaded("bp2", { block: "prep" }), loaded("sq")] } as never;
    expect(sessionFocus(s, pattern)).toBe("lower");
  });
  test("mainLiftIds", () => {
    const program = { weeks: [{ week: 1, sessions: [{ exercises: [loaded("pw", { block: "prep", role: "power" }), loaded("sq", { role: "primary" })] }] }] } as never;
    expect([...(mainLiftIds(program) ?? [])]).toEqual(["sq"]);
  });
  test("fixDraftRoles' more-than-one-Primary note counts main only", () => {
    const draft = {
      rationale: "",
      weeks: [
        {
          sessions: [
            {
              name: "Lower",
              exercises: [
                { exerciseName: "Squat jump", role: "primary" as const, block: "prep", prescribedSets: [set(1)] },
                { exerciseName: "Squat", role: "primary" as const, prescribedSets: [set(1)] },
              ],
            },
          ],
        },
      ],
    };
    expect(fixDraftRoles(draft, BUILTIN_ROLE_LABELS).notes).toEqual([]);
  });
  test("fixDraftRoles turns a movement_prep label into block prep plus a spec role, listed first", () => {
    const draft = {
      rationale: "",
      weeks: [
        {
          sessions: [
            {
              name: "Lower",
              exercises: [
                { exerciseName: "Back Squat", role: "primary" as const, prescribedSets: [set(1)] },
                { exerciseName: "Hip CARs", role: "movement_prep" as const, prescribedSets: [set(1)] },
              ],
            },
          ],
        },
      ],
    };
    const out = fixDraftRoles(draft, BUILTIN_ROLE_LABELS).draft.weeks[0].sessions[0].exercises;
    expect(out.map((e) => [e.exerciseName, (e as { block?: string }).block ?? "main", e.role])).toEqual([
      ["Hip CARs", "prep", "mobility"],
      ["Back Squat", "main", "primary"],
    ]);
  });
  test("fixDraftRoles keeps a draft savable: prep past the cap, or prep alone, goes to main", () => {
    const draftOf = (exercises: { exerciseName: string; role: "mobility"; block: string; prescribedSets: ReturnType<typeof set>[] }[]) => ({
      rationale: "",
      weeks: [{ sessions: [{ name: "Day", exercises }] }],
    });
    const prep = (n: number) => Array.from({ length: n }, (_, i) => ({ exerciseName: `p${i}`, role: "mobility" as const, block: "prep", prescribedSets: [set(1)] }));
    const capped = fixDraftRoles(draftOf([...prep(10), { ...prep(1)[0], exerciseName: "m", block: "main" }]), BUILTIN_ROLE_LABELS).draft.weeks[0].sessions[0].exercises;
    expect(capped.map((e) => e.block).join(",")).toBe([...Array(8).fill("prep"), "main", "main", "main"].join(","));
    expect(ProgramSession.safeParse(session(capped.map((e, i) => ({ ...ex(`x${i}`), block: e.block })))).success).toBe(true);
    const alone = fixDraftRoles(draftOf(prep(2)), BUILTIN_ROLE_LABELS).draft.weeks[0].sessions[0].exercises;
    expect(alone.map((e) => e.block)).toEqual(["main", "main"]);
  });
  test("deload and progression leave prep as planned", () => {
    const w = {
      week: 4,
      sessions: [{ id: "s", name: "Lower", seq: 1, order: 0, kind: "exercises" as const, exercises: [loaded("band", { block: "prep" }), loaded("sq")] }],
    } as ProgramWeek;
    const out = deloadWeek(w).sessions[0].exercises;
    expect(out[0].prescribedSets).toEqual(w.sessions[0].exercises[0].prescribedSets);
    expect(out[1].prescribedSets).not.toEqual(w.sessions[0].exercises[1].prescribedSets);
    const prep = w.sessions[0].exercises[0];
    expect(progressExercise(prep, { kind: "kg", amount: 5 }).prescribedSets).toEqual(prep.prescribedSets);
    expect(progressExercise(w.sessions[0].exercises[1], { kind: "kg", amount: 5 }).prescribedSets[0].targetWeightKg).toBe(105);
  });
});
