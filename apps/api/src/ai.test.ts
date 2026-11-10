import { describe, expect, test } from "bun:test";
import { chatJson, extractJsonObject, ProviderError, type ProviderRuntime } from "./ai/provider";
import {
  buildChatSystem,
  buildDistillMessages,
  buildGenerationMessages,
  buildImportMessages,
  buildRevisionMessages,
  buildWeekMessages,
  buildWeekRevisionMessages,
  conversationToText,
  draftSlotsText,
  draftToText,
  periodizationContext,
} from "./ai/prompt";
import { bindPendingExercises, draftToWeeks, replaceWeek } from "./lib/draftToProgram";
import { AiProgramDraft, DEFAULT_GLOSSARY, DELOAD_RULES, mergeRoleLabels, ImportChunk, ProgramWeeksDocument, WEEK11_12_EXTRACTION, importLines, numberedLines } from "@pt/shared";
import { readFileSync } from "node:fs";
import { mockImportContent } from "./ai/mock";

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
      client: { name: "Ada", goals: "get strong", limitations: "Left knee pain — no deep knee flexion", sessionsPerWeek: 3 },
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
    expect(system).toContain('Lifting sessions (kind "lifting") per week: exactly 3.');
  });

  test("session-structure rules: lifting count, separate cardio, focus names, weekdays", () => {
    const base = {
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    };
    const { system } = buildGenerationMessages({ ...base, client: { name: "Ada", sessionsPerWeek: 3, trainingDays: [5, 1, 3] } });
    expect(system).not.toContain("days per week");
    expect(system).not.toContain("count toward days-per-week");
    expect(system).toContain("Cardio sessions never count toward the lifting session number and do not use up a training day");
    expect(system).toContain('unit "sessions" → exactly that many cardio sessions');
    expect(system).toContain('never by weekday or "Day N"');
    expect(system).toContain('Give every session a "weekday" (1=Mon … 7=Sun). Lifting only on Mon, Wed, Fri; cardio on Mon, Wed, Fri. Sessions may share a day.');
    expect(system).toContain("never two key runs on one day");

    const runner = buildGenerationMessages({
      ...base,
      client: { name: "Priya", sessionsPerWeek: 2, trainingDays: [1, 2, 4, 5], cardioDays: [3, 7], longRunDay: 7 },
    });
    expect(runner.system).toContain("Lifting only on Mon, Tue, Thu, Fri; cardio on Mon, Tue, Wed, Thu, Fri, Sun; the long run on Sun.");

    const noDays = buildGenerationMessages({ ...base, client: { name: "Ada", sessionsPerWeek: 3 } });
    expect(noDays.system).toContain("Do not assign weekdays: the app places sessions on the calendar.");
    expect(noDays.system).not.toContain('Give every session a "weekday"');

    // No client setting → fall back to the previous program's LIFTING session count (cardio excluded)
    const fallback = buildGenerationMessages({
      ...base,
      client: { name: "Ada" },
      previousProgram: {
        name: "Block 1",
        sessions: [
          { name: "Lower", kind: "lifting", exercises: [] },
          { name: "Upper", kind: "lifting", exercises: [] },
          { name: "Z2", kind: "cardio", exercises: [] },
        ],
      },
    });
    expect(fallback.system).toContain("per week: exactly 2 (not set on the client — match the current program's lifting sessions)");
    expect(fallback.user).toContain("- Z2 (cardio): ");

    const cold = buildGenerationMessages({ ...base, client: { name: "Ada" } });
    expect(cold.system).toContain("per week: not specified — infer a sensible number from the goals and history");
  });

  test("every draft-producing prompt carries the session-structure rules", () => {
    const base = {
      client: { name: "Ada", sessionsPerWeek: 4 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    };
    const previousDraft: AiProgramDraft = { name: "B", rationale: "r", clientSummary: "c", sessions: [] };
    const week = { ...base, targetWeek: 2, plannedWeeks: 4, targetDirective: null, target: null };
    const systems = [
      buildGenerationMessages(base).system,
      buildRevisionMessages({ ...base, previousDraft, feedback: "f" }).system,
      buildRevisionMessages({ ...base, previousDraft, feedback: "f", outputContract: "proposal" }).system,
      buildWeekMessages(week).system,
      buildWeekRevisionMessages({ ...week, previousDraft, feedback: "f" }).system,
    ];
    for (const sys of systems) {
      expect(sys).toContain('Lifting sessions (kind "lifting") per week: exactly 4.');
      expect(sys).toContain("Cardio is separate");
      expect(sys).not.toContain("Number of sessions must equal");
      expect(sys).not.toContain("**Day 1**");
      expect(sys).toContain(`A deload week means: ${DELOAD_RULES}.`);
    }
    expect(systems[3]).toContain("Keep the current week's sessions in the same order");
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
      client: { name: "Maya", sessionsPerWeek: 4 },
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
      client: { name: "Maya", sessionsPerWeek: 2 },
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
    expect(system).toContain('"role": "power" | "primary" | "secondary" | "strength" | "accessory" | "core"');
    expect(system).toContain("One Primary per lifting session");
    for (const line of [
      "power (Power): Explosive",
      "primary (Primary): The main lift",
      "secondary (Secondary): The second-priority lift",
      "strength (Strength): Work for maximal force",
      "accessory (Auxiliary): Assistance work",
      "core (Core): Trunk and anti-movement",
    ]) {
      expect(system).toContain(line);
    }
    expect(user).toContain("Back Squat (primary) [5 reps]");
  });

  test("the trainer's own labels reach the role rule and the JSON shape, archived ones don't", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const gone = "44444444-4444-4444-8444-444444444444";
    const roleLabels = mergeRoleLabels([
      { id, builtinKey: null, name: "Speed", chip: "Spd", description: "Fast, light reps.", rank: 150, archivedAt: null },
      { id: gone, builtinKey: null, name: "Old", chip: null, description: "Gone.", rank: 160, archivedAt: "2026-01-01" },
      { id: "55555555-5555-4555-8555-555555555555", builtinKey: "core", name: "Core", chip: null, description: "Abs, my way.", rank: 600, archivedAt: null },
    ]);
    const base = { client: { name: "Maya" }, previousProgram: null, periodization: null, chainBalance: null, history: [], catalog: [], trainerInstructions: "", roleLabels };
    for (const { system } of [
      buildGenerationMessages(base),
      buildWeekMessages({ ...base, targetWeek: 2, plannedWeeks: 4, targetDirective: null, target: null }),
    ]) {
      expect(system).toContain(`"role": "power" | "label:${id}" | "primary"`);
      expect(system).toContain(`label:${id} (Speed): Fast, light reps.`);
      expect(system).toContain("core (Core): Abs, my way.");
      expect(system).not.toContain(gone);
    }
  });

  test("catalog lines carry movement pattern and functional movement", () => {
    const { user } = buildGenerationMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
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
      client: { name: "Maya", sessionsPerWeek: 2 },
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
      client: { name: "Maya", sessionsPerWeek: 2 },
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
      client: { name: "Maya", sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: "sets touching each chain: Deep Longitudinal 31 · Lateral 0 · none touching: Lateral",
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(withBalance.user).toContain("KINETIC CHAINS (descriptive, not a balance score");
    expect(withBalance.user).toContain("sets touching each chain: Deep Longitudinal 31 · Lateral 0 · none touching: Lateral");
    expect(withBalance.system).toContain("five kinetic chains");

    const noBalance = buildGenerationMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(noBalance.user).toContain("KINETIC CHAINS: no logged training yet.");
  });

  test("buildGenerationMessages includes the standing direction line", () => {
    const withDir = buildGenerationMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
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
      client: { name: "Maya", sessionsPerWeek: 2 },
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
      client: { name: "Jonas", sessionsPerWeek: 3 },
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

describe("weekly prompts: learned preferences", () => {
  test("learned preferences section lands in weekly generation prompt", () => {
    const { user } = buildWeekMessages({
      client: { name: "Jonas", sessionsPerWeek: 3 },
      targetWeek: 3,
      plannedWeeks: 4,
      targetDirective: null,
      target: null,
      direction: "Build squat volume; keep upper body at maintenance.",
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      learnedPreferences: "Cap RPE at 8.",
    });
    expect(user).toContain(
      "LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\nCap RPE at 8."
    );
    const dirIdx = user.indexOf("STANDING DIRECTION");
    const learnedIdx = user.indexOf("LEARNED PREFERENCES");
    const trainerIdx = user.indexOf("TRAINER INSTRUCTIONS");
    expect(dirIdx).toBeLessThan(learnedIdx);
    expect(learnedIdx).toBeLessThan(trainerIdx);
  });

  test("learned preferences section lands in weekly revision prompt", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "r",
      clientSummary: "s",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [{ exerciseName: "Squat", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    };
    const { user } = buildWeekRevisionMessages({
      client: { name: "Jonas", sessionsPerWeek: 3 },
      targetWeek: 3,
      plannedWeeks: 4,
      targetDirective: null,
      target: null,
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "fix reps",
      learnedPreferences: "Cap RPE at 8.",
    });
    expect(user).toContain(
      "LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\nCap RPE at 8."
    );
    const catalogIdx = user.indexOf("EXERCISE CATALOG");
    const learnedIdx = user.indexOf("LEARNED PREFERENCES");
    const draftIdx = user.indexOf("PREVIOUS DRAFT");
    expect(catalogIdx).toBeLessThan(learnedIdx);
    expect(learnedIdx).toBeLessThan(draftIdx);
  });

  test("weekly prompts are byte-identical without learned preferences", () => {
    const baseCtx = {
      client: { name: "Jonas", sessionsPerWeek: 3 },
      targetWeek: 3,
      plannedWeeks: 4,
      targetDirective: null as null,
      target: null as null,
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [{ id: "ex-1", name: "Incline DB Press", primaryMuscleGroup: "chest", equipment: "dumbbell", movementPattern: null, functionalMovement: null }],
      trainerInstructions: "",
    };

    const draft = buildWeekMessages(baseCtx);
    expect(draft.user).toContain("function n/a)\n\nTRAINER INSTRUCTIONS: none");
    expect(draft.user).not.toContain("LEARNED PREFERENCES");

    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "r",
      clientSummary: "s",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [{ exerciseName: "Squat", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    };
    const revision = buildWeekRevisionMessages({ ...baseCtx, previousDraft, feedback: "fix reps" });
    expect(revision.user).toContain("function n/a)\n\nPREVIOUS DRAFT (your earlier output — revise it):");
    expect(revision.user).not.toContain("LEARNED PREFERENCES");

    expect(buildWeekMessages({ ...baseCtx, learnedPreferences: null }).user).toBe(draft.user);
    expect(
      buildWeekRevisionMessages({ ...baseCtx, previousDraft, feedback: "fix reps", learnedPreferences: null }).user
    ).toBe(revision.user);
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
          kind: "lifting",
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
        sessionsPerWeek: 3,
      },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [{ id: "ex-1", name: "Incline DB Press", primaryMuscleGroup: "chest", equipment: "dumbbell", movementPattern: null, functionalMovement: null }],
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
          kind: "lifting",
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
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: "sets touching each chain: Deep Longitudinal 31 · Lateral 0 · none touching: Lateral",
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "more lateral chain",
    });
    expect(withBalance.user).toContain("KINETIC CHAINS (descriptive, not a balance score");
    expect(withBalance.user).toContain("sets touching each chain: Deep Longitudinal 31 · Lateral 0 · none touching: Lateral");
    expect(withBalance.system).toContain("five kinetic chains");

    const noBalance = buildRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "more lateral chain",
    });
    expect(noBalance.user).toContain("KINETIC CHAINS: no logged training yet.");
  });

  test("learned preferences section lands in generation and revision prompts", () => {
    const gen = buildGenerationMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      learnedPreferences: "Cap RPE at 8.",
    });
    expect(gen.user).toContain(
      "LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\nCap RPE at 8."
    );

    const prevDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "r",
      clientSummary: "s",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [{ exerciseName: "Squat", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    };
    const rev = buildRevisionMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft: prevDraft,
      feedback: "fix reps",
      learnedPreferences: "Cap RPE at 8.",
    });
    expect(rev.user).toContain(
      "LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\nCap RPE at 8."
    );
    const learnedIdx = rev.user.indexOf("LEARNED PREFERENCES");
    const draftIdx = rev.user.indexOf("PREVIOUS DRAFT");
    expect(learnedIdx).toBeLessThan(draftIdx);
  });

  test("prompts are byte-identical without learned preferences", () => {
    const gen = buildGenerationMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(gen.user).toContain("EXERCISE CATALOG (use these exerciseId values when possible):\n\nTRAINER INSTRUCTIONS: none");
    expect(gen.user).not.toContain("LEARNED PREFERENCES");

    const prevDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "r",
      clientSummary: "s",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [{ exerciseName: "Squat", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    };
    const rev = buildRevisionMessages({
      client: { name: "Maya", sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft: prevDraft,
      feedback: "fix reps",
    });
    expect(rev.user).toContain(
      "EXERCISE CATALOG (use these exerciseId values when possible):\n\nPREVIOUS DRAFT (your earlier output — revise it):"
    );
    expect(rev.user).not.toContain("LEARNED PREFERENCES");
  });
});

