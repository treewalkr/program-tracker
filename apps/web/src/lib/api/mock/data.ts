import type {
  AssessmentDto,
  HrProfileDto,
  ClientDto,
  ExerciseDto,
  PeriodizationSchemeDto,
  ProgramDto,
  ProgramExampleDto,
  ProgramExerciseDto,
  ProgramSessionDto,
  ProgramWeekDto,
  SessionLogInput,
} from "../types";
import {
  computeHrZones,
  cooperVo2,
  fromCardioTemplate,
  cardioTemplatePreset,
  isoWeekStart,
  localDateOf,
  placeSession,
  placeWeeks,
  primaryPattern,
  sessionKey,
  VO2_FORMULAS,
  withDurationMin,
  type CardioLog,
  type CardioPrescription,
  type LogPrescription,
  type Readiness,
  type SessionFlag,
  type SessionKind,
  type SetType,
  type LoggedBy,
} from "@pt/shared";

/** The sample trainer's own scheme; built-in presets come from SCHEME_PRESETS (@pt/shared). */
export const schemes: PeriodizationSchemeDto[] = [
  {
    id: "sch-6wave",
    name: "6-week wave (coach's own)",
    description: "Two build waves, then two lighter weeks before the next block.",
    basedOn: null,
    updatedAt: null,
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume" },
      { week: 3, directive: "+intensity" },
      { week: 4, directive: "+volume" },
      { week: 5, directive: "transition" },
      { week: 6, directive: "transition" },
    ],
  },
];

import { uuid } from "$lib/uuid";
import { asRelease1 } from "./kindAlias";

