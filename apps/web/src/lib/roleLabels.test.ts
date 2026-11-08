import { describe, expect, test } from "bun:test";
import { BUILTIN_ROLE_LABELS, mergeRoleLabels } from "@pt/shared";
import { canCreateLabel, groupRoleLabels, roleDisplay, searchRoleLabels, suggestRoleIn } from "./roleLabels";

const id = "11111111-1111-4111-8111-111111111111";
const gone = "22222222-2222-4222-8222-222222222222";
const labels = mergeRoleLabels([
  { id, builtinKey: null, name: "Speed", chip: "Spd", description: "Fast, light reps.", rank: 150, archivedAt: null },
  { id: gone, builtinKey: null, name: "Old", chip: null, description: "Retired.", rank: 160, archivedAt: "2026-01-01" },
]);

describe("searchRoleLabels", () => {
  test("empty query → every active label by rank", () => {
    expect(searchRoleLabels(labels, "").map((l) => l.name)).toEqual(["Power", "Speed", "Primary", "Secondary", "Strength", "Auxiliary", "Core"]);
  });
  test("matches name, chip and meaning; name hits first", () => {
    expect(searchRoleLabels(labels, "aux").map((l) => l.name)).toEqual(["Auxiliary"]);
    expect(searchRoleLabels(labels, "str").map((l) => l.name)[0]).toBe("Strength");
    expect(searchRoleLabels(labels, "trunk").map((l) => l.name)).toEqual(["Core"]);
    expect(searchRoleLabels(labels, "spd").map((l) => l.name)).toEqual(["Speed"]);
    expect(searchRoleLabels(labels, "heavy loads").map((l) => l.name)).toEqual(["Strength"]);
  });
  test("archived labels never show", () => {
    expect(searchRoleLabels(labels, "old")).toEqual([]);
  });
});

describe("groupRoleLabels", () => {
  test("priority, training quality, body region, then the trainer's own", () => {
    const groups = groupRoleLabels(searchRoleLabels(labels, ""));
    expect(groups.map((g) => [g.label, g.items.map((l) => l.name)])).toEqual([
      ["Priority", ["Primary", "Secondary", "Auxiliary"]],
      ["Training quality", ["Power", "Strength"]],
      ["Body region", ["Core"]],
      ["Your labels", ["Speed"]],
    ]);
  });
  test("no own labels → no 'Your labels' group", () => {
    expect(groupRoleLabels(BUILTIN_ROLE_LABELS).map((g) => g.label)).not.toContain("Your labels");
  });
});

describe("canCreateLabel", () => {
  test("only for a new, non-empty name", () => {
    expect(canCreateLabel(labels, "")).toBe(false);
    expect(canCreateLabel(labels, " speed ")).toBe(false);
    expect(canCreateLabel(labels, "Tempo")).toBe(true);
    // an archived name can be made again (the API restores it)
    expect(canCreateLabel(labels, "Old")).toBe(true);
  });
});

describe("roleDisplay", () => {
  test("built-ins, own labels, archived and unknown roles all read", () => {
    expect(roleDisplay("strength", labels)).toMatchObject({ chip: "Str", name: "Strength" });
    expect(roleDisplay("accessory", labels)).toMatchObject({ chip: "Aux", name: "Auxiliary" });
    expect(roleDisplay(`label:${id}`, labels)).toMatchObject({ chip: "Spd", description: "Fast, light reps." });
    expect(roleDisplay(`label:${gone}`, labels)).toMatchObject({ chip: "Old" });
    expect(roleDisplay("label:33333333-3333-4333-8333-333333333333", labels).chip).toBe("Label");
  });
});

describe("suggestRoleIn", () => {
  const catalog = [
    { id: "sq", name: "Back Squat", primaryMuscleGroup: "quads", equipment: "barbell", movementPattern: "knee_dominant" },
    { id: "pl", name: "Plank", primaryMuscleGroup: "core", equipment: "bodyweight", movementPattern: "anti_extension" },
    { id: "rdl", name: "Romanian Deadlift", primaryMuscleGroup: "hamstrings", equipment: "barbell", movementPattern: "hip_dominant" },
  ];
  const five = [{ reps: 5, type: "working" }];
  test("reads the catalog for the session's exercises", () => {
    const session = [
      { exerciseId: "sq", prescribedSets: five },
      { exerciseId: "rdl", prescribedSets: five },
      { exerciseId: "pl", prescribedSets: [{ reps: 0 }] },
      { exerciseId: "x", exerciseName: "Cable Curl", prescribedSets: [{ reps: 12 }] },
    ];
    expect(session.map((_, i) => suggestRoleIn(session, i, catalog))).toEqual(["primary", "secondary", "core", "accessory"]);
  });
});
