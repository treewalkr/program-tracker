import { describe, expect, test } from "bun:test";
import { EXERCISE_ROLE_INFO, sortExercisesByRole } from "./domain";
import { DraftExerciseRef } from "./ai";
import type { ExerciseRole } from "./domain";
import {
  builtinNameTwin,
  overrideRowName,
  BUILTIN_ROLE_LABELS,
  ROLE_LABEL_CHIP_MAX,
  fixDraftRoles,
  isKnownRole,
  mergeRoleLabels,
  rankAfter,
  resolveRole,
  looksLikePrep,
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
  test("no rows → the built-ins in default order", () => {
    expect(mergeRoleLabels([]).map((l) => l.name)).toEqual([
      "Movement Prep",
      "Plyometric",
      "Power",
      "Primary",
      "Secondary",
      "Strength",
      "Strength / Supplemental",
      "Auxiliary",
      "Core",
      "Conditioning",
      "Mobility / Recovery",
    ]);
    expect(mergeRoleLabels([]).map((l) => l.chip)).toEqual(["Prep", "Plyo", "Power", "Primary", "Secondary", "Str", "Supp", "Aux", "Core", "Cond", "Mob"]);
    expect(mergeRoleLabels([]).map((l) => l.category)).toEqual([
      "prep",
      "quality",
      "quality",
      "priority",
      "priority",
      "quality",
      "quality",
      "priority",
      "region",
      "quality",
      "prep",
    ]);
  });

  test("a custom label slots in by rank, chip defaults to its name", () => {
    const merged = mergeRoleLabels([row({})]);
    expect(merged.map((l) => l.name).slice(0, 5)).toEqual(["Movement Prep", "Plyometric", "Power", "Speed", "Primary"]);
    expect(merged[3]).toMatchObject({ key: `label:${id1}`, chip: "Speed", category: null, builtinKey: null, archived: false });
  });

  test("a long label name without a chip gets a short chip, never the whole name", () => {
    const long = "Speed and agility and reactive strength drills extra long label name here";
    const [own] = mergeRoleLabels([row({ id: id1, name: long, chip: null })]).filter((l) => l.key === `label:${id1}`);
    expect(own.name).toBe(long);
    expect(own.chip).toBe("Speed");
    expect(own.chip.length).toBeLessThanOrEqual(ROLE_LABEL_CHIP_MAX);
    const [one] = mergeRoleLabels([row({ id: id2, name: "Plyometrics-and-ballistics", chip: null })]).filter((l) => l.key === `label:${id2}`);
    expect(one.chip).toBe("Plyometrics…");
    expect(one.chip.length).toBeLessThanOrEqual(ROLE_LABEL_CHIP_MAX);
  });

  test("an override row changes a built-in's chip, meaning and rank — never its key or name", () => {
    const merged = mergeRoleLabels([row({ id: id2, builtinKey: "core", name: "ignored", chip: "Trunk", description: "Abs.", rank: 25 })]);
    expect(merged[0]).toMatchObject({ key: "core", name: "Core", chip: "Trunk", description: "Abs.", rank: 25, category: "region" });
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
    expect(rankAfter(BUILTIN_ROLE_LABELS, "movement_prep")).toBe(60);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "plyometric")).toBe(85);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "power")).toBe(150);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "strength")).toBe(420);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "core")).toBe(620);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "mobility")).toBe(840);
    expect(rankAfter(BUILTIN_ROLE_LABELS)).toBe(840);
    expect(rankAfter(BUILTIN_ROLE_LABELS, "nope")).toBe(840);
  });
  test("later built-ins never tie with a label placed among the first six", () => {
    // Labels made before Supplemental, Conditioning and Mobility existed sit at
    // 100-step ranks halved again and again (450, 425, 650, 700, 675, 800 …).
    const older = BUILTIN_ROLE_LABELS.filter((l) => l.rank % 100 === 0);
    const ranks = new Set(older.map((l) => l.rank));
    let labels = [...older];
    for (let round = 0; round < 6; round++) {
      for (const after of labels.map((l) => l.key)) ranks.add(rankAfter(labels, after));
      labels = [...ranks].map((rank, i) => ({ ...older[0], key: `label:${i}`, rank }));
    }
    for (const key of ["plyometric", "supplemental", "conditioning", "mobility"]) {
      expect(ranks.has(BUILTIN_ROLE_LABELS.find((l) => l.key === key)!.rank)).toBe(false);
    }
  });
  test("plyometric never ties with a label placed before it existed", () => {
    // Labels made before Plyometric existed halve the gaps among the built-ins
    // that predate it (Movement Prep 50 through Mobility 740) again and again.
    const pre = BUILTIN_ROLE_LABELS.filter((l) => l.key !== "plyometric");
    const ranks = new Set(pre.map((l) => l.rank));
    let labels = [...pre];
    for (let round = 0; round < 6; round++) {
      for (const after of labels.map((l) => l.key)) ranks.add(rankAfter(labels, after));
      labels = [...ranks].map((rank, i) => ({ ...pre[0], key: `label:${i}`, rank }));
    }
    expect(ranks.has(EXERCISE_ROLE_INFO.plyometric.rank)).toBe(false);
  });
  test("skips archived labels", () => {
    const merged = mergeRoleLabels([row({ rank: 150, archivedAt: "2026-01-01" })]);
    expect(rankAfter(merged, "power")).toBe(150);
  });
});