export const exercises: ExerciseDto[] = ([
  { id: "ex-squat", name: "Back Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes", "core"], equipment: "barbell", movementPatterns: ["knee_dominant"], functionalMovement: "squat" },
  { id: "ex-bench", name: "Bench Press", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps", "shoulders"], equipment: "barbell", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-row", name: "Barbell Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "barbell", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-rdl", name: "Romanian Deadlift", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: ["glutes", "back"], equipment: "barbell", movementPatterns: ["hip_dominant"], functionalMovement: "bend_lift" },
  { id: "ex-dead", name: "Deadlift", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: ["back", "quads"], equipment: "barbell", movementPatterns: ["hip_dominant"], functionalMovement: "bend_lift" },
  { id: "ex-pulldown", name: "Lat Pulldown", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "cable", movementPatterns: ["vertical_pull"], functionalMovement: "pull" },
  { id: "ex-ohp", name: "Overhead Press", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"], equipment: "barbell", movementPatterns: ["vertical_push"], functionalMovement: "push" },
  { id: "ex-landmine", name: "Landmine Press", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["chest"], equipment: "barbell", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-bss", name: "Bulgarian Split Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "dumbbell", movementPatterns: ["knee_dominant", "hip_dominant"], functionalMovement: "single_leg" },
  { id: "ex-incline", name: "Incline Dumbbell Press", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["shoulders"], equipment: "dumbbell", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-crow", name: "Seated Cable Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "cable", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-facepull", name: "Face Pull", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["back"], equipment: "cable", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-plank", name: "Plank", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["anti_extension"], functionalMovement: null },
  { id: "ex-hlr", name: "Hanging Leg Raise", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["trunk_flexion"], functionalMovement: null },
  { id: "ex-chin", name: "Chin-up", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "bodyweight", movementPatterns: ["vertical_pull"], functionalMovement: "pull" },
  { id: "ex-split", name: "Split Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "bodyweight", movementPatterns: ["knee_dominant"], functionalMovement: "single_leg" },
  { id: "ex-hinge", name: "Dumbbell Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "dumbbell", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-press", name: "Leg Press", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "machine", movementPatterns: ["knee_dominant"], functionalMovement: "squat" },
  { id: "ex-curl", name: "Dumbbell Curl", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [], equipment: "dumbbell", movementPatterns: [], functionalMovement: null },
  { id: "ex-ext", name: "Cable Triceps Extension", primaryMuscleGroup: "triceps", secondaryMuscleGroups: [], equipment: "cable", movementPatterns: [], functionalMovement: null },
] as Omit<ExerciseDto, "note" | "custom" | "archivedAt" | "usedIn">[]).map((e) => ({
  ...e,
  note: null,
  custom: false,
  archivedAt: null,
  usedIn: 0,
}));

export const clients: ClientDto[] = [
  {
    id: "cl-maya",
    name: "Maya Chen",
    email: "maya.chen@example.com",
    status: "active",
    goals: "First unassisted pull-up and a 60 kg back squat by December.",
    limitations: "Right shoulder impingement — no barbell overhead pressing, no behind-neck work.",
    sessionsPerWeek: 4,
    trainingDays: [1, 2, 4, 5],
    experience: "beginner",
    birthDate: "1994-06-21",
    sex: "female",
    bodyweightKg: 58,
    heightCm: 162,
    startedOn: "2026-03-02",
    phone: "+66 81 234 5678",
  },
  {
    id: "cl-jonas",
    name: "Jonas Weber",
    email: "jonas.weber@example.com",
    status: "active",
    goals: "Lean bulk to 80 kg bodyweight, keep visible abs.",
    limitations: null,
    sessionsPerWeek: 3,
    trainingDays: [2, 4, 6],
    experience: "intermediate",
    birthDate: "1989-11-02",
    sex: "male",
    bodyweightKg: 76.5,
    heightCm: 181,
    startedOn: "2025-09-15",
  },
  {
    id: "cl-priya",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    status: "paused",
    goals: "General strength, twice a week is all I can commit to.",
    limitations: "Old left ankle sprain — avoid high-impact jumping.",
    sessionsPerWeek: 2,
    trainingDays: [3, 5],
    experience: "advanced",
    birthDate: "1981-02-09",
  },
];

const S = (setNumber: number, reps: number, extra: Partial<ProgramExerciseDto["prescribedSets"][0]> = {}) => ({
  setNumber,
  type: "working" as const,
  reps,
  amrap: false,
  ...extra,
});

/** Movement pattern lookup for the placer (mock catalog). */
export const patternOf = (exerciseId: string) => {
  const e = exercises.find((x) => x.id === exerciseId);
  return e ? primaryPattern(e) : null;
};

type SessionTemplate = {
  id?: string;
  name: string;
  order?: number;
  kind?: "exercises" | "cardio";
  cardio?: CardioPrescription | null;
  exercises?: ProgramExerciseDto[];
  notes?: string;
  /** Leave this session unscheduled ("any day") after default placement. */
  anyDay?: boolean;
};

/**
 * Build a program's weeks the way the API does: a flat one-week session list
 * (seq per kind in template order), stamped across weeks, placed by the
 * shared placer. Templates are grouped as before only for readability.
 */
function makeWeeks(
  dayTemplates: { sessions: SessionTemplate[] }[],
  plannedWeeks = 4,
  trainingDays?: number[] | null,
  week2Changes?: (sessions: ProgramSessionDto[]) => ProgramSessionDto[]
): ProgramWeekDto[] {
  const seq = { exercises: 0, cardio: 0 };
  const flat = dayTemplates.flatMap((d) => d.sessions);
  const week1: ProgramSessionDto[] = flat.map((s) => {
    const kind = s.kind ?? (s.cardio ? "cardio" : "exercises");
    return {
      id: s.id ?? uuid(),
      name: s.name,
      seq: ++seq[kind],
      weekday: null,
      order: 0,
      kind,
      notes: s.notes,
      exercises: s.exercises ?? [],
      cardio: s.cardio ?? null,
    };
  });
  const anyDay = new Set(flat.flatMap((s, i) => (s.anyDay ? [sessionKey(week1[i])] : [])));

  const weeks: ProgramWeekDto[] = [{ week: 1, sessions: week1 }];
  for (let w = 2; w <= plannedWeeks; w++) {
    const base = w === 2 && week2Changes ? week2Changes(week1) : week1;
    weeks.push({
      week: w,
      sessions: base.map((s) => ({
        ...s,
        id: uuid(),
        exercises: s.exercises.map((e) => ({ ...e, id: uuid() })),
      })),
    });
  }

  const placed = placeWeeks(weeks, trainingDays, patternOf);
  if (anyDay.size === 0) return placed;
  return placed.map((wk) => {
    let next = wk;
    for (const s of wk.sessions) if (anyDay.has(sessionKey(s))) next = placeSession(next, s.id, null, 99);
    return next;
  });
}

export const programs: ProgramDto[] = [
  {
    id: "pg-maya-a",
    trainerId: "me",
    clientId: "cl-maya",
    name: "Strength Base A",
    description: "Full-body strength base, 4 days. Neutral-grip pressing only.",
    status: "active",
    version: 3,
    aiAssisted: false,
    createdFromProgramId: null,
    direction: null,
    createdAt: "2026-07-14T09:00:00Z",
    activatedAt: new Date(Date.now() - 35 * 86400_000).toISOString(),
    startsOn: new Date(Date.now() - 35 * 86400_000).toISOString().slice(0, 10),
    phasing: {
      plannedWeeks: 6,
      phase: "accumulation",
      nextPhase: "intensification",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "base" },
        { week: 5, directive: "+volume" },
        { week: 6, directive: "deload" },
      ],
    },
    weeks: makeWeeks(
      [
        {
          sessions: [
            {
              id: "ps-maya-1",
              name: "Lower — squat",
              exercises: [
                { id: "pe-maya-1", exerciseId: "ex-squat", role: "primary", order: 0, prescribedSets: [S(1, 5, { targetRpe: 8, restSeconds: 180 }), S(2, 5, { targetRpe: 8, restSeconds: 180 }), S(3, 5, { amrap: true, targetRpe: 9, restSeconds: 180 })], notes: "2s pause in the hole on last set" },
                { id: "pe-maya-2", exerciseId: "ex-rdl", role: "strength", order: 1, prescribedSets: [S(1, 8, { targetRpe: 7, restSeconds: 120 }), S(2, 8, { targetRpe: 7, restSeconds: 120 }), S(3, 8, { targetRpe: 7, restSeconds: 120 })] },
                { id: "pe-maya-3", exerciseId: "ex-plank", role: "core", order: 2, prescribedSets: [S(1, 45, { restSeconds: 60 }), S(2, 45, { restSeconds: 60 })], notes: "45s holds" },
              ],
            },
          ],
        },
        {
          sessions: [
            {
              id: "ps-maya-2",
              name: "Upper — press & pull",
              exercises: [
                { id: "pe-maya-4", exerciseId: "ex-landmine", role: "primary", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 120 }), S(2, 8, { targetRpe: 8, restSeconds: 120 }), S(3, 8, { targetRpe: 8, restSeconds: 120 })], notes: "Shoulder-friendly pressing slot" },
                { id: "pe-maya-5", exerciseId: "ex-pulldown", role: "strength", order: 1, prescribedSets: [S(1, 10, { targetRpe: 8, restSeconds: 90 }), S(2, 10, { targetRpe: 8, restSeconds: 90 }), S(3, 10, { amrap: true, targetRpe: 9, restSeconds: 90 })] },
                { id: "pe-maya-6", exerciseId: "ex-facepull", role: "accessory", order: 2, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 }), S(3, 15, { restSeconds: 60 })] },
              ],
            },
            {
              id: "ps-maya-2b",
              name: "Zone 2 bike",
              kind: "cardio",
              cardio: { modality: "Bike", durationMin: 20, hrZone: 2 },
            },
            {
              id: "ps-maya-walk",
              name: "Easy walk",
              kind: "cardio",
              cardio: { modality: "Walk", durationMin: 30, hrZone: 1 },
              notes: "Any day that suits — outdoors if possible.",
              anyDay: true,
            },
          ],
        },
        {
          sessions: [
            {
              id: "ps-maya-3",
              name: "Lower — hinge",
              exercises: [
                { id: "pe-maya-7", exerciseId: "ex-dead", role: "primary", order: 0, prescribedSets: [S(1, 5, { targetRpe: 8, restSeconds: 210 }), S(2, 5, { targetRpe: 8, restSeconds: 210 })] },
                { id: "pe-maya-8", exerciseId: "ex-bss", role: "strength", order: 1, prescribedSets: [S(1, 10, { targetRpe: 7, restSeconds: 90 }), S(2, 10, { targetRpe: 7, restSeconds: 90 }), S(3, 10, { targetRpe: 7, restSeconds: 90 })] },
                { id: "pe-maya-9", exerciseId: "ex-hlr", role: "core", order: 2, prescribedSets: [S(1, 10, { restSeconds: 60 }), S(2, 10, { restSeconds: 60 }), S(3, 10, { restSeconds: 60 })] },
              ],
            },
          ],
        },
        {
          sessions: [
            {
              id: "ps-maya-4",
              name: "Upper — chin-up focus",
              exercises: [
                { id: "pe-maya-10", exerciseId: "ex-incline", role: "primary", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 120 }), S(2, 8, { targetRpe: 8, restSeconds: 120 }), S(3, 8, { amrap: true, targetRpe: 9, restSeconds: 120 })] },
                { id: "pe-maya-11", exerciseId: "ex-crow", role: "strength", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 }), S(3, 12, { targetRpe: 7, restSeconds: 90 })] },
                { id: "pe-maya-12", exerciseId: "ex-chin", role: "strength", order: 2, prescribedSets: [S(1, 6, { amrap: true, targetRpe: 9, restSeconds: 120 }), S(2, 6, { amrap: true, targetRpe: 9, restSeconds: 120 })], notes: "Band-assisted, reduce band when 8+ reps" },
                { id: "pe-maya-13", exerciseId: "ex-curl", role: "accessory", order: 3, prescribedSets: [S(1, 12, { restSeconds: 60 }), S(2, 12, { restSeconds: 60 })] },
              ],
            },
          ],
        },
      ],
      6,
      [1, 2, 4, 5],
      (w1) =>
        w1.map((s) =>
          s.id === "ps-maya-4"
            ? {
                ...s,
                exercises: [
                  ...s.exercises,
                  { id: uuid(), exerciseId: "ex-ext", role: "accessory", order: 4, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 })] },
                ],
              }
            : s
        )
    ),
  },
  {
    id: "pg-maya-0",
    trainerId: "me",
    clientId: "cl-maya",
    name: "Onboarding Intro",
    description: "Two weeks of technique work.",
    status: "archived",
    version: 1,
    aiAssisted: false,
    createdFromProgramId: null,
    direction: null,
    createdAt: "2026-06-30T09:00:00Z",
    activatedAt: null,
    startsOn: null,
    phasing: null,
    weeks: makeWeeks(
      [
        { sessions: [{ id: "ps-maya-i1", name: "Full body A", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-split", order: 0, prescribedSets: [S(1, 10), S(2, 10), S(3, 10)] }, { id: uuid(), exerciseId: "ex-hinge", order: 1, prescribedSets: [S(1, 12), S(2, 12)] }] }] },
        { sessions: [{ id: "ps-maya-i2", name: "Full body B", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-press", order: 0, prescribedSets: [S(1, 12), S(2, 12)] }] }] },
      ],
      2,
      [1, 3]
    ),
  },
  {
    id: "pg-jonas-a",
    trainerId: "me",
    clientId: "cl-jonas",
    name: "Hypertrophy Block 2",
    description: "3-day upper/lower/upper split, 8–12 rep focus.",
    status: "active",
    version: 2,
    direction: "Build squat volume; keep upper body at maintenance.",
    aiAssisted: true,
    createdFromProgramId: "pg-jonas-0",
    createdAt: "2026-08-02T09:00:00Z",
    activatedAt: new Date(Date.now() - 12 * 86400_000).toISOString(),
    startsOn: new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10),
    phasing: {
      plannedWeeks: 6,
      phase: "hypertrophy",
      nextPhase: "deload",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "+volume" },
        { week: 5, directive: "transition" },
        { week: 6, directive: "transition" },
      ],
    },
    weeks: makeWeeks(
      [
        { sessions: [{ id: "ps-jonas-1", name: "Upper A", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-bench", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 150 }), S(2, 8, { targetRpe: 8, restSeconds: 150 }), S(3, 8, { targetRpe: 8, restSeconds: 150 })] }, { id: uuid(), exerciseId: "ex-crow", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 }), S(3, 12, { targetRpe: 7, restSeconds: 90 })] }, { id: uuid(), exerciseId: "ex-ext", order: 2, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 })] }] }] },
        { sessions: [{ id: "ps-jonas-2", name: "Lower", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-squat", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 150 }), S(2, 8, { targetRpe: 8, restSeconds: 150 })] }, { id: uuid(), exerciseId: "ex-rdl", order: 1, prescribedSets: [S(1, 10, { targetRpe: 7, restSeconds: 120 }), S(2, 10, { targetRpe: 7, restSeconds: 120 })] }] }] },
        { sessions: [{ id: "ps-jonas-3", name: "Upper B", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-incline", order: 0, prescribedSets: [S(1, 10, { targetRpe: 8, restSeconds: 120 }), S(2, 10, { targetRpe: 8, restSeconds: 120 })] }, { id: uuid(), exerciseId: "ex-pulldown", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 })] }] }] },
      ],
      6,
      [2, 4, 6]
    ),
  },
  {
    id: "pg-jonas-0",
    trainerId: "me",
    clientId: "cl-jonas",
    name: "Hypertrophy Block 1",
    description: null,
    status: "archived",
    version: 1,
    aiAssisted: false,
    createdFromProgramId: null,
    direction: null,
    createdAt: "2026-06-15T09:00:00Z",
    activatedAt: null,
    startsOn: null,
    phasing: null,
    weeks: makeWeeks(
      [{ sessions: [{ id: uuid(), name: "Full body", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-bench", order: 0, prescribedSets: [S(1, 10), S(2, 10), S(3, 10)] }] }] }],
      1,
      [2]
    ),
  },
  {
    id: "pg-priya-a",
    trainerId: "me",
    clientId: "cl-priya",
    name: "Maintain & Move",
    description: "2×/week, joint-friendly.",
    status: "draft",
    version: 1,
    aiAssisted: false,
    createdFromProgramId: null,
    direction: null,
    createdAt: "2026-09-10T09:00:00Z",
    activatedAt: null,
    startsOn: null,
    phasing: null,
    weeks: makeWeeks(
      [{ sessions: [{ id: uuid(), name: "Full body", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-press", order: 0, prescribedSets: [S(1, 12), S(2, 12)] }, { id: uuid(), exerciseId: "ex-crow", order: 1, prescribedSets: [S(1, 12), S(2, 12)] }] }] }],
      1,
      [3, 5]
    ),
  },
];

// Working-set load targets — what the coach prescribed for the current block
// (last logged progression + the next planned jump). Absent = bodyweight / RPE-driven.
const LOAD_TARGETS: Record<string, number> = {
  "ex-squat": 65,
  "ex-bench": 45,
  "ex-row": 55,
  "ex-rdl": 62.5,
  "ex-dead": 82.5,
  "ex-pulldown": 47.5,
  "ex-landmine": 35,
  "ex-incline": 22,
  "ex-crow": 45,
  "ex-bss": 20,
  "ex-press": 110,
  "ex-hinge": 26,
  "ex-curl": 12,
  "ex-ext": 25,
};
for (const p of programs) {
  for (const w of p.weeks) {
    for (const s of w.sessions) {
      for (const e of s.exercises) {
        const target = LOAD_TARGETS[e.exerciseId];
        if (!target) continue;
        for (const ps of e.prescribedSets) {
          if (ps.type === "working") ps.targetWeightKg = target;
        }
      }
    }
  }
}

export interface StoredLog {
  sessionLogId: string;
  /** Who entered it; absent = the trainer. */
  loggedBy?: LoggedBy;
  clientId: string;
  programId: string;
  /** The program session it was logged against; absent = freestyle. */
  programSessionId?: string | null;
  date: string;
  kind?: SessionKind;
  cardio?: CardioLog | null;
  perceivedEnergy?: number;
  readiness?: Readiness | null;
  flags?: SessionFlag[] | null;
  notes?: string;
  /** Minutes from first entry to Save (portal, logged live). */
  durationMin?: number | null;
  /** The prescribed session as it was when logged (see LogPrescription). */
  prescription?: LogPrescription | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  trainerFeedback?: string | null;
  sets: {
    programExerciseId?: string | null;
    exerciseId: string;
    setNumber: number;
    type: SetType;
    weightKg?: number;
    reps: number;
    rpe?: number;
  }[];
}

const day = (offset: number) =>
  new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);

/** 8 weeks of Maya's squat/landmine/pulldown/chin/RDL progress — the AI's fuel. */
export const logs: StoredLog[] = [
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(42), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 50, reps: 5, rpe: 7 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 50, reps: 5, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(35), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 52.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 52.5, reps: 4, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 30, reps: 8, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(28), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 55, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 55, reps: 5, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 1, type: "working", weightKg: 41, reps: 10, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 2, type: "working", weightKg: 41, reps: 9, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(21), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 57.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 57.5, reps: 5, rpe: 9 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 57.5, reps: 6, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 1, type: "working", reps: 5, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 2, type: "working", reps: 4, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 32.5, reps: 8, rpe: 7 },
    { exerciseId: "ex-landmine", setNumber: 2, type: "working", weightKg: 32.5, reps: 8, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(14), perceivedEnergy: 9, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 57.5, reps: 5, rpe: 7 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 60, reps: 5, rpe: 9 },
    { exerciseId: "ex-pulldown", setNumber: 1, type: "working", weightKg: 45.5, reps: 10, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 2, type: "working", weightKg: 45.5, reps: 8, rpe: 9 },
    { exerciseId: "ex-rdl", setNumber: 1, type: "working", weightKg: 60, reps: 8, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(7), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 62.5, reps: 5, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 1, type: "working", reps: 6, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 2, type: "working", reps: 5, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 35, reps: 8, rpe: 8 },
    { exerciseId: "ex-landmine", setNumber: 2, type: "working", weightKg: 35, reps: 7, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(3), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 62.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 62.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 62.5, reps: 7, rpe: 9 },
    { exerciseId: "ex-dead", setNumber: 2, type: "working", weightKg: 80, reps: 5, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 1, type: "working", weightKg: 50, reps: 10, rpe: 8 },
  ], notes: "Squat felt smooth, +2.5 on AMRAP." },
  { sessionLogId: uuid(), clientId: "cl-jonas", programId: "pg-jonas-a", date: day(5), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-bench", setNumber: 1, type: "working", weightKg: 70, reps: 8, rpe: 8 },
    { exerciseId: "ex-bench", setNumber: 2, type: "working", weightKg: 70, reps: 8, rpe: 8 },
    { exerciseId: "ex-crow", setNumber: 1, type: "working", weightKg: 55, reps: 12, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-jonas", programId: "pg-jonas-a", date: day(2), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 90, reps: 8, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 90, reps: 8, rpe: 9 },
    { exerciseId: "ex-rdl", setNumber: 1, type: "working", weightKg: 100, reps: 10, rpe: 7 },
  ]},
];

export const sessionLogInputs: SessionLogInput[] = [];

export const examples: ProgramExampleDto[] = [
  {
    id: "exx-jonas-hyp",
    programId: "pg-jonas-a",
    goal: "lean bulk hypertrophy",
    level: "intermediate",
    daysPerWeek: 4,
    note: "Jonas's lean-bulk block — the 8–12 rep split to reuse.",
    createdAt: "2026-10-20T09:00:00Z",
    program: programs.find((p) => p.id === "pg-jonas-a")!,
  },
];

// ---------------------------------------------------------------------------
// Coach-supplied program (real format from the trainer's own programming):
// hypertrophy block with mobility prep, rep ranges, pyramids, timed work,
// failure sets and cardio prescriptions — plus the next strength block as draft.
// ---------------------------------------------------------------------------
export const trainerExercises: ExerciseDto[] = ([
  { id: "ex-latstretch", name: "Lateral Stretch", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["no_pattern"], functionalMovement: null },
  { id: "ex-scapdep", name: "Scapular Depression", primaryMuscleGroup: "lats", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: [], functionalMovement: null },
  { id: "ex-pullup", name: "Pull up (Power)", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "bodyweight", movementPatterns: ["vertical_pull"], functionalMovement: "pull" },
  { id: "ex-sarow", name: "SA Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "dumbbell", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-bentrow-sup", name: "Bent over row (Supinate)", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "barbell", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-lowrow", name: "Low row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "cable", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-bbcurl", name: "BB standing biceps", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [], equipment: "barbell", movementPatterns: [], functionalMovement: null },
  { id: "ex-cheststretch", name: "Chest stretch (PAILs/RAILs)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["no_pattern"], functionalMovement: null },
  { id: "ex-cars", name: "Shoulder mobility (CARs)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["no_pattern"], functionalMovement: null },
  { id: "ex-extrot", name: "Shoulder external rotation", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: [], equipment: "band", movementPatterns: [], functionalMovement: null },
  { id: "ex-cgmp", name: "Close grip Military press (Asymmetrical)", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"], equipment: "barbell", movementPatterns: ["vertical_push"], functionalMovement: "push" },
  { id: "ex-dbbench", name: "DB Bench press", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"], equipment: "dumbbell", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-widechest", name: "Wide chest press", primaryMuscleGroup: "chest", secondaryMuscleGroups: [], equipment: "machine", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-ovhext", name: "Triceps OVH extension", primaryMuscleGroup: "triceps", secondaryMuscleGroups: [], equipment: "cable", movementPatterns: [], functionalMovement: null },
  { id: "ex-hipflex", name: "Hip flexor stretch (Static)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["no_pattern"], functionalMovement: null },
  { id: "ex-hipcars", name: "Hip mobility (CARs)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["no_pattern"], functionalMovement: null },
  { id: "ex-kbdlsq", name: "KB Deadlift to Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "kettlebell", movementPatterns: ["knee_dominant"], functionalMovement: "squat" },
  { id: "ex-kbswing", name: "KB American Swing", primaryMuscleGroup: "glutes", secondaryMuscleGroups: ["hamstrings"], equipment: "kettlebell", movementPatterns: [], functionalMovement: null },
  { id: "ex-frontsquat", name: "Front Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["core"], equipment: "barbell", movementPatterns: ["knee_dominant"], functionalMovement: "squat" },
  { id: "ex-bblunge", name: "BB Static Lunge", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "barbell", movementPatterns: ["knee_dominant"], functionalMovement: "single_leg" },
  { id: "ex-hipthrust", name: "Hip thrust", primaryMuscleGroup: "glutes", secondaryMuscleGroups: ["hamstrings"], equipment: "barbell", movementPatterns: ["hip_dominant"], functionalMovement: "bend_lift" },
  { id: "ex-deadbug", name: "Dead bug + Pullover", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: [], functionalMovement: null },
  { id: "ex-catcamel", name: "Cat camel", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["no_pattern"], functionalMovement: null },
  { id: "ex-ropecrunch", name: "Rope crunch", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "cable", movementPatterns: ["trunk_flexion"], functionalMovement: null },
  { id: "ex-torsotwist", name: "MC Torso Twist", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "machine", movementPatterns: ["rotation"], functionalMovement: "rotation" },
  { id: "ex-sideplank", name: "Elbow side plank", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["anti_lateral_flexion"], functionalMovement: null },
  { id: "ex-pushpress", name: "Push press", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"], equipment: "barbell", movementPatterns: ["vertical_push"], functionalMovement: "push" },
  { id: "ex-kinesisincline", name: "Incline bench press (Kinesis)", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["shoulders"], equipment: "machine", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-crossover", name: "Crossover / Dip", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"], equipment: "cable", movementPatterns: ["vertical_push"], functionalMovement: "push" },
  { id: "ex-pushup", name: "Push up", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"], equipment: "bodyweight", movementPatterns: ["horizontal_push"], functionalMovement: "push" },
  { id: "ex-trirope", name: "Triceps rope push down", primaryMuscleGroup: "triceps", secondaryMuscleGroups: [], equipment: "cable", movementPatterns: [], functionalMovement: null },
  { id: "ex-highpull", name: "Power high pull", primaryMuscleGroup: "back", secondaryMuscleGroups: ["shoulders"], equipment: "barbell", movementPatterns: [], functionalMovement: null },
  { id: "ex-vbarrow", name: "V-bar row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "machine", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-reardelt", name: "Rear delt row", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["back"], equipment: "cable", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-invertrow", name: "Invert row", primaryMuscleGroup: "back", secondaryMuscleGroups: [], equipment: "bodyweight", movementPatterns: ["horizontal_pull"], functionalMovement: "pull" },
  { id: "ex-ropetwist", name: "Biceps rope curl", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [], equipment: "cable", movementPatterns: [], functionalMovement: null },
  { id: "ex-walklunge", name: "Walking lunge", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "bodyweight", movementPatterns: ["knee_dominant"], functionalMovement: "single_leg" },
  { id: "ex-legext", name: "Leg extensions", primaryMuscleGroup: "quads", secondaryMuscleGroups: [], equipment: "machine", movementPatterns: ["knee_dominant"], functionalMovement: "squat" },
  { id: "ex-legcurl", name: "Leg curl", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: [], equipment: "machine", movementPatterns: ["hip_dominant"], functionalMovement: "bend_lift" },
  { id: "ex-skierg", name: "SkiErg", primaryMuscleGroup: "cardio", secondaryMuscleGroups: ["back", "core"], equipment: "machine", movementPatterns: ["multi_movement"], functionalMovement: null },
  { id: "ex-wallball", name: "Wall Ball", primaryMuscleGroup: "full_body", secondaryMuscleGroups: ["quads", "shoulders"], equipment: "other", movementPatterns: ["knee_dominant", "vertical_push"], functionalMovement: "squat" },
  { id: "ex-stepup", name: "Step-up", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "dumbbell", movementPatterns: ["knee_dominant"], functionalMovement: "single_leg" },
  { id: "ex-latraise", name: "Dumbbell Lateral Raise", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: [], equipment: "dumbbell", movementPatterns: ["isolation"], functionalMovement: null },
] as Omit<ExerciseDto, "note" | "custom" | "archivedAt" | "usedIn">[]).map((e) => ({
  ...e,
  note: null,
  custom: true,
  archivedAt: null,
  usedIn: 0,
}));
exercises.push(...trainerExercises);

export const trainerClient: ClientDto = {
  id: "cl-nat",
  name: "Nattapong W.",
  email: "nattapong@example.com",
  status: "active",
  goals: "Off-season: sarcoplasmic hypertrophy block, then strength interlude.",
  limitations: null,
  sessionsPerWeek: 4,
  trainingDays: [1, 2, 4, 6],
  cardioTarget: { unit: "minutes", value: 180 },
};
clients.push(trainerClient);

const many = (n: number, reps: number, extra: Partial<ProgramExerciseDto["prescribedSets"][0]> = {}) =>
  Array.from({ length: n }, (_, i) => S(i + 1, reps, extra));

const range = (n: number, min: number, max: number, extra: Partial<ProgramExerciseDto["prescribedSets"][0]> = {}) =>
  many(n, max, { repsMin: min, ...extra });

const timed = (n: number, seconds: number, extra: Partial<ProgramExerciseDto["prescribedSets"][0]> = {}) =>
  many(n, 0, { durationSeconds: seconds, ...extra });

const toFailure = (n: number) => many(n, 0, { amrap: true });

export const trainerProgram: ProgramDto = {
  id: "pg-nat-a",
  trainerId: "me",
  clientId: "cl-nat",
  name: "Sarcoplasmic Hypertrophy",
  description: "4 days + cardio. Rest day + easy run 1–2 days per week.",
  status: "active",
  version: 2,
  aiAssisted: false,
  createdFromProgramId: null,
  direction: null,
  activatedAt: new Date(Date.now() - 6 * 86400_000).toISOString(),
  startsOn: new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10),
  phasing: {
    plannedWeeks: 6,
    phase: "Sarcoplasmic hypertrophy",
    nextPhase: "Strength interlude",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume" },
      { week: 3, directive: "+intensity" },
      { week: 4, directive: "+volume" },
      { week: 5, directive: "transition" },
      { week: 6, directive: "transition" },
    ],
  },
  createdAt: new Date(Date.now() - 8 * 86400_000).toISOString(),
  weeks: makeWeeks(
    [
      {
        sessions: [
          {
            id: "ps-nat-1", name: "Back / Biceps", order: 0, notes: "Strict rows today. Leave a rep or two in the tank.",
            exercises: [
              { id: "pe-nat-1", exerciseId: "ex-latstretch", order: 0, prescribedSets: timed(2, 15), notes: "Static stretch" },
              { id: "pe-nat-2", exerciseId: "ex-scapdep", order: 1, prescribedSets: many(2, 10), notes: "1–2 sets" },
              { id: "pe-nat-3", exerciseId: "ex-pullup", order: 2, prescribedSets: many(3, 6, { restSeconds: 120 }), notes: "Power intent — move fast" },
              { id: "pe-nat-4", exerciseId: "ex-sarow", order: 3, prescribedSets: range(3, 6, 10) },
              { id: "pe-nat-5", exerciseId: "ex-bentrow-sup", order: 4, prescribedSets: many(5, 5, { restSeconds: 150 }), notes: "Supinate grip" },
              { id: "pe-nat-6", exerciseId: "ex-pulldown", order: 5, prescribedSets: [S(1, 10), S(2, 8), S(3, 6), S(4, 5)], notes: "Pyramid" },
              { id: "pe-nat-7", exerciseId: "ex-lowrow", order: 6, prescribedSets: [S(1, 10), S(2, 8), S(3, 6), S(4, 5)], notes: "Pyramid" },
              { id: "pe-nat-8", exerciseId: "ex-bbcurl", order: 7, prescribedSets: many(4, 12) },
            ],
          },
          {
            id: uuid(),
            name: "Cardio Zone 2–3",
            kind: "cardio",
            cardio: { modality: "Cardio Zone 2–3", durationMin: 50, intensity: "40–60 min steady" },
          },
        ],
      },
      {
        sessions: [
          {
            id: "ps-nat-2", name: "Chest / Triceps", order: 0,
            exercises: [
              { id: "pe-nat-9", exerciseId: "ex-cheststretch", order: 0, prescribedSets: timed(2, 12), notes: "PAILs/RAILs" },
              { id: "pe-nat-10", exerciseId: "ex-cars", order: 1, prescribedSets: range(2, 3, 5), notes: "Rounds" },
              { id: "pe-nat-11", exerciseId: "ex-extrot", order: 2, prescribedSets: many(3, 10), notes: "2–3 sets" },
              { id: "pe-nat-12", exerciseId: "ex-cgmp", order: 3, prescribedSets: range(3, 6, 10), notes: "Asymmetrical load" },
              { id: "pe-nat-13", exerciseId: "ex-bench", order: 4, prescribedSets: many(4, 12) },
              { id: "pe-nat-14", exerciseId: "ex-incline", order: 5, prescribedSets: many(4, 12), notes: "45°" },
              { id: "pe-nat-15", exerciseId: "ex-widechest", order: 6, prescribedSets: many(4, 12) },
              { id: "pe-nat-16", exerciseId: "ex-ovhext", order: 7, prescribedSets: many(4, 12) },
            ],
          },
          {
            id: uuid(),
            name: "Cardio Zone 1–2",
            kind: "cardio",
            cardio: { modality: "Cardio Zone 1–2", distanceKm: 10, intensity: "Long run 10 km+" },
          },
        ],
      },
      {
        sessions: [
          {
            id: "ps-nat-3", name: "Lower", order: 0,
            exercises: [
              { id: "pe-nat-17", exerciseId: "ex-hipflex", order: 0, prescribedSets: timed(2, 12) },
              { id: "pe-nat-18", exerciseId: "ex-hipcars", order: 1, prescribedSets: range(2, 3, 5), notes: "Rounds" },
              { id: "pe-nat-19", exerciseId: "ex-kbdlsq", order: 2, prescribedSets: many(3, 10) },
              { id: "pe-nat-20", exerciseId: "ex-kbswing", order: 3, prescribedSets: timed(3, 60) },
              { id: "pe-nat-21", exerciseId: "ex-dead", order: 4, prescribedSets: many(4, 10) },
              { id: "pe-nat-22", exerciseId: "ex-frontsquat", order: 5, prescribedSets: many(4, 10) },
              { id: "pe-nat-23", exerciseId: "ex-bblunge", order: 6, prescribedSets: many(4, 10) },
              { id: "pe-nat-24", exerciseId: "ex-hipthrust", order: 7, prescribedSets: many(4, 10) },
            ],
          },
          {
            id: uuid(),
            name: "Cardio Zone 2–3",
            kind: "cardio",
            cardio: { modality: "Cardio Zone 2–3", durationMin: 50, intensity: "40–60 min steady" },
          },
        ],
      },
      {
        sessions: [
          {
            id: "ps-nat-4", name: "Core / VO2max", order: 0,
            exercises: [
              { id: "pe-nat-25", exerciseId: "ex-deadbug", order: 0, prescribedSets: many(3, 12) },
              // a circuit and a superset: the portal logs them round by round
              { id: "pe-nat-32", exerciseId: "ex-skierg", order: 1, group: "A", prescribedSets: timed(3, 40), notes: "Metabolic Circuit 3 rounds; /side" },
              { id: "pe-nat-33", exerciseId: "ex-wallball", order: 2, group: "A", prescribedSets: many(3, 15) },
              { id: "pe-nat-34", exerciseId: "ex-stepup", order: 3, group: "A", prescribedSets: many(3, 10) },
              { id: "pe-nat-35", exerciseId: "ex-bss", order: 4, group: "B", prescribedSets: many(3, 10) },
              { id: "pe-nat-36", exerciseId: "ex-latraise", order: 5, group: "B", prescribedSets: many(3, 10) },
              { id: "pe-nat-26", exerciseId: "ex-catcamel", order: 6, prescribedSets: many(3, 10) },
              { id: "pe-nat-27", exerciseId: "ex-ropecrunch", order: 7, prescribedSets: many(4, 12) },
              { id: "pe-nat-28", exerciseId: "ex-hlr", order: 8, prescribedSets: many(4, 12) },
              { id: "pe-nat-29", exerciseId: "ex-torsotwist", order: 9, prescribedSets: many(4, 10) },
              { id: "pe-nat-30", exerciseId: "ex-plank", order: 10, prescribedSets: toFailure(4) },
              { id: "pe-nat-31", exerciseId: "ex-sideplank", order: 11, prescribedSets: toFailure(4) },
            ],
          },
          {
            id: uuid(),
            name: "Cardio VO2max",
            kind: "cardio",
            cardio: { modality: "Cardio VO2max", durationMin: 25, intensity: "Intervals 90%+, 1 : 3–5 — 20–30 min total (excl. warm-up)" },
          },
        ],
      },
    ],
    6,
    [1, 2, 4, 6]
  ),
};
programs.push(trainerProgram);

export const trainerProgramDraft: ProgramDto = {
  ...trainerProgram,
  id: "pg-nat-b",
  name: "Strength Interlude",
  description: "Next block after the hypertrophy run — heavier, fewer reps.",
  status: "draft",
  version: 1,
  activatedAt: null,
  phasing: { plannedWeeks: 4, phase: "Myofibrillar strength", nextPhase: "Return to hypertrophy" },
  createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
  weeks: makeWeeks(
    [
      {
        sessions: [
          {
            id: "ps-natb-1", name: "Upper Push", order: 0,
            exercises: [
              { id: "pe-natb-1", exerciseId: "ex-pushpress", order: 0, prescribedSets: many(5, 6) },
              { id: "pe-natb-2", exerciseId: "ex-dbbench", order: 1, prescribedSets: range(4, 6, 8) },
              { id: "pe-natb-3", exerciseId: "ex-kinesisincline", order: 2, prescribedSets: range(3, 9, 12) },
              { id: "pe-natb-4", exerciseId: "ex-crossover", order: 3, prescribedSets: range(3, 9, 12) },
              { id: "pe-natb-5", exerciseId: "ex-pushup", order: 4, prescribedSets: toFailure(3) },
              { id: "pe-natb-6", exerciseId: "ex-trirope", order: 5, prescribedSets: range(3, 9, 12) },
            ],
          },
        ],
      },
      {
        sessions: [
          {
            id: "ps-natb-2", name: "Upper Pull", order: 0,
            exercises: [
              { id: "pe-natb-7", exerciseId: "ex-highpull", order: 0, prescribedSets: many(5, 6) },
              { id: "pe-natb-8", exerciseId: "ex-vbarrow", order: 1, prescribedSets: range(4, 6, 8) },
              { id: "pe-natb-9", exerciseId: "ex-pulldown", order: 2, prescribedSets: range(3, 9, 12) },
              { id: "pe-natb-10", exerciseId: "ex-reardelt", order: 3, prescribedSets: range(3, 9, 12) },
              { id: "pe-natb-11", exerciseId: "ex-invertrow", order: 4, prescribedSets: toFailure(3) },
              { id: "pe-natb-12", exerciseId: "ex-ropetwist", order: 5, prescribedSets: range(3, 9, 12) },
            ],
          },
        ],
      },
      {
        sessions: [
          {
            id: "ps-natb-3", name: "Lower", order: 0,
            exercises: [
              { id: "pe-natb-13", exerciseId: "ex-squat", order: 0, prescribedSets: range(4, 6, 8) },
              { id: "pe-natb-14", exerciseId: "ex-press", order: 1, prescribedSets: range(3, 9, 12) },
              { id: "pe-natb-15", exerciseId: "ex-walklunge", order: 2, prescribedSets: many(3, 20), notes: "Steps per set" },
              { id: "pe-natb-16", exerciseId: "ex-legext", order: 3, prescribedSets: range(3, 9, 12) },
              { id: "pe-natb-17", exerciseId: "ex-legcurl", order: 4, prescribedSets: range(3, 9, 12) },
            ],
          },
        ],
      },
    ],
    4,
    [1, 2, 4, 6]
  ),
};
programs.push(trainerProgramDraft);

logs.push(
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(4), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-pullup", setNumber: 1, type: "working", reps: 6, rpe: 7 },
    { exerciseId: "ex-pullup", setNumber: 2, type: "working", reps: 6, rpe: 8 },
    { exerciseId: "ex-pullup", setNumber: 3, type: "working", reps: 5, rpe: 8 },
    { exerciseId: "ex-bentrow-sup", setNumber: 1, type: "working", weightKg: 60, reps: 5, rpe: 7 },
    { exerciseId: "ex-bentrow-sup", setNumber: 2, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-bbcurl", setNumber: 1, type: "working", weightKg: 20, reps: 12, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(2), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-dead", setNumber: 1, type: "working", weightKg: 100, reps: 10, rpe: 7 },
    { exerciseId: "ex-dead", setNumber: 2, type: "working", weightKg: 100, reps: 10, rpe: 8 },
    { exerciseId: "ex-frontsquat", setNumber: 1, type: "working", weightKg: 70, reps: 10, rpe: 7 },
    { exerciseId: "ex-kbswing", setNumber: 1, type: "working", weightKg: 24, reps: 0, rpe: 6 },
  ], notes: "KB swings by the minute; DL grip gave out on set 3." },
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(1), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-ropecrunch", setNumber: 1, type: "working", reps: 12, rpe: 7 },
    { exerciseId: "ex-hlr", setNumber: 1, type: "working", reps: 12, rpe: 8 },
    { exerciseId: "ex-plank", setNumber: 1, type: "working", reps: 0, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(0), kind: "cardio", cardio: { modality: "Run", durationMin: 35, hrZone: 2, distanceKm: 5.5, rpe: 6 }, sets: [] },
);

// Release-1 rows (docs/kind-rename-plan.md): the demo client's active program and
// exercise logs are stored with kind "lifting", as release 1 wrote them, so mock mode
// proves the alias reads old data.
// The mock API reads through the alias (kindAlias.ts) like the live client does.
trainerProgram.weeks = asRelease1(trainerProgram.weeks);
for (const [i, l] of logs.entries()) if (l.clientId === "cl-nat" && (l.kind ?? "exercises") === "exercises") logs[i] = asRelease1({ ...l, kind: "exercises" as const });

// ---------------------------------------------------------------------------
// Nok — the cardio member (docs/mocks/cardio/mockup.html): week 2 of an 8-week
// General Fitness block with strength and three cardio sessions a week, an HR
// profile (two versions), Cooper tests, and six weeks of cardio logs — one
// reviewed with feedback, one skipped, one waiting for review.
// ---------------------------------------------------------------------------

/** YYYY-MM-DD `n` days after `iso`. */
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayIso = localDateOf(Date.now());
/** Monday of this week; the block started the Monday before, so this is week 2. */
const thisMonday = isoWeekStart(new Date());
const nokStart = plusDays(thisMonday, -7);

export const nokClient: ClientDto = {
  id: "cl-nok",
  name: "Nok Siriporn",
  email: "nok@example.com",
  status: "active",
  goals: "Run a 10 km under an hour by March; keep two strength days.",
  limitations: null,
  sessionsPerWeek: 2,
  trainingDays: [1, 4],
  cardioDays: [2, 3, 6],
  cardioTarget: { unit: "session_load", value: 600 },
  experience: "intermediate",
  birthDate: "1991-04-12",
  sex: "female",
  bodyweightKg: 61.5,
  heightCm: 164,
  startedOn: "2026-08-03",
  oneRepMaxes: { "ex-squat": { kg: 80, date: plusDays(nokStart, -10) }, "ex-bench": { kg: 45, date: plusDays(nokStart, -10) } },
};
clients.push(nokClient);

const nokIntervals = cardioTemplatePreset("intervals")!;
/** The mockup's Saturday session: 10′ warm-up, 5 × 2′ in Z4 with 2′ jog between, 5′ cool-down = 33:00. */
const intervalsRx: CardioPrescription = {
  ...fromCardioTemplate(nokIntervals, "Running"),
  modalityId: "md-running",
  intervals: [
    { id: "warmup", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2, notes: "easy jog, finish with 2 strides" },
    { id: "reps", type: "work", repeat: 5, durationSec: 120, hrZone: 4, rpe: 8, paceSecPerKm: 320, recovery: { type: "active_recovery", durationSec: 120, hrZone: 1 } },
    { id: "cooldown", type: "cooldown", repeat: 1, durationSec: 300, hrZone: 1 },
  ],
};

function nokWeek(week: number): ProgramWeekDto {
  const id = (n: number) => `ps-nok-w${week}-${n}`;
  const ex = (n: number, exerciseId: string, order: number, sets: ProgramExerciseDto["prescribedSets"]): ProgramExerciseDto => ({
    id: `pe-nok-w${week}-${n}`,
    exerciseId,
    order,
    prescribedSets: sets,
  });
  return {
    week,
    sessions: [
      { id: id(1), name: "Upper body", seq: 1, weekday: 1, order: 0, kind: "exercises", exercises: [
        ex(1, "ex-bench", 0, [S(1, 8, { targetWeightKg: 37.5 }), S(2, 8, { targetWeightKg: 37.5 }), S(3, 8, { targetWeightKg: 37.5 })]),
        ex(2, "ex-crow", 1, [S(1, 12, { targetWeightKg: 35 }), S(2, 12, { targetWeightKg: 35 })]),
      ], cardio: null },
      { id: id(2), name: "Zone 2 run", seq: 1, weekday: 2, order: 0, kind: "cardio", exercises: [],
        cardio: { ...fromCardioTemplate(cardioTemplatePreset("easy-zone2")!, "Running"), modalityId: "md-running", durationMin: 40 } },
      { id: id(3), name: "Easy bike", seq: 2, weekday: 3, order: 0, kind: "cardio", exercises: [],
        cardio: { modality: "Cycling", modalityId: "md-cycling", durationMin: 60, hrZone: 2, targetRpe: 3, intensity: "easy" } },
      { id: id(4), name: "Lower body", seq: 2, weekday: 4, order: 0, kind: "exercises", exercises: [
        ex(3, "ex-squat", 0, [S(1, 6, { targetWeightKg: 62.5 }), S(2, 6, { targetWeightKg: 62.5 }), S(3, 6, { targetWeightKg: 62.5 })]),
        ex(4, "ex-rdl", 1, [S(1, 8, { targetWeightKg: 50 }), S(2, 8, { targetWeightKg: 50 })]),
      ], cardio: null },
      { id: id(5), name: "Intervals 5 × 2 min", seq: 3, weekday: 6, order: 0, kind: "cardio", exercises: [],
        notes: "Run the hard reps at a pace you could hold for about 10 minutes. Walk or jog easy in between.",
        cardio: structuredClone(intervalsRx) },
    ],
  };
}

export const nokProgram: ProgramDto = {
  id: "pg-nok-a",
  trainerId: "me",
  clientId: "cl-nok",
  name: "General Fitness — 8 wk",
  description: "Two strength days, three cardio sessions. Building to a sub-60 10 km.",
  status: "active",
  version: 4,
  aiAssisted: false,
  createdFromProgramId: null,
  direction: null,
  activatedAt: `${nokStart}T08:00:00.000Z`,
  startsOn: nokStart,
  phasing: null,
  createdAt: `${plusDays(nokStart, -3)}T09:00:00.000Z`,
  weeks: Array.from({ length: 8 }, (_, i) => nokWeek(i + 1)),
};
programs.push(nokProgram);

const nokProfile = (version: number, effectiveFrom: string, method: "hrmax" | "karvonen", restingHr: number | null): HrProfileDto => ({
  id: `hr-nok-${version}`,
  clientId: "cl-nok",
  version,
  effectiveFrom,
  method,
  restingHr,
  maxHr: 188,
  maxHrTestedOn: plusDays(nokStart, -45),
  lthr: null,
  zones: computeHrZones(method, { restingHr, maxHr: 188 })!,
  createdAt: `${effectiveFrom}T09:00:00.000Z`,
});

/** HR profile versions per client: v1 % of max, v2 heart-rate reserve from 10 days ago. */
export const hrProfiles: HrProfileDto[] = [
  nokProfile(1, plusDays(todayIso, -41), "hrmax", null),
  nokProfile(2, plusDays(todayIso, -10), "karvonen", 58),
];

const cooper = (id: string, testedOn: string, distanceM: number): AssessmentDto => ({
  id,
  clientId: "cl-nok",
  protocol: "cooper_12min",
  formulaVersion: VO2_FORMULAS.cooper_12min.version,
  testedOn,
  inputs: { distanceM },
  result: cooperVo2(distanceM),
  notes: null,
  createdAt: `${testedOn}T09:00:00.000Z`,
  updatedAt: `${testedOn}T09:00:00.000Z`,
});

export const assessments: AssessmentDto[] = [
  cooper("as-nok-1", plusDays(todayIso, -61), 2350),
  cooper("as-nok-2", plusDays(todayIso, -33), 2480),
  cooper("as-nok-3", plusDays(todayIso, -1), 2560),
];

/** The snapshot a log keeps: the session as prescribed, with bpm zones from the profile in effect then. */
function snapshotOf(sessionId: string, date: string): LogPrescription | null {
  const session = nokProgram.weeks.flatMap((w) => w.sessions).find((x) => x.id === sessionId);
  if (!session) return null;
  const profile = [...hrProfiles].reverse().find((p) => p.effectiveFrom <= date);
  return {
    programVersion: nokProgram.version,
    session: structuredClone(session),
    ...(session.kind === "cardio" && profile ? { hrProfileVersion: profile.version, zonesBpm: profile.zones } : {}),
  };
}

function nokCardio(date: string, cardio: CardioLog, extra: Partial<StoredLog> = {}): StoredLog {
  return {
    sessionLogId: `lg-nok-${date}-${cardio.modality.toLowerCase()}`,
    loggedBy: "client",
    clientId: "cl-nok",
    programId: "pg-nok-a",
    date,
    kind: "cardio",
    cardio: withDurationMin(cardio),
    sets: [],
    ...extra,
  };
}

// Four weeks before the block: freestyle cardio, so the session-load bars have a history.
for (const [weeksAgo, run, bike, reps] of [
  [5, 4, 3, 7],
  [4, 4, 3, 8],
  [3, 4, 4, 7],
  [2, 5, 3, 8],
] as const) {
  const monday = plusDays(thisMonday, -7 * weeksAgo);
  logs.push(
    nokCardio(plusDays(monday, 1), { modality: "Running", durationSec: 40 * 60 + weeksAgo * 30, distanceKm: 6.1, rpe: run, avgHr: 142 }, { reviewedAt: `${plusDays(monday, 2)}T10:00:00.000Z`, reviewedBy: "me" }),
    nokCardio(plusDays(monday, 2), { modality: "Cycling", durationSec: 55 * 60, distanceKm: 22, rpe: bike }, { reviewedAt: `${plusDays(monday, 3)}T10:00:00.000Z`, reviewedBy: "me" }),
    nokCardio(plusDays(monday, 5), { modality: "Running", durationSec: 32 * 60, distanceKm: 4.9, rpe: reps, avgHr: 150, maxHr: 174 }, { reviewedAt: `${plusDays(monday, 6)}T10:00:00.000Z`, reviewedBy: "me" }),
  );
}

// Week 1 of the block: reviewed with feedback, skipped, and the mockup's intervals waiting for review.
logs.push(
  nokCardio(plusDays(nokStart, 1), { modality: "Running", durationSec: 41 * 60 + 20, distanceKm: 6.3, rpe: 4, avgHr: 141, maxHr: 156 }, {
    programSessionId: "ps-nok-w1-2",
    prescription: snapshotOf("ps-nok-w1-2", plusDays(nokStart, 1)),
    reviewedAt: `${plusDays(nokStart, 2)}T07:30:00.000Z`,
    reviewedBy: "me",
    trainerFeedback: "Nice and easy — that's exactly the Zone 2 feel. Keep the cadence light.",
    notes: "Felt easy, could have gone longer.",
  }),
  nokCardio(plusDays(nokStart, 2), { modality: "Cycling", skipped: { reason: "time" } }, {
    programSessionId: "ps-nok-w1-3",
    prescription: snapshotOf("ps-nok-w1-3", plusDays(nokStart, 2)),
    notes: "Work ran late.",
  }),
  nokCardio(plusDays(nokStart, 5), { modality: "Running", durationSec: 35 * 60 + 10, distanceKm: 5.2, rpe: 7, avgHr: 151, maxHr: 176, pain: { reported: false } }, {
    programSessionId: "ps-nok-w1-5",
    prescription: snapshotOf("ps-nok-w1-5", plusDays(nokStart, 5)),
    notes: "Legs heavy on the last two reps.",
  }),
  {
    sessionLogId: "lg-nok-upper-w1",
    loggedBy: "trainer",
    clientId: "cl-nok",
    programId: "pg-nok-a",
    programSessionId: "ps-nok-w1-1",
    prescription: snapshotOf("ps-nok-w1-1", nokStart),
    date: nokStart,
    kind: "exercises",
    perceivedEnergy: 7,
    sets: [
      { programExerciseId: "pe-nok-w1-1", exerciseId: "ex-bench", setNumber: 1, type: "working", weightKg: 37.5, reps: 8, rpe: 7 },
      { programExerciseId: "pe-nok-w1-1", exerciseId: "ex-bench", setNumber: 2, type: "working", weightKg: 37.5, reps: 8, rpe: 8 },
      { programExerciseId: "pe-nok-w1-2", exerciseId: "ex-crow", setNumber: 1, type: "working", weightKg: 35, reps: 12, rpe: 7 },
    ],
  },
);

// This week: what's already happened (Monday's strength, Tuesday's run).
if (todayIso >= plusDays(thisMonday, 1)) {
  logs.push(
    nokCardio(plusDays(thisMonday, 1), { modality: "Running", durationSec: 42 * 60 + 5, distanceKm: 6.4, rpe: 4, avgHr: 143, maxHr: 158 }, {
      programSessionId: "ps-nok-w2-2",
      prescription: snapshotOf("ps-nok-w2-2", plusDays(thisMonday, 1)),
    }),
  );
}
