import { describe, expect, test } from "bun:test";
import { sortExercisesByRole } from "./domain";
import {
  BUILTIN_ROLE_LABELS,
  isKnownRole,
  mergeRoleLabels,
  rankAfter,
  resolveRole,
  suggestRole,
  suggestRoles,
  type RoleHints,
} from "./roles";

const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const row = (o: Partial<Parameters<typeof mergeRoleLabels>[0][number]>) => ({
  id: id1,
  builtinKey: null,
  name: "Speed",
  chip: null,
  description: "Fast reps",
  rank: 150,
  archivedAt: null,
  ...o,
});

describe("mergeRoleLabels", () => {
  test("no rows → the six built-ins in default order", () => {
    expect(mergeRoleLabels([]).map((l) => l.name)).toEqual(["Power", "Primary", "Secondary", "Strength", "Auxiliary", "Core"]);
    expect(mergeRoleLabels([]).map((l) => l.chip)).toEqual(["Power", "Primary", "Secondary", "Str", "Aux", "Core"]);
  });

  test("a custom label slots in by rank, chip defaults to its name", () => {
    const merged = mergeRoleLabels([row({})]);
    expect(merged.map((l) => l.name)).toEqual(["Power", "Speed", "Primary", "Secondary", "Strength", "Auxiliary", "Core"]);
    expect(merged[1]).toMatchObject({ key: `label:${id1}`, chip: "Speed", category: null, builtinKey: null, archived: false });
  });

  test("an override row changes a built-in's chip, meaning and rank — never its key or name", () => {
    const merged = mergeRoleLabels([row({ id: id2, builtinKey: "core", name: "ignored", chip: "Trunk", description: "Abs.", rank: 50 })]);
    expect(merged[0]).toMatchObject({ key: "core", name: "Core", chip: "Trunk", description: "Abs.", rank: 50, category: "region" });
    expect(merged.filter((l) => l.key === "core")).toHaveLength(1);
  });

  test("archived labels stay in the list, flagged, and sort last", () => {
    const merged = mergeRoleLabels([row({ archivedAt: new Date().toISOString() })]);
    expect(merged.find((l) => l.id === id1)?.archived).toBe(true);
    expect(isKnownRole(`label:${id1}`, merged)).toBe(false);
    const sorted = sortExercisesByRole(
      [
        { n: "a", role: `label:${id1}` },
        { n: "b", role: "core" },
      ],
      merged
    );
    expect(sorted.map((e) => e.n)).toEqual(["b", "a"]);
  });

  test("sortExercisesByRole follows the merged ranks", () => {
    const merged = mergeRoleLabels([row({ rank: 650 })]);
    const sorted = sortExercisesByRole(
      [
        { n: "speed", role: `label:${id1}` },
        { n: "plank", role: "core" },
        { n: "squat", role: "primary" },
      ],
      merged
    );
    expect(sorted.map((e) => e.n)).toEqual(["squat", "plank", "speed"]);
  });

  test("resolveRole finds built-ins and custom labels; unknown → null", () => {
    const merged = mergeRoleLabels([row({})]);
    expect(resolveRole("strength")?.name).toBe("Strength");
    expect(resolveRole(`label:${id1}`, merged)?.name).toBe("Speed");
    expect(resolveRole(`label:${id2}`, merged)).toBeNull();
    expect(resolveRole(undefined)).toBeNull();
  });
});

describe("rankAfter", () => {
  test("halfway to the next label, or past the last", () => {
    expect(rankAfter(BUILTIN_ROLE_LABELS, "power")).toBe(150);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "core")).toBe(700);
    expect(rankAfter(BUILTIN_ROLE_LABELS)).toBe(700);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "nope")).toBe(700);
  });
  test("skips archived labels", () => {
    const merged = mergeRoleLabels([row({ rank: 150, archivedAt: "2026-01-01" })]);
    expect(rankAfter(merged, "power")).toBe(150);
  });
});

describe("suggestRole", () => {
  const ex = (name: string, o: Partial<RoleHints> = {}): RoleHints => ({ name, ...o });
  const reps = (...r: number[]) => r.map((n) => ({ reps: n, type: "working" }));

  test("explosive names → power, whatever the pattern", () => {
    for (const n of ["Box Jump", "Med Ball Slam", "Power Clean", "Push Jerk", "Snatch Pull", "Bounds", "Sprint 20m", "Plyo Push-up"]) {
      expect(suggestRole(ex(n, { movementPattern: "vertical_push" }), [], 0)).toBe("power");
    }
  });

  test("trunk patterns, core muscle or trunk names → core", () => {
    expect(suggestRole(ex("Pallof Press", { movementPattern: "anti_rotation" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Farmer Walk", { movementPattern: "carry" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Something", { primaryMuscleGroup: "core" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Side Plank"), [], 0)).toBe("core");
    expect(suggestRole(ex("Dead Bug"), [], 0)).toBe("core");
  });

  test("first heavy compound → primary, next → secondary, then strength", () => {
    const session = [
      ex("Box Jump"),
      ex("Back Squat", { movementPattern: "knee_dominant", prescribedSets: reps(5, 5, 5) }),
      ex("Romanian Deadlift", { movementPattern: "hip_dominant", prescribedSets: reps(6) }),
      ex("Bench Press", { movementPattern: "horizontal_push", prescribedSets: reps(5) }),
      ex("Leg Curl", { movementPattern: "isolation", prescribedSets: reps(12) }),
      ex("Plank"),
    ];
    expect(suggestRoles(session)).toEqual(["power", "primary", "secondary", "strength", "accessory", "core"]);
  });

  test("compound work above 6 reps → strength, and doesn't take the primary slot", () => {
    const session = [
      ex("Goblet Squat", { movementPattern: "knee_dominant", prescribedSets: reps(10) }),
      ex("Deadlift", { movementPattern: "hip_dominant", prescribedSets: reps(3) }),
    ];
    expect(suggestRoles(session)).toEqual(["strength", "primary"]);
  });

  test("backoff sets don't decide the heaviness", () => {
    const e = ex("Squat", { movementPattern: "knee_dominant", prescribedSets: [{ reps: 3, type: "working" }, { reps: 10, type: "backoff" }] });
    expect(suggestRole(e, [e], 0)).toBe("primary");
  });

  test("name heuristics without the catalog", () => {
    expect(suggestRoles([ex("Squat"), ex("Bench Press"), ex("Barbell Row"), ex("Bicep Curl"), ex("Lateral Raise"), ex("Mystery Move")])).toEqual([
      "primary",
      "secondary",
      "strength",
      "accessory",
      "accessory",
      "accessory",
    ]);
  });

  test("isolation pattern wins over a compound-sounding name", () => {
    expect(suggestRole(ex("Leg Press Calf Raise", { movementPattern: "isolation" }), [], 0)).toBe("accessory");
  });
});