describe("suggestRole", () => {
  const ex = (name: string, o: Partial<RoleHints> = {}): RoleHints => ({ name, ...o });
  const reps = (...r: number[]) => r.map((n) => ({ reps: n, type: "working" }));

  test("explosive lifts → power, whatever the pattern", () => {
    for (const n of ["Med Ball Slam", "Power Clean", "Push Jerk", "Snatch Pull", "Sprint 20m", "Jump Squat", "Barbell Jump Squat", "Kettlebell Swing"]) {
      expect(suggestRole(ex(n, { movementPattern: "vertical_push" }), [], 0)).toBe("power");
    }
  });

  test("reactive jump, hop, bound and skip names → plyometric, whatever the pattern", () => {
    for (const n of ["Pogo jumps", "Box Jump", "Depth Jump", "Drop Jump", "Hurdle Hops", "Lateral Bound", "Bounds", "A-Skip", "B Skips", "Plyo Push-up"]) {
      expect(suggestRole(ex(n, { movementPattern: "vertical_push" }), [], 0)).toBe("plyometric");
    }
  });

  test("plyometric vs power: the trainer's split", () => {
    expect(suggestRole(ex("Pogo jumps"), [], 0)).toBe("plyometric");
    expect(suggestRole(ex("Power clean"), [], 0)).toBe("power");
    expect(suggestRole(ex("Box jump"), [], 0)).toBe("plyometric");
    expect(suggestRole(ex("Hip thrust"), [], 0)).not.toBe("plyometric");
  });

  test("trunk patterns, core muscle or trunk names → core", () => {
    expect(suggestRole(ex("Pallof Press", { movementPattern: "anti_rotation" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Farmer Walk", { movementPattern: "carry" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Something", { primaryMuscleGroup: "core" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Side Plank"), [], 0)).toBe("core");
    expect(suggestRole(ex("Dead Bug"), [], 0)).toBe("core");
  });

  test("No pattern gives no hint: the name decides", () => {
    expect(suggestRole(ex("Dead Bug", { movementPattern: "no_pattern" }), [], 0)).toBe("core");
    expect(suggestRole(ex("Cat Camel", { movementPattern: "no_pattern" }), [], 0)).toBe("mobility");
    expect(suggestRole(ex("Mystery Drill", { movementPattern: "no_pattern" }), [], 0)).toBe("accessory");
    expect(suggestRole(ex("Cat Camel", { movementPattern: "multi_movement" }), [], 0)).toBe("mobility");
  });

  test("warm-up and activation names → mobility, and read as prep (the Movement Prep label is retired)", () => {
    for (const n of ["Dynamic Warm-up", "Warmup Circuit", "Glute Activation", "Scap Activation", "Ramp-up Drills", "Movement Prep Flow", "Dynamic Stretching"]) {
      expect(suggestRole(ex(n), [], 0)).toBe("mobility");
      expect(looksLikePrep(n)).toBe(true);
    }
    // a warm-up on the bike is still a warm-up
    expect(suggestRole(ex("Bike Warm-up"), [], 0)).toBe("mobility");
    expect(looksLikePrep("Back Squat")).toBe(false);
  });

  test("conditioning names → conditioning", () => {
    for (const n of [
      "Assault Bike",
      "Air Bike Intervals",
      "Rower",
      "Row Erg 500m",
      "SkiErg",
      "Ski Erg",
      "Rowing Machine",
      "Sled Push",
      "Prowler",
      "Intervals",
      "Tempo Run",
      "Easy Jog",
      "Conditioning Circuit",
      "Metcon",
      "Treadmill",
      "Jump Rope",
      "Battle Ropes",
      "Burpees",
    ]) {
      expect(suggestRole(ex(n), [], 0)).toBe("conditioning");
    }
  });

  test("mobility and recovery names → mobility", () => {
    for (const n of ["Hip Flexor Stretch", "Foam Roll Quads", "Foam Rolling", "Hip CARs", "Shoulder Mobility", "90/90 Breathing", "Box Breathing", "Cool-down", "Open Books", "T-Spine Rotation"]) {
      expect(suggestRole(ex(n), [], 0)).toBe("mobility");
    }
  });

  test("name matches beat a catalog pattern", () => {
    expect(suggestRole(ex("Rowing Machine", { movementPattern: "horizontal_pull", prescribedSets: reps(5) }), [], 0)).toBe("conditioning");
    expect(suggestRole(ex("Thoracic Rotation", { movementPattern: "rotation" }), [], 0)).toBe("mobility");
  });

  test("clashes: sprints stay power, a plain row stays a lift, skipping rope is conditioning, hip is not a hop", () => {
    expect(suggestRole(ex("Sprint 20m"), [], 0)).toBe("power");
    expect(suggestRole(ex("Hill Sprints"), [], 0)).toBe("power");
    expect(suggestRole(ex("Bike Sprints"), [], 0)).toBe("power");
    expect(suggestRole(ex("Sled Push"), [], 0)).toBe("conditioning");
    expect(suggestRole(ex("Skipping Rope"), [], 0)).toBe("conditioning");
    expect(suggestRole(ex("Box Jump"), [], 0)).toBe("plyometric");
    expect(suggestRole(ex("Hip Thrust", { movementPattern: "hip_dominant" }), [], 0)).toBe("primary");
    expect(suggestRole(ex("Barbell Row", { prescribedSets: reps(5) }), [], 0)).toBe("primary");
    expect(suggestRole(ex("Seated Cable Row", { prescribedSets: reps(10) }), [], 0)).toBe("strength");
    expect(suggestRole(ex("Bicycle Crunch"), [], 0)).toBe("core");
    expect(suggestRole(ex("Farmer Carry"), [], 0)).toBe("core");
  });

  test("never suggests supplemental; prep, conditioning and mobility don't take the primary slot", () => {
    const session = [
      ex("Dynamic Warm-up"),
      ex("Assault Bike"),
      ex("Back Squat", { movementPattern: "knee_dominant", prescribedSets: reps(5) }),
      ex("Deadlift", { movementPattern: "hip_dominant", prescribedSets: reps(5) }),
      ex("Hip Flexor Stretch"),
    ];
    expect(suggestRoles(session)).toEqual(["mobility", "conditioning", "primary", "secondary", "mobility"]);
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
    expect(suggestRoles(session)).toEqual(["plyometric", "primary", "secondary", "strength", "accessory", "core"]);
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

describe("fixDraftRoles", () => {
  const sets = (r: number) => [{ setNumber: 1, type: "working" as const, amrap: false, reps: r }];
  const draft = (exercises: { exerciseName: string; role?: any; reps?: number }[]) => ({
    name: "d",
    rationale: "why",
    clientSummary: "",
    weeks: [{ sessions: [{ name: "Lower", kind: "exercises", exercises: exercises.map((e) => ({ exerciseName: e.exerciseName, role: e.role, prescribedSets: sets(e.reps ?? 5) })) }] }],
  });

  test("missing and unknown labels are filled by suggestRole; known ones stay", () => {
    const merged = mergeRoleLabels([row({})]);
    const out = fixDraftRoles(
      draft([
        { exerciseName: "Back Squat" },
        { exerciseName: "Leg Curl", role: `label:${id2}` },
        { exerciseName: "Box Jump", role: `label:${id1}` },
      ]),
      merged
    );
    expect(out.draft.weeks[0].sessions[0].exercises.map((e) => e.role)).toEqual(["primary", "accessory", `label:${id1}`]);
    expect(out.filled).toBe(2);
    expect(out.notes).toEqual([]);
  });

  test("catalog hints feed the suggestion", () => {
    const d = { ...draft([{ exerciseName: "Thing" }]), weeks: [{ sessions: [{ name: "A", exercises: [{ exerciseId: "x", role: undefined as ExerciseRole | undefined, prescribedSets: sets(10) }] }] }] };
    const out = fixDraftRoles(d, BUILTIN_ROLE_LABELS, () => ({ movementPattern: "anti_extension" }));
    expect(out.draft.weeks[0].sessions[0].exercises[0].role).toBe("core");
  });

  test("two Primaries in a session → a note, not a change", () => {
    const out = fixDraftRoles(
      draft([
        { exerciseName: "Squat", role: "primary" },
        { exerciseName: "Deadlift", role: "primary" },
      ]),
      BUILTIN_ROLE_LABELS
    );
    expect(out.draft.weeks[0].sessions[0].exercises.map((e) => e.role)).toEqual(["primary", "primary"]);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toContain("Lower");
  });

  test("every week is checked; a note repeated across weeks shows once", () => {
    const one = draft([
      { exerciseName: "Squat", role: "primary" },
      { exerciseName: "Deadlift", role: "primary" },
      { exerciseName: "Back Squat" },
    ]);
    const out = fixDraftRoles({ ...one, weeks: [one.weeks[0], one.weeks[0]] }, BUILTIN_ROLE_LABELS);
    expect(out.draft.weeks[1].sessions[0].exercises[2].role).toBeDefined();
    expect(out.filled).toBe(2);
    expect(out.notes).toHaveLength(1);
  });

  test("the draft gate drops an unknown role instead of failing", () => {
    const parsed = DraftExerciseRef.parse({ exerciseName: "Squat", role: "warmup", prescribedSets: sets(5) });
    expect(parsed.role).toBeUndefined();
  });
});

describe("suggestRole heaviness", () => {
  test("a rep range counts by its low end; to-failure work isn't heavy", () => {
    const squat = { name: "Squat", movementPattern: "knee_dominant" as const, prescribedSets: [{ reps: 8, repsMin: 6, type: "working" }] };
    const pushUp = { name: "Push-Up", movementPattern: "horizontal_push" as const, prescribedSets: [{ reps: 0, amrap: true, type: "working" }] };
    expect(suggestRoles([pushUp, squat])).toEqual(["strength", "primary"]);
  });
});

describe("builtinNameTwin", () => {
  test("an own label named like a built-in, any case, points at it", () => {
    expect(builtinNameTwin({ builtinKey: null, name: "Conditioning" })).toBe("conditioning");
    expect(builtinNameTwin({ builtinKey: null, name: "strength / supplemental" })).toBe("supplemental");
  });
  test("other own labels and the built-ins themselves don't", () => {
    expect(builtinNameTwin({ builtinKey: null, name: "Engine" })).toBeNull();
    expect(builtinNameTwin({ builtinKey: "conditioning", name: "Conditioning" })).toBeNull();
  });
});

describe("overrideRowName", () => {
  test("no trimmed label name can take it, and the merge ignores it", () => {
    const name = overrideRowName("conditioning");
    expect(name).not.toBe(name.trim());
    const [merged] = mergeRoleLabels([{ id: "o", builtinKey: "power", name: overrideRowName("power"), chip: "P", description: null, rank: 100, archivedAt: null }]).filter((l) => l.key === "power");
    expect(merged).toMatchObject({ name: "Power", chip: "P" });
  });
});