describe("buildDistillMessages", () => {
  test("buildDistillMessages carries scope, previous document, and rendered signals", () => {
    const trainerWide = buildDistillMessages({
      clientName: null,
      previousDocument: "Old rules:\n- RPE 8 cap",
      signals: [
        {
          kind: "revision",
          clientName: "Maya",
          at: "2026-10-31T05:00:00.000Z",
          text: "swap bench for incline",
        },
      ],
    });
    expect(trainerWide.user).toContain("SCOPE: trainer-wide — all clients");
    expect(trainerWide.user).toContain("PREVIOUS DOCUMENT (keep stable what still holds):\nOld rules:\n- RPE 8 cap");
    expect(trainerWide.user).toContain("- revision · Maya · 2026-10-31: swap bench for incline");

    const clientScoped = buildDistillMessages({
      clientName: "Maya",
      previousDocument: null,
      signals: [
        {
          kind: "instruction",
          clientName: "Maya",
          at: "2026-10-31T05:00:00.000Z",
          text: "no machines",
        },
      ],
    });
    expect(clientScoped.user).toContain("SCOPE: client Maya only");
    expect(clientScoped.user).not.toContain("PREVIOUS DOCUMENT");
    expect(clientScoped.user).toContain("- instruction · Maya · 2026-10-31: no machines");
    expect(clientScoped.system).toContain("You are distilling a personal trainer's standing style preferences");
  });
});

