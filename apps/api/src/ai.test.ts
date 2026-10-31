import { describe, expect, test } from "bun:test";
import { extractJsonObject } from "./ai/provider";
import {
  buildGenerationMessages,
  buildRevisionMessages,
  buildWeekMessages,
  buildWeekRevisionMessages,
  periodizationContext,
} from "./ai/prompt";
import { bindPendingExercises, draftToWeeks, replaceWeek } from "./lib/draftToProgram";
import type { AiProgramDraft } from "@pt/shared";

describe("extractJsonObject", () => {
  test("passes through clean JSON", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  test("unwraps fenced JSON", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("extracts from surrounding prose", () => {
    expect(extractJsonObject('Here you go: {"a": {"b": 2}} — hope it helps!')).toBe('{"a": {"b": 2}}');
  });
});

describe("buildGenerationMessages", () => {
  test("limitations reach the prompt verbatim (safety)", () => {
    const { system, user } = buildGenerationMessages({
      client: { name: "Ada", goals: "get strong", limitations: "Left knee pain — no deep knee flexion", daysPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(system).toContain("hard constraint");
    expect(user).toContain("Left knee pain");
    expect(user).toContain("Ada");
    expect(system).toContain("days per week (3)");
  });

  test("history numbers are included for progression reasoning", () => {
    const { user } = buildGenerationMessages({
      client: { name: "Bob" },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [{ exerciseName: "Back Squat", recentSets: ["100kg × 5 @ RPE 8"], bestE1rm: 116.7 }],
      catalog: [],
      trainerInstructions: "",
    });
    expect(user).toContain("100kg × 5 @ RPE 8");
    expect(user).toContain("116.7");
  });

  test("periodization context is injected and phasing is instructed", () => {
    const { system, user } = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 4 },
      previousProgram: null,
      periodization: "week 3 of 6 · accumulation · this week's directive: +intensity · weekly overall volume 1.8t → 2.1t (+17%)",
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(user).toContain("PERIODIZATION CONTEXT");
    expect(user).toContain("week 3 of 6");
    expect(system).toContain("Propose phasing");
    expect(system).toContain("targetWeightKg");
  });

  test("role schema field, role rule and previous-program roles reach the prompt", () => {
    const { system, user } = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: {
        name: "Block 1",
        sessions: [{ name: "Day A", exercises: [{ name: "Back Squat", role: "primary", sets: ["5 reps"] }] }],
      },
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(system).toContain('"role": "power" | "primary" | "strength" | "accessory" | "core"');
    expect(system).toContain("role order (power → primary → strength → accessory → core)");
    expect(system).toContain("primary: The main lift");
    expect(user).toContain("Back Squat (primary) [5 reps]");
  });

  test("catalog lines carry movement pattern and functional movement", () => {
    const { user } = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [
        {
          id: "ex-1",
          name: "Bench Press",
          primaryMuscleGroup: "chest",
          equipment: "barbell",
          movementPattern: "horizontal_push",
          functionalMovement: "push",
        },
      ],
      trainerInstructions: "",
    });
    expect(user).toContain("- ex-1 | Bench Press (chest, barbell, horizontal_push, push)");
  });

  test("unclassified catalog entries render n/a markers", () => {
    const { user } = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [
        {
          id: "ex-2",
          name: "Mystery Exercise",
          primaryMuscleGroup: "core",
          equipment: "bodyweight",
          movementPattern: null,
          functionalMovement: null,
        },
      ],
      trainerInstructions: "",
    });
    expect(user).toContain("- ex-2 | Mystery Exercise (core, bodyweight, pattern n/a, function n/a)");
  });

  test("system instructs pattern balance and rationale must explain it", () => {
    const { system } = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(system).toContain("push volume (vertical + horizontal) with pull volume");
    expect(system).toContain("knee-dominant with hip-dominant");
    expect(system).toContain("rationale must state how the block is balanced");
  });

  test("chain balance reaches the prompt", () => {
    const withBalance = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: "Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral",
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(withBalance.user).toContain("KINETIC CHAIN BALANCE");
    expect(withBalance.user).toContain("Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral");
    expect(withBalance.system).toContain("five kinetic chains");

    const noBalance = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(noBalance.user).toContain("no logged training to balance yet");
  });

  test("buildGenerationMessages includes the standing direction line", () => {
    const withDir = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      direction: "Build squat volume; keep upper body at maintenance.",
    });
    expect(withDir.user).toContain("STANDING DIRECTION (block-level — applies to every generation of this block): Build squat volume; keep upper body at maintenance.");

    const withoutDir = buildGenerationMessages({
      client: { name: "Maya", daysPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      direction: null,
    });
    expect(withoutDir.user).not.toContain("STANDING DIRECTION");
  });
});

