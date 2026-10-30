import { describe, expect, test } from "bun:test";
import {
  AiProgramDraft,
  applyDefaultWeekdays,
  CardioPrescription,
  CHAIN_MUSCLE_GROUPS,
  ChainMuscleGroup,
  Client,
  DraftExerciseRef,
  estimate1rm,
  Exercise,
  EXERCISE_ROLE_INFO,
  EXERCISE_ROLES,
  formatPatternBalance,
  FUNCTIONAL_MOVEMENT_INFO,
  FUNCTIONAL_MOVEMENTS,
  KINETIC_CHAIN_DEFAULTS,
  KineticChainInput,
  LoggedSet,
  MOVEMENT_PATTERN_INFO,
  MOVEMENT_PATTERNS,
  patternBalance,
  Phasing,
  PrescribedSet,
  Program,
  ProgramDay,
  ProgramExercise,
  ProgramSession,
  ProgramWeek,
  ProgramWeeksDocument,
  sortExercisesByRole,
  stampWeeks,
  weekSessions,
  WeekPlan,
  WeekTarget,
} from "./index";

const uuid = () => crypto.randomUUID();

describe("PrescribedSet", () => {
  test("accepts a plain working set and applies defaults", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 8 });
    expect(s.type).toBe("working");
    expect(s.amrap).toBe(false);
  });

  test("only working and backoff set types exist — warm-ups are handled in the room", () => {
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, type: "backoff" })).not.toThrow();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, type: "warm_up" })).toThrow();
  });

  test("rejects impossible reps", () => {
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 101 })).toThrow();
    // reps 0 is legal ONLY as a failure (amrap) or timed set
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 0 })).toThrow();
  });

  test("rejects RPE out of 1-10", () => {
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 11 })).toThrow();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 0 })).toThrow();
    expect(() =>
      PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 10 })
    ).not.toThrow();
  });
});

describe("PrescribedSet coach formats", () => {
  test("rep range: repsMin lower bound, reps upper bound", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 10, repsMin: 6 });
    expect(s.repsMin).toBe(6);
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 6, repsMin: 10 })).toThrow();
  });

  test("timed set: durationSeconds with reps 0", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 0, durationSeconds: 60 });
    expect(s.durationSeconds).toBe(60);
  });

  test("failure set: amrap with reps 0", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 0, amrap: true });
    expect(s.amrap).toBe(true);
  });

  test("load target: targetWeightKg present or null", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 5, targetWeightKg: 65 });
    expect(s.targetWeightKg).toBe(65);
    expect(
      PrescribedSet.parse({ setNumber: 1, reps: 5, targetWeightKg: null }).targetWeightKg
    ).toBeNull();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetWeightKg: 700 })).toThrow();
  });
});

describe("Phasing", () => {
  test("round-trips a scheme-backed phasing with week directives", () => {
    const p = Phasing.parse({
      plannedWeeks: 6,
      phase: "accumulation",
      nextPhase: "intensification",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "deload" },
      ],
    });
    expect(p.weeks).toHaveLength(4);
  });

  test("week plans must fall within plannedWeeks", () => {
    expect(() =>
      Phasing.parse({
        plannedWeeks: 4,
        phase: "acc",
        weeks: [{ week: 5, directive: "base" }],
      })
    ).toThrow();
  });

  test("rejects unknown directives", () => {
    expect(() =>
      Phasing.parse({
        plannedWeeks: 4,
        phase: "acc",
        weeks: [{ week: 1, directive: "growth" as never }],
      })
    ).toThrow();
  });
});

describe("Client trainingDays", () => {
  const base = {
    id: uuid(),
    trainerId: uuid(),
    name: "Maya",
    email: "maya@example.com",
    createdAt: new Date().toISOString(),
  };

  test("accepts ISO weekday ints 1–7", () => {
    const c = Client.parse({ ...base, trainingDays: [1, 3, 5] });
    expect(c.trainingDays).toEqual([1, 3, 5]);
  });

  test("rejects duplicates and out-of-range days", () => {
    expect(() => Client.parse({ ...base, trainingDays: [1, 1] })).toThrow();
    expect(() => Client.parse({ ...base, trainingDays: [0] })).toThrow();
    expect(() => Client.parse({ ...base, trainingDays: [8] })).toThrow();
  });

  test("old-shape clients (no trainingDays) still parse", () => {
    expect(Client.parse(base).trainingDays).toBeUndefined();
  });
});