const draft: AiProgramDraft = {
  name: "Block 2",
  rationale: "hold volume, add load",
  clientSummary: "same split, heavier",
  sessions: [
    {
      name: "Day A",
      kind: "lifting",
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
    const s0 = weeks[0].sessions[0];
    expect(s0.exercises[0].exerciseId).toBe("11111111-1111-1111-1111-111111111111");
    expect(s0.exercises[1].exerciseId).toBe("pending:cable crunch");
  });

  test("name refs that exactly match the catalog reuse the catalog id", () => {
    const d2 = { ...draft, sessions: [{ ...draft.sessions[0], exercises: [{ exerciseName: "back squat", prescribedSets: [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }] }] }] };
    const { createdNames, weeks } = draftToWeeks(d2, catalog);
    expect(createdNames).toEqual([]);
    expect(weeks[0].sessions[0].exercises[0].exerciseId).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("bogus id without name is unresolvable, not silently dropped", () => {
    const d3 = { ...draft, sessions: [{ ...draft.sessions[0], exercises: [{ exerciseId: "99999999-9999-9999-9999-999999999999", prescribedSets: [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }] }] }] };
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
          kind: "lifting",
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
    const ex = weeks[0].sessions[0].exercises;
    expect(ex.map((e) => e.exerciseName)).toEqual(["Back Squat", "Bench Press", "Cable Crunch", "Lateral Raise"]);
    expect(ex.map((e) => e.role)).toEqual(["primary", "strength", "core", undefined]);
    expect(ex.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  test("a superset survives the role sort and is tidied", () => {
    const sets = (n: number) => Array.from({ length: n }, (_, i) => ({ setNumber: i + 1, reps: 10, type: "working" as const, amrap: false }));
    const d5: AiProgramDraft = {
      ...draft,
      sessions: [
        {
          name: "Day A",
          kind: "lifting",
          exercises: [
            { exerciseName: "Cable Crunch", role: "core", prescribedSets: sets(3) },
            { exerciseName: "Lateral Raise", role: "accessory", group: "B", prescribedSets: sets(2) },
            { exerciseName: "Face Pull", role: "accessory", group: "B", prescribedSets: sets(3) },
            { exerciseId: "11111111-1111-1111-1111-111111111111", role: "primary", prescribedSets: sets(5) },
            { exerciseName: "Plank", role: "core", group: "C", prescribedSets: sets(3) },
          ],
        },
      ],
    };
    const { weeks } = draftToWeeks(d5, catalog);
    const ex = weeks[0].sessions[0].exercises;
    expect(ex.map((e) => e.exerciseName)).toEqual(["Back Squat", "Lateral Raise", "Face Pull", "Cable Crunch", "Plank"]);
    expect(ex.map((e) => e.group ?? null)).toEqual([null, "A", "A", null, null]);
    expect(ex.map((e) => e.prescribedSets.length)).toEqual([5, 3, 3, 3, 3]);
    expect(ex.map((e) => e.order)).toEqual([0, 1, 2, 3, 4]);
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(true);
  });

  test("draftToWeeks maps cardio draft sessions into cardio sessions", () => {
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
    const sessions = weeks[0].sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].kind).toBe("cardio");
    expect(sessions[0].seq).toBe(1);
    expect(sessions[0].cardio?.modality).toBe("Bike");
    expect(sessions[0].cardio?.durationMin).toBe(30);
    expect(sessions[0].cardio?.hrZone).toBe(2);
    expect(sessions[0].exercises).toEqual([]);
  });

  test("seq numbers each track in draft order; placement spreads lifting and keeps cardio off lifting days", () => {
    const sets = [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }];
    const lift = (name: string, id: string) => ({ name, kind: "lifting" as const, exercises: [{ exerciseId: id, prescribedSets: sets }] });
    const z2 = (name: string) => ({ name, kind: "cardio" as const, cardio: { modality: "Bike", durationMin: 40 }, exercises: [] });
    const d: AiProgramDraft = {
      ...draft,
      sessions: [lift("Lower A", catalog[0].id), z2("Z2 A"), lift("Upper", catalog[1].id), lift("Lower B", catalog[0].id), z2("Z2 B")],
    };
    const patterned = [
      { ...catalog[0], movementPattern: "knee_dominant" },
      { ...catalog[1], movementPattern: "horizontal_push" },
    ];
    // Mon, Tue, Wed, Fri, Sat
    const { weeks } = draftToWeeks(d, patterned, 3, [1, 2, 3, 5, 6]);
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(true);
    const tags = (w: (typeof weeks)[number]) =>
      Object.fromEntries(w.sessions.map((s) => [s.name, `${s.kind}:${s.seq}@${s.weekday}`]));
    const w1 = tags(weeks[0]);
    expect(w1["Lower A"]).toStartWith("lifting:1@");
    expect(w1["Upper"]).toStartWith("lifting:2@");
    expect(w1["Lower B"]).toStartWith("lifting:3@");
    expect(w1["Z2 A"]).toStartWith("cardio:1@");
    expect(w1["Z2 B"]).toStartWith("cardio:2@");
    const dayOf = (name: string) => weeks[0].sessions.find((s) => s.name === name)!.weekday!;
    // the two lower sessions are not on back-to-back days
    expect(Math.abs(dayOf("Lower A") - dayOf("Lower B"))).toBeGreaterThan(1);
    // cardio lands on training days without lifting (5 days, 3 lifting sessions)
    const liftDays = new Set(["Lower A", "Upper", "Lower B"].map(dayOf));
    expect(liftDays.has(dayOf("Z2 A"))).toBe(false);
    expect(liftDays.has(dayOf("Z2 B"))).toBe(false);
    // every week gets the same placement, fresh ids
    expect(tags(weeks[1])).toEqual(w1);
    expect(tags(weeks[2])).toEqual(w1);
    expect(weeks[1].sessions[0].id).not.toBe(weeks[0].sessions[0].id);
  });

  test("AI weekdays that pass the rules are kept; the rest are re-placed (F26)", () => {
    const sets = [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }];
    const patterned = [
      { ...catalog[0], movementPattern: "knee_dominant" },
      { ...catalog[1], movementPattern: "horizontal_push" },
    ];
    const d: AiProgramDraft = {
      ...draft,
      sessions: [
        // Monday is the day after the Sunday long run: must move.
        { name: "Heavy lower", kind: "lifting", weekday: 1, exercises: [{ exerciseId: catalog[0].id, prescribedSets: sets }] },
        { name: "Upper", kind: "lifting", weekday: 4, exercises: [{ exerciseId: catalog[1].id, prescribedSets: sets }] },
        { name: "Easy run", kind: "cardio", weekday: 3, cardio: { modality: "Run", durationMin: 40, hrZone: 2 }, exercises: [] },
        { name: "Long run", kind: "cardio", weekday: 7, cardio: { modality: "Run", durationMin: 80, hrZone: 2 }, exercises: [] },
      ],
    };
    const { weeks } = draftToWeeks(d, patterned, 2, { trainingDays: [1, 2, 4, 5], cardioDays: [3, 7], longRunDay: 7 });
    const dayOf = (name: string) => weeks[0].sessions.find((s) => s.name === name)!.weekday;
    expect([dayOf("Upper"), dayOf("Easy run"), dayOf("Long run")]).toEqual([4, 3, 7]);
    expect(dayOf("Heavy lower")).not.toBe(1);
    expect(weeks[1].sessions.find((s) => s.name === "Heavy lower")!.weekday).toBe(dayOf("Heavy lower"));
  });

  test("the mock draft suggests weekdays that a Mon-Wed-Fri client keeps", async () => {
    const { MOCK_DRAFT } = await import("./ai/mock");
    expect(AiProgramDraft.safeParse(MOCK_DRAFT).success).toBe(true);
    const { weeks } = draftToWeeks(MOCK_DRAFT, catalog, 1, [1, 3, 5]);
    expect(weeks[0].sessions.map((s) => [s.name, s.weekday])).toEqual([
      ["Day A — Lower", 1],
      ["Day B — Upper", 5],
      ["Cardio 1", 3],
    ]);
  });

  test("a weekday outside 1–7 doesn't fail the draft", () => {
    const session = { name: "A", weekday: 9, exercises: [{ exerciseName: "Squat", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] }] };
    const parsed = AiProgramDraft.safeParse({ ...draft, sessions: [session] });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.sessions[0].weekday ?? null).toBeNull();
  });

  test("no training days → every session unscheduled", () => {
    const { weeks } = draftToWeeks(draft, catalog, 2, null);
    expect(weeks.every((w) => w.sessions.every((s) => s.weekday == null))).toBe(true);
  });

  test("drafts with more than 14 sessions produce a document that fails the boundary", () => {
    const fifteenSessionDraft: AiProgramDraft = {
      ...draft,
      sessions: Array.from({ length: 15 }, (_, i) => ({
        name: `Day ${i + 1}`,
        kind: "lifting",
        exercises: [
          {
            exerciseName: `Breach Lift ${i + 1}`,
            prescribedSets: [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }],
          },
        ],
      })),
    };
    const { weeks } = draftToWeeks(fifteenSessionDraft, catalog);
    expect(weeks[0].sessions).toHaveLength(15);
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(false);
  });
});