describe("buildWeekMessages", () => {
  test("buildWeekMessages carries direction, directive, target and current-week sessions", () => {
    const { system, user } = buildWeekMessages({
      client: { name: "Jonas", daysPerWeek: 3 },
      targetWeek: 3,
      plannedWeeks: 4,
      targetDirective: "+volume",
      target: { metric: "overall_volume", deltaPercent: 5 },
      direction: "Build squat volume; keep upper body at maintenance.",
      previousProgram: {
        name: "Jonas Block",
        sessions: [
          { name: "Week 2 Squat Focus", exercises: [{ name: "Back Squat", sets: ["120kg × 5 @ RPE 8"] }] },
          { name: "Week 2 Bench Focus", exercises: [{ name: "Bench Press", sets: ["90kg × 5 @ RPE 8"] }] },
        ],
      },
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });

    expect(system).toContain("Do NOT propose phasing: the block's periodization is fixed");
    expect(system).toContain("drafting the NEXT WEEK (week 3 of 4)");
    expect(user).toContain("STANDING DIRECTION (block-level — applies to every generation of this block): Build squat volume; keep upper body at maintenance.");
    expect(user).toContain("NEXT WEEK: week 3 of 4 · directive +volume · target +5% overall volume");
    expect(user).toContain("CURRENT WEEK (week 2 — what the client is doing now):");
    expect(user).toContain("Week 2 Squat Focus");
    expect(user).toContain("Week 2 Bench Focus");
  });
});

describe("buildRevisionMessages", () => {
  test("buildRevisionMessages carries previous draft, feedback verbatim, and safety context", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "Initial mesocycle rationale",
      clientSummary: "Client summary",
      sessions: [
        {
          name: "Day A",
          exercises: [
            {
              exerciseName: "Bench Press",
              role: "primary",
              prescribedSets: [
                { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 },
                { setNumber: 2, type: "working", reps: 5, amrap: true, targetRpe: 9 },
              ],
            },
          ],
        },
      ],
    };

    const feedback = "swap bench for incline DB press; cut one set";
    const { system, user } = buildRevisionMessages({
      client: {
        name: "Ada",
        goals: "hypertrophy",
        limitations: "Shoulder impingement — keep elbow tucked",
        daysPerWeek: 3,
      },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [{ id: "ex-1", name: "Incline DB Press", primaryMuscleGroup: "chest", equipment: "dumbbell" }],
      trainerInstructions: "",
      previousDraft,
      feedback,
    });

    expect(system).toContain("REVISING");
    expect(system).toContain('"name": string');
    expect(system).toContain("This is a REVISION: the previous draft is provided below.");
    expect(user).toContain("Shoulder impingement — keep elbow tucked");
    expect(user).toContain("- Day A: Bench Press (primary) [5 reps @ RPE 8; 5+ reps @ RPE 9]");
    expect(user).toContain(feedback);
  });

  test("chain balance reaches the revision prompt", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "Initial mesocycle rationale",
      clientSummary: "Client summary",
      sessions: [
        {
          name: "Day A",
          exercises: [
            {
              exerciseName: "Bench Press",
              role: "primary",
              prescribedSets: [
                { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 },
              ],
            },
          ],
        },
      ],
    };

    const withBalance = buildRevisionMessages({
      client: { name: "Ada", daysPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: "Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral",
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "more lateral chain",
    });
    expect(withBalance.user).toContain("KINETIC CHAIN BALANCE");
    expect(withBalance.user).toContain("Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral");
    expect(withBalance.system).toContain("five kinetic chains");

    const noBalance = buildRevisionMessages({
      client: { name: "Ada", daysPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "more lateral chain",
    });
    expect(noBalance.user).toContain("no logged training to balance yet");
  });
});