describe("Program", () => {
  const baseExercise = { id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] };

  test("requires at least one week with at least one day and session", () => {
    expect(() =>
      Program.parse({
        id: uuid(),
        trainerId: uuid(),
        clientId: null,
        name: "Block 1",
        weeks: [],
        createdAt: new Date().toISOString(),
      })
    ).toThrow();
  });

  test("accepts a minimal valid program and applies defaults", () => {
    const p = Program.parse({
      id: uuid(),
      trainerId: uuid(),
      clientId: null,
      name: "Block 1",
      weeks: [
        {
          week: 1,
          days: [
            {
              id: uuid(),
              day: 1,
              sessions: [{ id: uuid(), name: "Day A", order: 0, exercises: [baseExercise] }],
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    });
    expect(p.status).toBe("draft");
    expect(p.version).toBe(1);
    expect(p.aiAssisted).toBe(false);
    expect(p.createdFromProgramId).toBeNull();
    expect(p.activatedAt).toBeUndefined();
    expect(p.phasing).toBeUndefined();
  });

  test("accepts cardio sessions and phasing + activatedAt on the program", () => {
    const p = Program.parse({
      id: uuid(),
      trainerId: uuid(),
      clientId: null,
      name: "Block 1",
      activatedAt: new Date().toISOString(),
      phasing: {
        plannedWeeks: 6,
        phase: "accumulation",
        weeks: [
          { week: 1, directive: "base" },
          { week: 2, directive: "+volume" },
        ],
      },
      weeks: [
        {
          week: 1,
          days: [
            {
              id: uuid(),
              day: 1,
              sessions: [
                {
                  id: uuid(),
                  name: "Cardio 1",
                  order: 0,
                  kind: "cardio",
                  cardio: { modality: "Bike", durationMin: 30, hrZone: 2 },
                },
              ],
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    });
    expect(p.weeks[0].days[0].sessions[0].kind).toBe("cardio");
    expect(p.weeks[0].days[0].sessions[0].cardio?.modality).toBe("Bike");
    expect(p.phasing?.weeks).toHaveLength(2);
    expect(p.activatedAt).toBeTruthy();
  });
});

describe("ProgramWeeksDocument", () => {
  const baseExercise = { id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] };

  test("ProgramWeeksDocument: accepts weeks→days→sessions and defaults kind \"lifting\"", () => {
    const doc = ProgramWeeksDocument.parse([
      {
        week: 1,
        days: [
          {
            id: uuid(),
            day: 1,
            sessions: [
              {
                id: uuid(),
                name: "Day 1",
                order: 0,
                exercises: [baseExercise],
              },
            ],
          },
        ],
      },
    ]);
    expect(doc[0].days[0].sessions[0].kind).toBe("lifting");
  });

  test("rejects non-contiguous week numbers", () => {
    expect(() =>
      ProgramWeeksDocument.parse([
        {
          week: 1,
          days: [{ id: uuid(), day: 1, sessions: [{ id: uuid(), name: "S1", order: 0, exercises: [baseExercise] }] }],
        },
        {
          week: 3,
          days: [{ id: uuid(), day: 1, sessions: [{ id: uuid(), name: "S2", order: 0, exercises: [baseExercise] }] }],
        },
      ])
    ).toThrow();
  });

  test("cardio session requires cardio fields and no exercises; lifting requires ≥1", () => {
    // Lifting with no exercises throws
    expect(() =>
      ProgramSession.parse({
        id: uuid(),
        name: "Empty Lifting",
        order: 0,
        kind: "lifting",
        exercises: [],
      })
    ).toThrow();

    // Lifting with cardio throws
    expect(() =>
      ProgramSession.parse({
        id: uuid(),
        name: "Lifting with Cardio",
        order: 0,
        kind: "lifting",
        exercises: [baseExercise],
        cardio: { modality: "Bike" },
      })
    ).toThrow();

    // Cardio with exercises throws
    expect(() =>
      ProgramSession.parse({
        id: uuid(),
        name: "Cardio with Exercises",
        order: 0,
        kind: "cardio",
        exercises: [baseExercise],
        cardio: { modality: "Bike" },
      })
    ).toThrow();

    // Cardio with no cardio fields throws
    expect(() =>
      ProgramSession.parse({
        id: uuid(),
        name: "Cardio without cardio",
        order: 0,
        kind: "cardio",
        exercises: [],
      })
    ).toThrow();

    // Valid cardio passes
    const validCardio = ProgramSession.parse({
      id: uuid(),
      name: "Cardio 1",
      order: 0,
      kind: "cardio",
      cardio: { modality: "Bike", durationMin: 30, hrZone: 2 },
    });
    expect(validCardio.kind).toBe("cardio");
    expect(validCardio.exercises).toEqual([]);
  });

  test("CardioPrescription: fields, nullable duration, hrZone bounds", () => {
    expect(() => CardioPrescription.parse({ modality: "Run", hrZone: 6 })).toThrow();
    expect(() => CardioPrescription.parse({ modality: "Run", hrZone: 0 })).toThrow();
    expect(() => CardioPrescription.parse({ modality: "Run", distanceKm: -1 })).toThrow();
    expect(() => CardioPrescription.parse({ modality: "Run", distanceKm: 301 })).toThrow();
    expect(() => CardioPrescription.parse({ modality: "Run", targetRpe: 0 })).toThrow();
    expect(() => CardioPrescription.parse({ modality: "Run", targetRpe: 11 })).toThrow();
    expect(() => CardioPrescription.parse({ modality: "" })).toThrow();

    const valid = CardioPrescription.parse({
      modality: "Bike",
      durationMin: null,
      hrZone: 2,
      intensity: "easy spin",
      distanceKm: 15,
      targetRpe: 4,
    });
    expect(valid.durationMin).toBeNull();
    expect(valid.modality).toBe("Bike");
  });

  test("old session documents lose conditioning and default to lifting", () => {
    const legacy = {
      id: uuid(),
      name: "Day A",
      order: 0,
      exercises: [baseExercise],
      conditioning: { label: "Zone 2", detail: "20 min easy bike" },
    };
    const parsed = ProgramSession.parse(legacy);
    expect(parsed.kind).toBe("lifting");
    expect("conditioning" in parsed).toBe(false);
  });

  test("applyDefaultWeekdays fills day i from sorted trainingDays, extras stay null", () => {
    const templateWeeks: ProgramWeek[] = [
      {
        week: 1,
        days: [
          { id: uuid(), day: 1, sessions: [{ id: uuid(), name: "S1", order: 0, exercises: [baseExercise] }] },
          { id: uuid(), day: 2, sessions: [{ id: uuid(), name: "S2", order: 0, exercises: [baseExercise] }] },
          { id: uuid(), day: 3, sessions: [{ id: uuid(), name: "S3", order: 0, exercises: [baseExercise] }] },
        ],
      },
    ];
    // trainingDays: [4, 2] -> sorted is [2, 4] -> day 1: 2, day 2: 4, day 3: null
    const result = applyDefaultWeekdays(templateWeeks, [4, 2]);
    expect(result[0].days[0].weekday).toBe(2);
    expect(result[0].days[1].weekday).toBe(4);
    expect(result[0].days[2].weekday).toBeNull();
  });

  test("stampWeeks gives each week fresh ids and keeps catalog exerciseIds", () => {
    const catalogExerciseId = uuid();
    const template: ProgramDay[] = [
      {
        id: uuid(),
        day: 1,
        sessions: [
          {
            id: uuid(),
            name: "S1",
            order: 0,
            kind: "lifting",
            exercises: [
              {
                id: uuid(),
                exerciseId: catalogExerciseId,
                order: 0,
                prescribedSets: [{ setNumber: 1, reps: 5 }],
              },
            ],
          },
        ],
      },
    ];
    const stamped = stampWeeks(template, 3);
    expect(stamped).toHaveLength(3);
    expect(stamped[0].week).toBe(1);
    expect(stamped[1].week).toBe(2);
    expect(stamped[2].week).toBe(3);

    const dayIds = stamped.map((w) => w.days[0].id);
    const sessionIds = stamped.map((w) => w.days[0].sessions[0].id);
    const exerciseIds = stamped.map((w) => w.days[0].sessions[0].exercises[0].id);

    expect(new Set(dayIds).size).toBe(3);
    expect(new Set(sessionIds).size).toBe(3);
    expect(new Set(exerciseIds).size).toBe(3);

    for (const w of stamped) {
      expect(w.days[0].sessions[0].exercises[0].exerciseId).toBe(catalogExerciseId);
    }
  });

  test("WeekPlan target: metric enum and deltaPercent bounds", () => {
    expect(() =>
      WeekPlan.parse({ week: 1, directive: "base", target: { metric: "unknown" as never, deltaPercent: 5 } })
    ).toThrow();
    expect(() =>
      WeekPlan.parse({ week: 1, directive: "base", target: { metric: "overall_volume", deltaPercent: -101 } })
    ).toThrow();
    expect(() =>
      WeekPlan.parse({ week: 1, directive: "base", target: { metric: "overall_volume", deltaPercent: 201 } })
    ).toThrow();

    const validMin = WeekPlan.parse({
      week: 1,
      directive: "base",
      target: { metric: "overall_volume", deltaPercent: -100 },
    });
    expect(validMin.target?.deltaPercent).toBe(-100);

    const validMax = WeekPlan.parse({
      week: 1,
      directive: "base",
      target: { metric: "intensity", deltaPercent: 200 },
    });
    expect(validMax.target?.deltaPercent).toBe(200);

    const phasing = Phasing.parse({
      plannedWeeks: 3,
      phase: "accumulation",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
        { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
      ],
    });
    expect(phasing.weeks?.[1].target?.metric).toBe("overall_volume");
    expect(phasing.weeks?.[1].target?.deltaPercent).toBe(5);
    expect(phasing.weeks?.[2].target?.metric).toBe("intensity");
    expect(phasing.weeks?.[2].target?.deltaPercent).toBe(2.5);
  });
});

describe("ExerciseRole", () => {
  const baseExercise = { id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] };

  test("role is optional and only the five session slots are accepted", () => {
    expect(ProgramExercise.parse(baseExercise).role).toBeUndefined();
    expect(ProgramExercise.parse({ ...baseExercise, role: "primary" }).role).toBe("primary");
    expect(() => ProgramExercise.parse({ ...baseExercise, role: "warmup" })).toThrow();
  });

  test("every role has a label and a description", () => {
    for (const r of EXERCISE_ROLES) {
      expect(EXERCISE_ROLE_INFO[r].label.length).toBeGreaterThan(0);
      expect(EXERCISE_ROLE_INFO[r].description.length).toBeGreaterThan(0);
    }
  });

  test("sortExercisesByRole orders power → primary → strength → accessory → core", () => {
    const sorted = sortExercisesByRole([
      { name: "plank", role: "core" as const },
      { name: "row", role: "accessory" as const },
      { name: "squat", role: "primary" as const },
      { name: "box jump", role: "power" as const },
      { name: "rdl", role: "strength" as const },
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["box jump", "squat", "rdl", "row", "plank"]);
  });

  test("sort is stable within a rank and puts unset roles last", () => {
    const sorted = sortExercisesByRole([
      { name: "curl", role: undefined },
      { name: "row", role: "accessory" as const },
      { name: "squat", role: "primary" as const },
      { name: "lateral raise", role: "accessory" as const },
      { name: "face pull" },
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["squat", "row", "lateral raise", "curl", "face pull"]);
  });

  test("all-unset input keeps its order and is not mutated", () => {
    const input = [{ name: "a" }, { name: "b" }, { name: "c" }];
    const sorted = sortExercisesByRole(input);
    expect(sorted.map((e) => e.name)).toEqual(["a", "b", "c"]);
    expect(sorted).not.toBe(input);
  });
});

describe("LoggedSet", () => {
  test("bodyweight set needs no weight", () => {
    const s = LoggedSet.parse({
      id: uuid(),
      programExerciseId: null,
      exerciseId: uuid(),
      setNumber: 1,
      reps: 12,
    });
    expect(s.weightKg).toBeUndefined();
    expect(s.type).toBe("working");
  });

  test("reps are required — no phantom sets", () => {
    expect(() =>
      LoggedSet.parse({ id: uuid(), programExerciseId: null, exerciseId: uuid(), setNumber: 1 })
    ).toThrow();
  });
});

describe("estimate1rm", () => {
  test("Epley formula with rounding", () => {
    expect(estimate1rm(100, 1)).toBe(103.3); // 100 * (1 + 1/30)
    expect(estimate1rm(100, 5)).toBe(116.7); // 100 * (1 + 5/30)
  });

  test("caps rep multiplier growth at 12 reps", () => {
    expect(estimate1rm(100, 12)).toBe(estimate1rm(100, 30));
  });

  test("zero-safe", () => {
    expect(estimate1rm(0, 5)).toBe(0);
    expect(estimate1rm(100, 0)).toBe(0);
  });
});

describe("DraftExerciseRef (AI output gate)", () => {
  test("requires exerciseId OR exerciseName", () => {
    const sets = [{ setNumber: 1, reps: 8 }];
    expect(() => DraftExerciseRef.parse({ prescribedSets: sets })).toThrow();
    expect(() =>
      DraftExerciseRef.parse({ prescribedSets: sets, exerciseId: uuid() })
    ).not.toThrow();
    expect(() =>
      DraftExerciseRef.parse({ prescribedSets: sets, exerciseName: "Bulgarian split squat" })
    ).not.toThrow();
  });

  test("a set with no reps never passes the gate", () => {
    expect(() =>
      DraftExerciseRef.parse({
        exerciseName: "Squat",
        prescribedSets: [{ setNumber: 1, type: "working" }],
      })
    ).toThrow();
  });
});

describe("AiProgramDraft (full LLM payload)", () => {
  test("accepts a well-formed draft", () => {
    const d = AiProgramDraft.parse({
      name: "Block 2",
      rationale: "Volume held, intensity +2.5kg on main lifts.",
      clientSummary: "Same split, small jumps on the big lifts.",
      sessions: [
        {
          name: "Day A — Lower",
          exercises: [
            {
              exerciseName: "Back Squat",
              prescribedSets: [
                { setNumber: 1, reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
                { setNumber: 2, reps: 5, amrap: true, targetRpe: 9, restSeconds: 180 },
              ],
            },
          ],
        },
      ],
    });
    expect(d.sessions).toHaveLength(1);
  });

  test("rejects a draft with empty sessions (AI always proposes structure)", () => {
    expect(() =>
      AiProgramDraft.parse({
        name: "Empty",
        rationale: "nothing",
        clientSummary: "nothing",
        sessions: [],
      })
    ).toThrow();
  });
});

describe("Movement taxonomy", () => {
  test("movement pattern enum has exactly the 12 pinned values", () => {
    expect(MOVEMENT_PATTERNS).toEqual([
      "vertical_push",
      "vertical_pull",
      "horizontal_push",
      "horizontal_pull",
      "knee_dominant",
      "hip_dominant",
      "rotation",
      "anti_rotation",
      "lateral_flexion",
      "anti_lateral_flexion",
      "trunk_flexion",
      "anti_trunk_flexion",
    ]);
    expect(Object.keys(MOVEMENT_PATTERN_INFO)).toEqual([...MOVEMENT_PATTERNS]);
    const coreCount = MOVEMENT_PATTERNS.filter((p) => MOVEMENT_PATTERN_INFO[p].core).length;
    expect(coreCount).toBe(6);
  });

  test("functional movement enum has exactly the 7 pinned values", () => {
    expect(FUNCTIONAL_MOVEMENTS).toEqual([
      "push",
      "pull",
      "bend_lift",
      "squat",
      "single_leg",
      "rotation",
      "locomotion",
    ]);
    expect(Object.keys(FUNCTIONAL_MOVEMENT_INFO)).toEqual([...FUNCTIONAL_MOVEMENTS]);
  });

  test("Exercise accepts absent and null taxonomy fields, rejects unknown values", () => {
    const base = {
      id: uuid(),
      trainerId: null,
      name: "Bench Press",
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: [],
      equipment: "barbell",
    };
    const e1 = Exercise.parse(base);
    expect(e1.movementPattern).toBeUndefined();
    expect(e1.functionalMovement).toBeUndefined();

    const e2 = Exercise.parse({
      ...base,
      movementPattern: null,
      functionalMovement: null,
    });
    expect(e2.movementPattern).toBeNull();
    expect(e2.functionalMovement).toBeNull();

    expect(() =>
      Exercise.parse({ ...base, movementPattern: "push_press" })
    ).toThrow();
    expect(() =>
      Exercise.parse({ ...base, functionalMovement: "invalid" })
    ).toThrow();
  });
});

describe("patternBalance", () => {
  const tagged8Plus1Null = [
    { movementPattern: "vertical_push" as const },
    { movementPattern: "horizontal_push" as const },
    { movementPattern: "vertical_pull" as const },
    { movementPattern: "horizontal_pull" as const },
    { movementPattern: "knee_dominant" as const },
    { movementPattern: "knee_dominant" as const },
    { movementPattern: "hip_dominant" as const },
    { movementPattern: "anti_rotation" as const },
    { movementPattern: null },
  ];

  test("tallies push/pull/knee/hip/core and unclassified", () => {
    const balance = patternBalance(tagged8Plus1Null);
    expect(balance).toEqual({
      push: 2,
      pull: 2,
      knee: 2,
      hip: 1,
      core: 1,
      unclassified: 1,
    });
  });

  test("formatPatternBalance renders counts and hides zero unclassified", () => {
    const withUnclassified = patternBalance(tagged8Plus1Null);
    expect(formatPatternBalance(withUnclassified)).toBe(
      "push 2 · pull 2 · knee 2 · hip 1 · core 1 · unclassified 1"
    );

    const zeroUnclassified = patternBalance(tagged8Plus1Null.slice(0, 8));
    expect(formatPatternBalance(zeroUnclassified)).toBe(
      "push 2 · pull 2 · knee 2 · hip 1 · core 1"
    );
  });
});

describe("KINETIC_CHAIN_DEFAULTS", () => {
  test("five chains in trainer order with valid muscle groups", () => {
    expect(KINETIC_CHAIN_DEFAULTS.length).toBe(5);
    expect(KINETIC_CHAIN_DEFAULTS.map((c) => c.name)).toEqual([
      "Intrinsic",
      "Deep Longitudinal",
      "Lateral",
      "Posterior Spiral",
      "Anterior Spiral",
    ]);
    expect(KINETIC_CHAIN_DEFAULTS.map((c) => c.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    for (const chain of KINETIC_CHAIN_DEFAULTS) {
      for (const group of chain.muscleGroups) {
        expect(CHAIN_MUSCLE_GROUPS.includes(group)).toBe(true);
      }
      expect(() =>
        KineticChainInput.parse({ muscleGroups: chain.muscleGroups })
      ).not.toThrow();
    }
  });
});

describe("KineticChainInput", () => {
  test("rejects empty, duplicate, cardio, full_body", () => {
    expect(KineticChainInput.safeParse({ muscleGroups: [] }).success).toBe(false);
    expect(
      KineticChainInput.safeParse({ muscleGroups: ["back", "back"] }).success
    ).toBe(false);
    expect(
      KineticChainInput.safeParse({ muscleGroups: ["cardio"] }).success
    ).toBe(false);
    expect(
      KineticChainInput.safeParse({ muscleGroups: ["full_body"] }).success
    ).toBe(false);
  });
});