describe("bindPendingExercises", () => {
  test("replaces pending ids with real ones", () => {
    const { weeks } = draftToWeeks(draft, catalog);
    const bound = bindPendingExercises(weeks, new Map([["cable crunch", "33333333-3333-3333-3333-333333333333"]]));
    expect(bound[0].sessions[0].exercises[1].exerciseId).toBe("33333333-3333-3333-3333-333333333333");
  });

  test("throws on a name that never got an id (programming error)", () => {
    const { weeks } = draftToWeeks(draft, catalog);
    expect(() => bindPendingExercises(weeks, new Map())).toThrow(/cable crunch/);
  });
});

describe("prescription model in the prompts (F22/F23/F28)", () => {
  const ctxBase = { previousProgram: null, periodization: null, chainBalance: null, history: [], catalog: [], trainerInstructions: "" };

  test("the schema lists %1RM, RPE ranges, RIR, tempo, stop RPE and week progression", () => {
    const { system } = buildGenerationMessages({ ...ctxBase, client: { name: "Maya", sessionsPerWeek: 3 } });
    for (const field of ['"percent1rm"', '"targetRpeMin"', '"targetRir"', '"tempo"', '"stopRpe"', '"progression"']) {
      expect(system).toContain(field);
    }
    expect(system).toContain("AMRAP");
    expect(system).not.toContain("go to failure");
  });

  test("the client's 1RMs reach every draft prompt, and are absent when none are recorded", () => {
    const client = { name: "Maya", sessionsPerWeek: 3, oneRepMaxes: [{ exerciseId: "sq-id", name: "Back Squat", kg: 140, date: "2026-10-01" }] };
    const line = "CLIENT 1RMs (for percent1rm): Back Squat [sq-id] 140 kg (2026-10-01)";
    expect(buildGenerationMessages({ ...ctxBase, client }).user).toContain(line);
    expect(buildWeekMessages({ ...ctxBase, client, targetWeek: 2, plannedWeeks: 4, weekDirective: null } as never).user).toContain(line);
    expect(buildGenerationMessages({ ...ctxBase, client: { name: "Maya" } }).user).not.toContain("CLIENT 1RMs");
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
      client: { name: "Maya", sessionsPerWeek: 3, cardioTarget: { unit: "minutes", value: 150 } },
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
      client: { name: "Maya", sessionsPerWeek: 3, cardioTarget: null },
    });
    expect(withoutTarget.user).not.toContain("CARDIO TARGET");

    const sessionsTarget = buildGenerationMessages({
      ...ctxBase,
      client: { name: "Maya", sessionsPerWeek: 3, cardioTarget: { unit: "sessions", value: 2 } },
    });
    expect(sessionsTarget.user).toContain("CARDIO TARGET (per week): 2 sessions");

    const zoneTarget = buildGenerationMessages({
      ...ctxBase,
      client: { name: "Maya", sessionsPerWeek: 3, cardioTarget: { unit: "zone_minutes", value: 120 } },
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
      client: { name: "Maya", sessionsPerWeek: 3, cardioTarget: { unit: "minutes", value: 150 } },
      previousDraft,
      feedback: "more cardio",
    });
    expect(withTarget.user).toContain("CARDIO TARGET (per week): 150 min");
    expect(withTarget.system).toContain(
      "When a CARDIO TARGET is given, the week's cardio prescriptions must add up to it"
    );

    const withoutTarget = buildRevisionMessages({
      ...ctxBase,
      client: { name: "Maya", sessionsPerWeek: 3, cardioTarget: null },
      previousDraft,
      feedback: "more cardio",
    });
    expect(withoutTarget.user).not.toContain("CARDIO TARGET");
  });
});