const draft: AiProgramDraft = {
  name: "Block 2",
  rationale: "hold volume, add load",
  clientSummary: "same split, heavier",
  sessions: [
    {
      name: "Day A",
      exercises: [
        { exerciseId: "11111111-1111-1111-1111-111111111111", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] },
        { exerciseName: "Cable Crunch", prescribedSets: [{ setNumber: 1, reps: 12, type: "working", amrap: false }] },
      ],
    },
  ],
};

const catalog = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Back Squat" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Bench Press" },
];

describe("periodizationContext", () => {
  test("periodizationContext includes the quantified target", () => {
    const ph = {
      plannedWeeks: 4,
      phase: "accumulation",
      weeks: [
        { week: 1, directive: "base" as const },
        { week: 2, directive: "+volume" as const, target: { metric: "overall_volume" as const, deltaPercent: 5 } },
      ],
    };
    const line = periodizationContext(ph, 2, "weekly overall volume 1.0t → 1.2t (+20%)");
    expect(line).toContain("target overall volume +5%");
    expect(line).toBe(
      "week 2 of 4 · accumulation · this week's directive: +volume · target overall volume +5% · weekly overall volume 1.0t → 1.2t (+20%)"
    );
  });
});

describe("draftToWeeks", () => {
  test("resolves by id, by name-match, and flags creates", () => {
    const { weeks, createdNames, unresolvable } = draftToWeeks(draft, catalog);
    expect(unresolvable).toEqual([]);
    expect(createdNames).toEqual(["Cable Crunch"]); // not in catalog → create
    const s0 = weeks[0].days[0].sessions[0];
    expect(s0.exercises[0].exerciseId).toBe("11111111-1111-1111-1111-111111111111");
    expect(s0.exercises[1].exerciseId).toBe("pending:cable crunch");
  });

  test("name refs that exactly match the catalog reuse the catalog id", () => {
    const d2 = { ...draft, sessions: [{ ...draft.sessions[0], exercises: [{ exerciseName: "back squat", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] }] }] };
    const { createdNames, weeks } = draftToWeeks(d2, catalog);
    expect(createdNames).toEqual([]);
    expect(weeks[0].days[0].sessions[0].exercises[0].exerciseId).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("bogus id without name is unresolvable, not silently dropped", () => {
    const d3 = { ...draft, sessions: [{ ...draft.sessions[0], exercises: [{ exerciseId: "99999999-9999-9999-9999-999999999999", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] }] }] };
    const { unresolvable } = draftToWeeks(d3, catalog);
    expect(unresolvable).toEqual(["99999999-9999-9999-9999-999999999999"]);
  });

  test("approve sorts a session by role, carries the role and renumbers order", () => {
    const sets = [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }];
    const d4: AiProgramDraft = {
      ...draft,
      sessions: [
        {
          name: "Day A",
          exercises: [
            { exerciseName: "Cable Crunch", role: "core", prescribedSets: sets },
            { exerciseName: "Lateral Raise", prescribedSets: sets },
            { exerciseId: "22222222-2222-2222-2222-222222222222", role: "strength", prescribedSets: sets },
            { exerciseId: "11111111-1111-1111-1111-111111111111", role: "primary", prescribedSets: sets },
          ],
        },
      ],
    };
    const { weeks } = draftToWeeks(d4, catalog);
    const ex = weeks[0].days[0].sessions[0].exercises;
    expect(ex.map((e) => e.exerciseName)).toEqual(["Back Squat", "Bench Press", "Cable Crunch", "Lateral Raise"]);
    expect(ex.map((e) => e.role)).toEqual(["primary", "strength", "core", undefined]);
    expect(ex.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  test("draftToWeeks maps cardio draft sessions into cardio days", () => {
    const draftWithCardio: AiProgramDraft = {
      ...draft,
      sessions: [
        {
          name: "Cardio 1",
          kind: "cardio",
          cardio: { modality: "Bike", durationMin: 30, hrZone: 2 },
          exercises: [],
        },
      ],
    };
    const { weeks } = draftToWeeks(draftWithCardio, catalog);
    const day = weeks[0].days[0];
    expect(day.sessions).toHaveLength(1);
    expect(day.sessions[0].kind).toBe("cardio");
    expect(day.sessions[0].cardio?.modality).toBe("Bike");
    expect(day.sessions[0].cardio?.durationMin).toBe(30);
    expect(day.sessions[0].cardio?.hrZone).toBe(2);
    expect(day.sessions[0].exercises).toEqual([]);
  });
});

describe("bindPendingExercises", () => {
  test("replaces pending ids with real ones", () => {
    const { weeks } = draftToWeeks(draft, catalog);
    const bound = bindPendingExercises(weeks, new Map([["cable crunch", "33333333-3333-3333-3333-333333333333"]]));
    expect(bound[0].days[0].sessions[0].exercises[1].exerciseId).toBe("33333333-3333-3333-3333-333333333333");
  });

  test("throws on a name that never got an id (programming error)", () => {
    const { weeks } = draftToWeeks(draft, catalog);
    expect(() => bindPendingExercises(weeks, new Map())).toThrow(/cable crunch/);
  });
});

describe("cardio target prompt context", () => {
  const ctxBase = {
    previousProgram: null,
    periodization: null,
    chainBalance: null,
    history: [],
    catalog: [],
    trainerInstructions: "",
  };

  test("generation prompt includes the cardio target line when set, absent when null", () => {
    const withTarget = buildGenerationMessages({
      ...ctxBase,
      client: { name: "Maya", daysPerWeek: 3, cardioTarget: { unit: "minutes", value: 150 } },
    });
    expect(withTarget.user).toContain("CARDIO TARGET (per week): 150 min");
    expect(withTarget.user).toContain(
      "prescribe the week's cardio sessions so their prescribed minutes add up to it"
    );
    expect(withTarget.system).toContain(
      "When a CARDIO TARGET is given, the week's cardio prescriptions must add up to it"
    );

    const withoutTarget = buildGenerationMessages({
      ...ctxBase,
      client: { name: "Maya", daysPerWeek: 3, cardioTarget: null },
    });
    expect(withoutTarget.user).not.toContain("CARDIO TARGET");

    const sessionsTarget = buildGenerationMessages({
      ...ctxBase,
      client: { name: "Maya", daysPerWeek: 3, cardioTarget: { unit: "sessions", value: 2 } },
    });
    expect(sessionsTarget.user).toContain("CARDIO TARGET (per week): 2 sessions");

    const zoneTarget = buildGenerationMessages({
      ...ctxBase,
      client: { name: "Maya", daysPerWeek: 3, cardioTarget: { unit: "zone_minutes", value: 120 } },
    });
    expect(zoneTarget.user).toContain("CARDIO TARGET (per week): 120 zone-min");
    expect(zoneTarget.user).toContain("so their zone-minutes add up to it");
  });

  test("revision prompt includes the cardio target line when set, absent when null", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "r",
      clientSummary: "c",
      sessions: [],
    };

    const withTarget = buildRevisionMessages({
      ...ctxBase,
      client: { name: "Maya", daysPerWeek: 3, cardioTarget: { unit: "minutes", value: 150 } },
      previousDraft,
      feedback: "more cardio",
    });
    expect(withTarget.user).toContain("CARDIO TARGET (per week): 150 min");
    expect(withTarget.system).toContain(
      "When a CARDIO TARGET is given, the week's cardio prescriptions must add up to it"
    );

    const withoutTarget = buildRevisionMessages({
      ...ctxBase,
      client: { name: "Maya", daysPerWeek: 3, cardioTarget: null },
      previousDraft,
      feedback: "more cardio",
    });
    expect(withoutTarget.user).not.toContain("CARDIO TARGET");
  });
});