describe("replaceWeek", () => {
  const sets = [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }];
  const oldLift = (name: string, seq: number, weekday: number | null, order = 0, exerciseId = catalog[0].id) => ({
    id: crypto.randomUUID(),
    name,
    seq,
    weekday,
    order,
    kind: "lifting" as const,
    exercises: [{ id: crypto.randomUUID(), exerciseId, order: 0, prescribedSets: sets }],
  });
  const oldCardio = (name: string, seq: number, weekday: number | null, order = 0) => ({
    id: crypto.randomUUID(),
    name,
    seq,
    weekday,
    order,
    kind: "cardio" as const,
    exercises: [],
    cardio: { modality: "Bike", durationMin: 30 },
  });
  const draftLift = (name: string) => ({ name, kind: "lifting" as const, exercises: [{ exerciseId: catalog[0].id, prescribedSets: sets }] });
  const draftCardio = (name: string) => ({ name, kind: "cardio" as const, cardio: { modality: "Row", durationMin: 25 }, exercises: [] });

  test("replaceWeek splices fresh ids, carries placement by kind:seq, leaves other weeks untouched", () => {
    const initialWeeks = [
      { week: 1, sessions: [oldLift("W1 S1", 1, 1)] },
      {
        week: 2,
        sessions: [oldLift("W2 S1-Old", 1, 2), oldCardio("W2 C1-Old", 1, 2, 1), oldLift("W2 S2-Old", 2, 4)],
      },
      { week: 3, sessions: [oldLift("W3 S1", 1, 5, 0, catalog[1].id)] },
    ];

    const week2Draft: AiProgramDraft = {
      name: "Week 2 Replacement",
      rationale: "Re-drafted week 2",
      clientSummary: "New week 2",
      sessions: [
        draftLift("W2 S1-New"),
        {
          name: "W2 S2-New",
          kind: "lifting",
          exercises: [
            { exerciseName: "Brand New Exercise", prescribedSets: [{ setNumber: 1, reps: 8, type: "working", amrap: false }] },
            { exerciseId: "99999999-9999-9999-9999-999999999999", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] },
          ],
        },
        draftCardio("W2 C1-New"),
        draftLift("W2 S3-New"),
      ],
    };

    const { weeks, createdNames, unresolvable } = replaceWeek(initialWeeks, 2, week2Draft, catalog, [4, 1]);

    // other week objects pass through untouched (deep equal)
    expect(weeks[0]).toEqual(initialWeeks[0]);
    expect(weeks[2]).toEqual(initialWeeks[2]);

    const repWeek = weeks[1];
    expect(repWeek.week).toBe(2);
    expect(repWeek.sessions).toHaveLength(4);
    const by = (name: string) => repWeek.sessions.find((x) => x.name === name)!;

    // fresh session/exercise ids
    const oldIds = new Set<string>(initialWeeks[1].sessions.flatMap((x) => [x.id, ...x.exercises.map((e) => e.id)]));
    for (const x of repWeek.sessions) {
      expect(oldIds.has(x.id)).toBe(false);
      for (const e of x.exercises) expect(oldIds.has(e.id)).toBe(false);
    }

    // matched by kind:seq → old weekday + within-day order
    expect(by("W2 S1-New")).toMatchObject({ kind: "lifting", seq: 1, weekday: 2, order: 0 });
    expect(by("W2 C1-New")).toMatchObject({ kind: "cardio", seq: 1, weekday: 2, order: 1 });
    expect(by("W2 S2-New")).toMatchObject({ kind: "lifting", seq: 2, weekday: 4, order: 0 });

    // unmatched lifting:3 lands on a training day with room
    const s3 = by("W2 S3-New");
    expect(s3.seq).toBe(3);
    expect([1, 4]).toContain(s3.weekday!);

    // createdNames and unresolvable flow through
    expect(createdNames).toEqual(["Brand New Exercise"]);
    expect(unresolvable).toEqual(["99999999-9999-9999-9999-999999999999"]);
  });

  test("unmatched sessions never push a weekday past 4; no room → unscheduled", () => {
    const initialWeeks = [
      {
        week: 1,
        sessions: [oldLift("S1", 1, 1, 0), oldLift("S2", 2, 1, 1), oldLift("S3", 3, 1, 2), oldCardio("C1", 1, 1, 3)],
      },
    ];
    const d: AiProgramDraft = {
      ...draft,
      sessions: [draftLift("S1"), draftLift("S2"), draftLift("S3"), draftLift("S4"), draftCardio("C1"), draftCardio("C2")],
    };
    const { weeks } = replaceWeek(initialWeeks, 1, d, catalog, [1]);
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(true);
    const at = Object.fromEntries(weeks[0].sessions.map((x) => [x.name, x.weekday]));
    expect(at).toEqual({ S1: 1, S2: 1, S3: 1, C1: 1, S4: null, C2: null });
    const unscheduled = weeks[0].sessions.filter((x) => x.weekday == null).map((x) => x.order);
    expect(unscheduled.sort()).toEqual([0, 1]);
  });

  test("no old week and no training days → everything unscheduled", () => {
    const { weeks } = replaceWeek([{ week: 1, sessions: [oldLift("S1", 1, 3)] }], 2, draft, catalog, null);
    expect(weeks).toHaveLength(1); // only an existing week is replaced
    const { weeks: w2 } = replaceWeek(
      [{ week: 1, sessions: [oldCardio("C1", 1, 3)] }],
      1,
      { ...draft, sessions: [draftLift("S1")] },
      catalog,
      null
    );
    expect(w2[0].sessions[0].weekday).toBeNull();
  });
});

describe("draftSlotsText", () => {
  const sets = [{ setNumber: 1, reps: 5, type: "working" as const, amrap: false }];
  const draftLift = (name: string) => ({ name, kind: "lifting" as const, exercises: [{ exerciseId: catalog[0].id, prescribedSets: sets }] });
  const draftCardio = (name: string) => ({ name, kind: "cardio" as const, cardio: { modality: "Row", durationMin: 25 }, exercises: [] });
  test("labels sessions by position (#N) and track tag, never by day", () => {
    const text = draftSlotsText({
      ...draft,
      sessions: [
        draftLift("Lower — squat focus"),
        draftCardio("Zone 2 row"),
        draftLift("Upper — push"),
      ],
    });
    expect(text.split("\n").filter((l) => l.startsWith("#"))).toEqual([
      "#1 Session 1 · Lower — squat focus",
      "#2 Cardio 1 · Zone 2 row",
      "#3 Session 2 · Upper — push",
    ]);
    expect(text).toContain("  slot 1 ");
    expect(text).not.toMatch(/\bD\d/);
  });

  test("lists each cardio session's current prescription for cardio proposals", () => {
    const text = draftSlotsText({ ...draft, sessions: [draftLift("Lower"), draftCardio("Zone 2 row")] });
    expect(text).toContain("#2 Cardio 1 · Zone 2 row\n  cardio Row · 25 min");
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
      client: { name: "Jonas", goals: "lean bulk to 80 kg", sessionsPerWeek: 4 },
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
    const chainIdx = system.indexOf("Read the trainer's five kinetic chains descriptively");
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
          kind: "lifting",
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
      client: { name: "Jonas", goals: "lean bulk to 80 kg", sessionsPerWeek: 4 },
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
      client: { name: "Ada", sessionsPerWeek: 3 },
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
  });
});

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
    expect(user).toContain("VOLUME 9540kg (+12% vs last week) · 42 sets · avg RPE 8.1");
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
      "VOLUME 9540kg (+12% vs last week) · 42 sets · avg RPE 8.1",
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

describe("buildChatSystem", () => {
  test("buildChatSystem grounds scope, client context, latest draft, and learned preferences", () => {
    const fixtureDraft: AiProgramDraft = {
      name: "Strength Block 1",
      rationale: "Progress squat and bench",
      clientSummary: "Great work coming up",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [
            {
              exerciseName: "Squat",
              prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }],
            },
          ],
        },
      ],
    };

    const sys = buildChatSystem({
      client: { name: "Maya", goals: "500lb total", limitations: "mild impingement", sessionsPerWeek: 3 },
      previousProgram: {
        name: "Intro Block",
        sessions: [
          {
            name: "Session A",
            exercises: [{ name: "Squat", sets: ["5 reps @ RPE 7"] }],
          },
        ],
      },
      periodization: "week 2 of 4 · +volume",
      chainBalance: "Anterior 12 sets",
      history: [
        {
          exerciseName: "Squat",
          recentSets: ["100kg × 5"],
          bestE1rm: 116.7,
        },
      ],
      catalog: [
        {
          id: "ex-1",
          name: "Back Squat",
          primaryMuscleGroup: "quads",
          equipment: "barbell",
          movementPattern: "squat",
          functionalMovement: "bilateral_squat",
        },
      ],
      learnedPreferences: "Keep RPE under 8.",
      latestDraft: {
        kind: "block",
        targetWeek: null,
        text: draftToText(fixtureDraft),
        revisionMessage: "swap bench for db press",
      },
    });

    expect(sys).toContain("not a general assistant");
    expect(sys).toContain("Revise draft");
    expect(sys).toContain("CLIENT: Maya");
    expect(sys).toContain("CURRENT PROGRAM (the block you are following up):");
    expect(sys).toContain("Session A: Squat");
    expect(sys).toContain("RECENT TRAINING LOGS (last 8 weeks, oldest → newest):");
    expect(sys).toContain("LATEST DRAFT (under review — the trainer can revise it):");
    expect(sys).toContain("Strength Block 1");
    expect(sys).toContain("Last revision message: swap bench for db press");
    expect(sys).toContain("LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):");
    expect(sys).toContain("Keep RPE under 8.");
    expect(sys).toContain("EXERCISE CATALOG (names for reference):");
    expect(sys).toContain("- ex-1 | Back Squat (quads, barbell, squat, bilateral_squat)");

    // With latestDraft: null
    const sysNoDraft = buildChatSystem({
      client: { name: "Maya", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      latestDraft: null,
    });
    expect(sysNoDraft).toContain("LATEST DRAFT: none under review.");
  });

  test("buildChatSystem omits the preferences section when unset; existing builders unchanged", () => {
    const sys = buildChatSystem({
      client: { name: "Maya", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      latestDraft: null,
      learnedPreferences: null,
    });
    expect(sys).not.toContain("LEARNED PREFERENCES");
  });
});