describe("replaceWeek", () => {
  test("replaceWeek splices fresh ids, carries weekdays, leaves other weeks untouched", () => {
    const initialWeeks = [
      {
        week: 1,
        days: [
          {
            id: crypto.randomUUID(),
            day: 1,
            weekday: 1,
            sessions: [
              {
                id: crypto.randomUUID(),
                name: "W1D1",
                order: 0,
                kind: "lifting" as const,
                exercises: [{ id: crypto.randomUUID(), exerciseId: catalog[0].id, order: 0, prescribedSets: [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }] }],
              },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            id: crypto.randomUUID(),
            day: 1,
            weekday: 2,
            sessions: [
              {
                id: crypto.randomUUID(),
                name: "W2D1-Old",
                order: 0,
                kind: "lifting" as const,
                exercises: [{ id: crypto.randomUUID(), exerciseId: catalog[0].id, order: 0, prescribedSets: [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }] }],
              },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            id: crypto.randomUUID(),
            day: 1,
            weekday: 5,
            sessions: [
              {
                id: crypto.randomUUID(),
                name: "W3D1",
                order: 0,
                kind: "lifting" as const,
                exercises: [{ id: crypto.randomUUID(), exerciseId: catalog[1].id, order: 0, prescribedSets: [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }] }],
              },
            ],
          },
        ],
      },
    ];

    const week2Draft: AiProgramDraft = {
      name: "Week 2 Replacement",
      rationale: "Re-drafted week 2",
      clientSummary: "New week 2",
      sessions: [
        {
          name: "W2D1-New",
          exercises: [{ exerciseId: catalog[0].id, prescribedSets: [{ setNumber: 1, reps: 6, type: "working", amrap: false }] }],
        },
        {
          name: "W2D2-New",
          exercises: [
            { exerciseName: "Brand New Exercise", prescribedSets: [{ setNumber: 1, reps: 8, type: "working", amrap: false }] },
            { exerciseId: "99999999-9999-9999-9999-999999999999", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] },
          ],
        },
      ],
    };

    // trainingDays = [4, 1] -> sorted = [1, 4]
    const { weeks, createdNames, unresolvable } = replaceWeek(
      initialWeeks,
      2,
      week2Draft,
      catalog,
      [4, 1]
    );

    // other week objects pass through untouched (deep equal)
    expect(weeks[0]).toEqual(initialWeeks[0]);
    expect(weeks[2]).toEqual(initialWeeks[2]);

    // replaced week has fresh day/session/exercise ids
    const repWeek = weeks[1];
    expect(repWeek.week).toBe(2);
    expect(repWeek.days).toHaveLength(2);

    const oldDay0 = initialWeeks[1].days[0];
    const newDay0 = repWeek.days[0];
    expect(newDay0.id).not.toBe(oldDay0.id);
    expect(newDay0.sessions[0].id).not.toBe(oldDay0.sessions[0].id);
    expect(newDay0.sessions[0].exercises[0].id).not.toBe(oldDay0.sessions[0].exercises[0].id);

    // day-0 weekday preserved from old week (weekday 2)
    expect(newDay0.weekday).toBe(2);

    // extra day (day 1) defaults from sorted trainingDays: sorted[1] = 4
    const newDay1 = repWeek.days[1];
    expect(newDay1.weekday).toBe(4);

    // createdNames and unresolvable flow through
    expect(createdNames).toEqual(["Brand New Exercise"]);
    expect(unresolvable).toEqual(["99999999-9999-9999-9999-999999999999"]);
  });
});