describe("dated training log in prompts (F11)", () => {
  const base = {
    client: { name: "Priya", sessionsPerWeek: 2, cardioTarget: { unit: "sessions" as const, value: 4 } },
    previousProgram: null,
    periodization: null,
    chainBalance: null,
    history: [],
    catalog: [],
  };
  const log = [
    "2026-11-07 Cardio 2: Run 35 min, zone 2, 6.1 km",
    "2026-11-05 Session 2 (Upper): Squat 140×5@9, 137.5×4@9.5 (back-off)",
  ].join("\n");

  test("chat context carries the dated log and requires dated citations", () => {
    const sys = buildChatSystem({ ...base, trainingLog: log, latestDraft: null });
    expect(sys).toContain(`TRAINING LOG (dated, newest first — every logged set and cardio session, last 8 weeks):\n${log}`);
    expect(sys).toContain('cite dated evidence from the TRAINING LOG, e.g. "Nov 5: 140×5 @ 9"');
    expect(sys).not.toContain("RECENT TRAINING LOGS");
  });

  test("with logged data the chat is told never to claim no completed sessions or a cold start", () => {
    const sys = buildChatSystem({ ...base, trainingLog: log, latestDraft: null });
    expect(sys).toContain("The TRAINING LOG has entries: never say there are no completed sessions");
    expect(sys).not.toContain("cold start");
  });

  test("an empty log says so plainly", () => {
    const sys = buildChatSystem({ ...base, trainingLog: "", latestDraft: null });
    expect(sys).toContain("TRAINING LOG: nothing logged in the last 8 weeks.");
    expect(sys).not.toContain("The TRAINING LOG has entries");
  });

  test("drafting prompts use the dated log too", () => {
    const { user } = buildGenerationMessages({ ...base, trainingLog: log, trainerInstructions: "" });
    expect(user).toContain(`TRAINING LOG (dated, newest first — every logged set and cardio session, last 8 weeks):\n${log}`);
  });
});

describe("chatJson abort handling", () => {
  test("chatJson surfaces AbortError unwrapped when the signal is aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const dummyRt: ProviderRuntime = {
      baseUrl: "http://127.0.0.1:9999",
      model: "test-model",
      apiKey: "test-key",
      maxOutputTokens: 1000,
    };
    let caught: any;
    try {
      await chatJson(dummyRt, [], { signal: ac.signal });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught?.name).toBe("AbortError");
    expect(caught instanceof ProviderError).toBe(false);
  });
});

describe("revision conversation threading", () => {
  test("conversationToText labels roles, collapses whitespace, caps 600 chars", () => {
    expect(conversationToText([])).toBeNull();

    expect(conversationToText([{ role: "trainer", content: " a\n b " }])).toBe("Trainer: a b");

    const long = "x".repeat(700);
    const lines = conversationToText([{ role: "assistant", content: long }])!.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBe("Assistant: ".length + 600);
  });

  test("revision prompts carry the conversation block before trainer feedback", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "Initial mesocycle rationale",
      clientSummary: "Client summary",
      sessions: [
        {
          name: "Day A",
          kind: "lifting",
          exercises: [
            { exerciseName: "Bench Press", role: "primary", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
          ],
        },
      ],
    };
    const conversation = "Trainer: a\nAssistant: b";
    const expected =
      "CONVERSATION SO FAR (earlier chat with the trainer, oldest → newest — context only; apply only the TRAINER FEEDBACK below):\nTrainer: a\nAssistant: b\n\nTRAINER FEEDBACK";

    const revision = buildRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "cut volume",
      conversation,
    });
    expect(revision.user).toContain(expected);

    const weekRevision = buildWeekRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      targetWeek: 2,
      plannedWeeks: 4,
      targetDirective: null,
      target: null,
      trainerInstructions: "",
      previousDraft,
      feedback: "cut volume",
      conversation,
    });
    expect(weekRevision.user).toContain(expected);
  });

  test("revision prompts are byte-identical without a conversation", () => {
    const previousDraft: AiProgramDraft = {
      name: "Block 1",
      rationale: "Initial mesocycle rationale",
      clientSummary: "Client summary",
      sessions: [
        {
          name: "Day A",
          kind: "lifting",
          exercises: [
            { exerciseName: "Bench Press", role: "primary", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
          ],
        },
      ],
    };

    const plain = buildRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "cut volume",
    });
    const withNull = buildRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      previousDraft,
      feedback: "cut volume",
      conversation: null,
    });
    expect(plain).toEqual(withNull);
    expect(plain.user).not.toContain("CONVERSATION SO FAR");

    const plainWeek = buildWeekRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      targetWeek: 2,
      plannedWeeks: 4,
      targetDirective: null,
      target: null,
      trainerInstructions: "",
      previousDraft,
      feedback: "cut volume",
    });
    const withNullWeek = buildWeekRevisionMessages({
      client: { name: "Ada", sessionsPerWeek: 3 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      targetWeek: 2,
      plannedWeeks: 4,
      targetDirective: null,
      target: null,
      trainerInstructions: "",
      previousDraft,
      feedback: "cut volume",
      conversation: null,
    });
    expect(plainWeek).toEqual(withNullWeek);
    expect(plainWeek.user).not.toContain("CONVERSATION SO FAR");
  });
});

describe("draftToText shows rest and duration", () => {
  const withSets = (sets: Array<{ setNumber: number; type: "working"; reps: number; amrap: boolean; durationSeconds?: number; targetRpe?: number; restSeconds?: number }>): AiProgramDraft => ({
    name: "Block",
    rationale: "",
    clientSummary: "",
    sessions: [{ name: "Day", kind: "lifting", exercises: [{ exerciseName: "Squat", prescribedSets: sets }] }],
  });

  test("prints rest after RPE", () => {
    const text = draftToText(withSets([{ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 120 }]));
    expect(text).toContain("[5 reps @ RPE 8, rest 120s]");
  });

  test("prints timed sets in seconds", () => {
    const text = draftToText(withSets([{ setNumber: 1, type: "working", reps: 0, amrap: false, durationSeconds: 45, targetRpe: 7, restSeconds: 60 }]));
    expect(text).toContain("[45s @ RPE 7, rest 60s]");
  });
});