describe("example library few-shot", () => {
  const example = {
    programId: "pg-1",
    name: "Gold Standard Block",
    goal: "lean bulk hypertrophy",
    level: "intermediate",
    daysPerWeek: 4,
    sessions: [
      {
        name: "Day A",
        exercises: [{ name: "Back Squat", role: "primary", sets: ["5 reps @ RPE 8"] }],
      },
    ],
  };

  test("example library reaches the generation prompt as few-shot", () => {
    const { system, user } = buildGenerationMessages({
      client: { name: "Jonas", goals: "lean bulk to 80 kg", daysPerWeek: 4 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      examples: [example],
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(user).toContain("GOLD-STANDARD EXAMPLE PROGRAMS (the trainer's library");
    expect(user).toContain("- Gold Standard Block (goal: lean bulk hypertrophy · level: intermediate · 4 days/week)");
    expect(user).toContain("  - Day A: Back Squat (primary) [5 reps @ RPE 8]");
    expect(system).toContain(
      "When GOLD-STANDARD EXAMPLE PROGRAMS are provided, treat them as the trainer's gold standard",
    );
    // rule sits right after the kinetic-chain rule
    const chainIdx = system.indexOf("Spread volume across the trainer's five kinetic chains");
    const goldIdx = system.indexOf("When GOLD-STANDARD EXAMPLE PROGRAMS are provided");
    expect(chainIdx).toBeGreaterThan(-1);
    expect(goldIdx).toBeGreaterThan(chainIdx);
    // section lands between CURRENT PROGRAM and PERIODIZATION CONTEXT
    expect(user.indexOf("GOLD-STANDARD EXAMPLE PROGRAMS")).toBeGreaterThan(user.indexOf("CURRENT PROGRAM"));
    expect(user.indexOf("GOLD-STANDARD EXAMPLE PROGRAMS")).toBeLessThan(user.indexOf("PERIODIZATION CONTEXT"));
  });

  test("example library reaches the revision prompt too", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "Initial mesocycle rationale",
      clientSummary: "Client summary",
      sessions: [
        {
          name: "Day A",
          exercises: [
            {
              exerciseName: "Bench Press",
              role: "primary",
              prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 }],
            },
          ],
        },
      ],
    };
    const { system, user } = buildRevisionMessages({
      client: { name: "Jonas", goals: "lean bulk to 80 kg", daysPerWeek: 4 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      examples: [example],
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "more back work",
    });
    expect(user).toContain("- Gold Standard Block (goal: lean bulk hypertrophy · level: intermediate · 4 days/week)");
    expect(system).toContain("When GOLD-STANDARD EXAMPLE PROGRAMS are provided");
  });

  test("no examples renders the none line in generation and revision prompts", () => {
    const base = {
      client: { name: "Ada", daysPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    };
    const gen = buildGenerationMessages(base);
    expect(gen.user).toContain("GOLD-STANDARD EXAMPLE PROGRAMS: none matching this client.");

    const rev = buildRevisionMessages({
      ...base,
      examples: [],
      previousDraft: {
        name: "Block 1",
        rationale: "r",
        clientSummary: "c",
        sessions: [],
      },
      feedback: "tighten volume",
    });
    expect(rev.user).toContain("GOLD-STANDARD EXAMPLE PROGRAMS: none matching this client.");
import {
  buildClientMessageMessages,
  clientMessageStatsText,
} from "./ai/prompt";
import { mockClientMessage } from "./ai/mock";
import type { WeekSummaryStats } from "@pt/shared";

const statsFixture: WeekSummaryStats = {
  week: 3,
  weekStart: "2026-10-15",
  sessionsLogged: 3,
  sessionsPlanned: 4,
  adherencePct: 75,
  overallVolume: 9540,
  overallVolumeDelta: 12,
  sets: 42,
  avgRpe: 8.1,
  bestE1rm: 128.3,
  prs: [
    { exerciseId: "ex-squat", exerciseName: "Back Squat", weightKg: 110, reps: 5, e1rm: 128.3, prevBest: 116.7 },
    { exerciseId: "ex-bench", exerciseName: "Bench Press", weightKg: 80, reps: 5, e1rm: 93.3, prevBest: 70 },
  ],
  nextWeek: { week: 4, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
};

describe("buildClientMessageMessages", () => {
  test("renders client name, stats text, next week and safety rules", () => {
    const { system, user } = buildClientMessageMessages({
      clientName: "Maya Chen",
      programName: "Strength Base A",
      stats: statsFixture,
    });

    // fixed safety rules in the system prompt
    expect(system).toContain("no markdown");
    expect(system).toContain("at most about 120 words");
    expect(system).toContain("NEVER invent or estimate any number");
    expect(system).toContain("Never comment on body weight or appearance");
    expect(system).toContain("2–4 short paragraphs");

    // user prompt: first name + the deterministic stats render
    expect(user).toContain("Maya");
    expect(user).not.toContain("Maya Chen"); // first name only
    expect(user).toContain("Strength Base A");
    expect(user).toContain("WEEK OF 2026-10-15 · 3/4 sessions (75%)");
    expect(user).toContain("VOLUME 9540kg (+12% vs last week) · 42 working sets · avg RPE 8.1");
    expect(user).toContain("PR Back Squat 110kg × 5 (est. 1RM 128.3kg, previous best 116.7kg)");
    expect(user).toContain("NEXT WEEK +intensity · target +2.5% intensity");

    // final-week variant: no next week planned
    const final = buildClientMessageMessages({
      clientName: "Maya Chen",
      programName: "Strength Base A",
      stats: { ...statsFixture, nextWeek: null, prs: [] },
    });
    expect(final.user).toContain("FINAL WEEK OF THE BLOCK — no next week planned");
    expect(final.user).toContain("NO NEW BESTS");
  });
});

describe("clientMessageStatsText", () => {
  test("renders every stat line deterministically", () => {
    const text = clientMessageStatsText(statsFixture);
    expect(text.split("\n")).toEqual([
      "WEEK OF 2026-10-15 · 3/4 sessions (75%)",
      "VOLUME 9540kg (+12% vs last week) · 42 working sets · avg RPE 8.1",
      "PR Back Squat 110kg × 5 (est. 1RM 128.3kg, previous best 116.7kg)",
      "PR Bench Press 80kg × 5 (est. 1RM 93.3kg, previous best 70kg)",
      "NEXT WEEK +intensity · target +2.5% intensity",
    ]);
  });
});

describe("mockClientMessage", () => {
  test("echoes the stats deterministically", () => {
    const a = mockClientMessage(statsFixture);
    const b = mockClientMessage(statsFixture);
    expect(a.message).toBe(b.message);
    expect(a.message.length).toBeGreaterThan(0);
    expect(a.message.length).toBeLessThanOrEqual(1200);
    // references the sessions logged and the first PR
    expect(a.message).toContain("3 of 4 sessions");
    expect(a.message).toContain("Back Squat");
    expect(a.message).toContain("110kg");

    // no PR → volume/compliment path, still deterministic
    const noPr = mockClientMessage({ ...statsFixture, prs: [] });
    expect(noPr.message).toBe(mockClientMessage({ ...statsFixture, prs: [] }).message);
    expect(noPr.message).toContain("9540kg");

    // final week → wrap-up, not a next week
    const final = mockClientMessage({ ...statsFixture, nextWeek: null });
    expect(final.message).toContain("wraps the block");
  });
});