describe("session types in AI drafts", () => {
  const types = [
    { id: "t-str", name: "Strength", format: "lifting" as const },
    { id: "t-z2", name: "Zone 2", format: "cardio" as const },
  ];

  test("prompt lists the trainer's types by format and the schema offers \"type\"", () => {
    const { system, user } = buildGenerationMessages({
      client: { name: "Ada", goals: null, limitations: null, sessionsPerWeek: 2 },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      sessionTypes: [{ name: "Strength", format: "lifting" }, { name: "Zone 2", format: "cardio" }],
      trainerInstructions: "",
    });
    const all = system + user;
    expect(all).toContain("SESSION TYPES (label every session");
    expect(all).toContain("- lifting: Strength");
    expect(all).toContain("- cardio: Zone 2");
    expect(all).toContain('"type"?: string');
  });

  test("a draft type resolves case-insensitively when its format matches; others are dropped", () => {
    const d: AiProgramDraft = {
      ...draft,
      sessions: [
        { ...draft.sessions[0], type: "strength" },
        { name: "Easy ride", kind: "cardio", type: "Zone 2", cardio: { modality: "Bike", durationMin: 30 }, exercises: [] },
        { ...draft.sessions[0], name: "Wrong format", type: "Zone 2" },
        { ...draft.sessions[0], name: "Unknown", type: "Yoga" },
      ],
    };
    const { weeks } = draftToWeeks(d, catalog, 1, null, types);
    const byName = new Map(weeks[0].sessions.map((s) => [s.name, s]));
    expect(byName.get(draft.sessions[0].name)).toMatchObject({ typeId: "t-str", typeName: "Strength" });
    expect(byName.get("Easy ride")).toMatchObject({ typeId: "t-z2", typeName: "Zone 2" });
    expect(byName.get("Wrong format")?.typeId).toBeUndefined();
    expect(byName.get("Unknown")?.typeId).toBeUndefined();
    expect(ProgramWeeksDocument.safeParse(weeks).success).toBe(true);
  });
});

describe("client PROFILE line", () => {
  const base = { previousProgram: null, periodization: null, chainBalance: null, history: [], catalog: [], trainerInstructions: "" };
  const draft: AiProgramDraft = { name: "Block 1", rationale: "r", clientSummary: "s", sessions: [] } as unknown as AiProgramDraft;
  const userBlocks = (client: Parameters<typeof buildGenerationMessages>[0]["client"]) => [
    buildGenerationMessages({ ...base, client }).user,
    buildRevisionMessages({ ...base, client, previousDraft: draft, feedback: "more rows" } as Parameters<typeof buildRevisionMessages>[0]).user,
  ];

  test("all set: one PROFILE line right after CLIENT in both user blocks", () => {
    const client = { name: "Ada", experience: "intermediate", age: 34, sex: "female", bodyweightKg: 72, heightCm: 168 } as const;
    for (const user of userBlocks(client)) {
      const lines = user.split("\n");
      expect(lines[0]).toBe("CLIENT: Ada");
      expect(lines[1]).toBe("PROFILE: intermediate (1–3 yrs training), 34 yrs, female, 72 kg bodyweight, 168 cm");
    }
  });

  test("partial: unset parts are left out", () => {
    for (const user of userBlocks({ name: "Ada", age: 41, heightCm: 180 })) {
      expect(user).toContain("PROFILE: 41 yrs, 180 cm\n");
    }
  });

  test("none: no PROFILE line", () => {
    for (const user of userBlocks({ name: "Ada", experience: null, age: null, sex: null })) {
      expect(user).not.toContain("PROFILE:");
    }
  });
});

describe("buildImportMessages", () => {
  test("numbered lines in, the ImportChunk rules out", () => {
    const lines = importLines("Week 11\n\nSA Row 6-10 reps x 3 sets - 10(20kg)");
    const glossary = [
      { term: "LPD", meaning: "lat pulldown" },
      ...DEFAULT_GLOSSARY,
    ];
    const { system, user } = buildImportMessages({ numbered: numberedLines(lines, 1, 3), from: 1, to: 3, glossary });
    expect(user).toBe("LINES 1–3:\nL1: Week 11\nL2: \nL3: SA Row 6-10 reps x 3 sets - 10(20kg)");
    expect(system).toContain("JSON object only");
    // the trainer's vocabulary replaces the hard-coded shorthand list, personal terms first
    expect(system).toContain("THIS TRAINER'S VOCABULARY (TERM = meaning):\nLPD = lat pulldown\nBB = barbell");
    expect(system).toContain("SA = single arm");
    expect(system).toContain("expand abbreviations as THIS TRAINER'S VOCABULARY below says");
    expect(system).toContain('"newTerms": [{"term": string, "line": number, "meaning": string|null}]');
    expect(system).toContain("Never translate");
    expect(system).toContain("prescription null");
    // the example output shape the prompt describes is what the schema accepts
    expect(ImportChunk.safeParse(WEEK11_12_EXTRACTION).success).toBe(true);
  });

  test("the vocabulary block holds at most 200 terms", () => {
    const glossary = Array.from({ length: 250 }, (_, i) => ({ term: `T${i}`, meaning: "m" }));
    const { system } = buildImportMessages({ numbered: "L1: x", from: 1, to: 1, glossary });
    expect(system).toContain("T199 = m");
    expect(system).not.toContain("T200 = m");
    expect(buildImportMessages({ numbered: "L1: x", from: 1, to: 1, glossary: [] }).system).toContain("(TERM = meaning):\n(none yet)");
  });

  test("mock content is the fixture extraction for the chunk", () => {
    const text = readFileSync(new URL("../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");
    const parsed = ImportChunk.parse(JSON.parse(mockImportContent(importLines(text), 1, 36)));
    expect(parsed.weeks.map((w) => w.label)).toEqual(["Week 11"]);
  });
});
