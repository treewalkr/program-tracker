import {
  EXERCISE_ROLE_INFO,
  EXERCISE_ROLES,
  cardioUnitLabel,
  type AiProgramDraft,
  type CardioTarget,
  type Phasing,
  type WeekDirective,
  type WeekTarget,
} from "@pt/shared";

export interface ClientContext {
  name: string;
  goals?: string | null;
  limitations?: string | null;
  daysPerWeek?: number | null;
  cardioTarget?: CardioTarget | null;
}

export interface ProgramSummary {
  name: string;
  sessions: {
    name: string;
    exercises: { name: string; role?: string; sets: string[] }[];
  }[];
}

export interface ExerciseHistoryEntry {
  exerciseName: string;
  /** Present in API responses; not needed inside the prompt text. */
  exerciseId?: string;
  /** Most recent sets, oldest→newest, e.g. "100kg × 5 @ RPE 8". */
  recentSets: string[];
  /** Best estimated 1RM in the window. */
  bestE1rm: number;
}

export interface CatalogEntry {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  equipment: string;
  movementPattern: string | null;
  functionalMovement: string | null;
}

export interface GenerationContext {
  client: ClientContext;
  previousProgram: ProgramSummary | null;
  /** Auto-injected, read-only: "week 3 of 6 · directive +intensity · overall volume/e1RM summary". */
  periodization: string | null;
  chainBalance: string | null;
  history: ExerciseHistoryEntry[];
  catalog: CatalogEntry[];
  trainerInstructions: string;
  direction?: string | null;
}

const DRAFT_SCHEMA_SPEC = `{
  "name": string,                    // short program name
  "rationale": string,              // trainer-facing: progression logic, volume/intensity changes, and why
  "clientSummary": string,          // client-facing blurb, encouraging, no jargon
  "phasing": {                       // proposed periodization for the new block
    "plannedWeeks": number,          // 2-26
    "phase": string,                 // phase name, e.g. "accumulation"
    "nextPhase": string?,
    "weeks": [                       // week-by-week directives and optional targets
      {
        "week": number,
        "directive": "base"|"+volume"|"+intensity"|"deload"|"transition"|"test",
        "target"?: {
          "metric": "overall_volume" | "rep_volume" | "intensity",
          "deltaPercent": number     // % vs previous week, e.g. 5 for +5%
        },
        "note"?: string
      }
    ]?
  },
  "sessions": [                     // exactly the client's training days per week
    {
      "name": string,
      "kind"?: "lifting" | "cardio", // defaults to "lifting"
      "cardio"?: {                   // required if kind is "cardio"; omit/null for lifting
        "modality": string,          // "Bike", "Run", "Rower", etc.
        "durationMin"?: number,      // 1-300
        "hrZone"?: number,           // 1-5
        "intensity"?: string,        // e.g. "easy", "threshold"
        "distanceKm"?: number,
        "targetRpe"?: number         // 1-10
      },
      "notes": string?,             // optional
      "exercises": [
        {
          "exerciseId": string?,    // preferred: use a catalog id
          "exerciseName": string,   // required if exerciseId omitted
          "role": "power" | "primary" | "strength" | "accessory" | "core", // session slot, see rules
          "prescribedSets": [
            {
              "setNumber": number,  // 1-indexed, sequential
              "type": "working" | "backoff",
              "reps": number,       // target reps; 0 only for timed/failure sets
              "repsMin": number?,   // lower bound of a rep range (reps = upper bound)
              "amrap": boolean,     // true = reps is the minimum, go to failure
              "durationSeconds": number?, // timed sets; reps = 0
              "targetWeightKg": number?,  // load target — progress from last logged loads
              "targetRpe": number?, // 1-10
              "restSeconds": number?
            }
          ],
          "notes": string?
        }
      ]
    }
  ]
}`;

const ROLE_RULE = [
  `- Give every exercise exactly one role and list each session's exercises in role order (${EXERCISE_ROLES.join(" → ")}).`,
  ...EXERCISE_ROLES.map((r) => `  ${r}: ${EXERCISE_ROLE_INFO[r].description}`),
].join("\n");

const CARDIO_TARGET_RULE =
  "- When a CARDIO TARGET is given, the week's cardio prescriptions must add up to it.";

function cardioTargetLine(target: CardioTarget): string {
  const label = cardioUnitLabel(target.unit);
  const unitPhrase =
    target.unit === "minutes"
      ? "prescribed minutes"
      : target.unit === "sessions"
        ? "cardio sessions"
        : "zone-minutes";
  return `CARDIO TARGET (per week): ${target.value} ${label} — prescribe the week's cardio sessions so their ${unitPhrase} add up to it.`;
}

export function buildGenerationMessages(ctx: GenerationContext) {
  const system = [
    "You are an expert strength & conditioning coach drafting the NEXT training block for a client.",
    "You reason about progressive overload from logged training data and design sensible mesocycles.",
    "SAFETY: any injury, pain, or limitation listed for the client is a hard constraint — never prescribe movements that conflict with it.",
    "Respond with a single JSON object only, no prose outside the JSON. The JSON must match this schema:",
    DRAFT_SCHEMA_SPEC,
    "Rules:",
    "- Reference exercises by catalog exerciseId when a suitable one exists; use exerciseName only for genuinely new movements.",
    "- Keep exercises the client has been performing (and progressing) unless there is a stated reason to swap.",
    ROLE_RULE,
    "- Balance every session and the week across movement patterns and functional movements: roughly match push volume (vertical + horizontal) with pull volume, and knee-dominant with hip-dominant work; vary functional movements across the week. rationale must state how the block is balanced across patterns and functional movements, and why.",
    "- Progress load conservatively: set targetWeightKg on working sets from the most recent logged load, stepping ~2.5 kg (smaller steps for upper body); regress if RPEs were 9+ or reps were missed. Omit targetWeightKg for bodyweight or RPE-driven work.",
    "- Propose phasing for the new block: plannedWeeks, phase name, and week directives (base → +volume → +intensity → deload/transition). Follow the periodization context when provided.",
    "- Cardio sessions are their own kind: 'cardio' sessions (no exercises, named 'Cardio N' on their own numbering track) and count toward days-per-week.",
    CARDIO_TARGET_RULE,
    "- Quantify +volume/+intensity weeks with targets: set target { metric, deltaPercent } on WeekPlan where appropriate (overall volume ≈ +5%/wk, intensity ≈ +2.5% load).",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    `- Number of sessions must equal the client's days per week (${ctx.client.daysPerWeek ?? "not specified — infer from the previous program"}).`,
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
  ].join("\n");

  const user = [
    `CLIENT: ${ctx.client.name}`,
    ctx.client.goals ? `GOALS: ${ctx.client.goals}` : "GOALS: not specified",
    ctx.client.limitations
      ? `LIMITATIONS (hard constraints): ${ctx.client.limitations}`
      : "LIMITATIONS: none listed",
    ...(ctx.client.cardioTarget ? [cardioTargetLine(ctx.client.cardioTarget)] : []),
    "",
    ctx.previousProgram
      ? [
          "CURRENT PROGRAM (the block you are following up):",
          programToText(ctx.previousProgram),
        ].join("\n")
      : "CURRENT PROGRAM: none (cold start — design a sensible first block).",
    "",
    ctx.periodization
      ? `PERIODIZATION CONTEXT (read-only, derived from the current block's logs):\n${ctx.periodization}`
      : "PERIODIZATION CONTEXT: none (no phasing on the current program).",
    "",
    ctx.chainBalance
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working sets, last 8 weeks):\n${ctx.chainBalance}`
      : "KINETIC CHAIN BALANCE: no logged training to balance yet.",
    "",
    ctx.history.length > 0
      ? ["RECENT TRAINING LOGS (last 8 weeks, oldest → newest):", historyToText(ctx.history)].join("\n")
      : "RECENT TRAINING LOGS: none.",
    "",
    `EXERCISE CATALOG (use these exerciseId values when possible):`,
    ctx.catalog
      .map(
        (e) =>
          `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
      )
      .join("\n"),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    `TRAINER INSTRUCTIONS: ${ctx.trainerInstructions || "none"}`,
  ].join("\n");

  return { system, user };
}

export interface RevisionContext extends GenerationContext {
  previousDraft: AiProgramDraft;
  feedback: string;
}

export function buildRevisionMessages(ctx: RevisionContext): { system: string; user: string } {
  const system = [
    "You are an expert strength & conditioning coach REVISING the draft of the NEXT training block for a client.",
    "You reason about progressive overload from logged training data and design sensible mesocycles.",
    "SAFETY: any injury, pain, or limitation listed for the client is a hard constraint — never prescribe movements that conflict with it.",
    "Respond with a single JSON object only, no prose outside the JSON. The JSON must match this schema:",
    DRAFT_SCHEMA_SPEC,
    "Rules:",
    "- Reference exercises by catalog exerciseId when a suitable one exists; use exerciseName only for genuinely new movements.",
    "- Keep exercises the client has been performing (and progressing) unless there is a stated reason to swap.",
    ROLE_RULE,
    "- Balance every session and the week across movement patterns and functional movements: roughly match push volume (vertical + horizontal) with pull volume, and knee-dominant with hip-dominant work; vary functional movements across the week. rationale must state how the block is balanced across patterns and functional movements, and why.",
    "- Progress load conservatively: set targetWeightKg on working sets from the most recent logged load, stepping ~2.5 kg (smaller steps for upper body); regress if RPEs were 9+ or reps were missed. Omit targetWeightKg for bodyweight or RPE-driven work.",
    "- Propose phasing for the new block: plannedWeeks, phase name, and week directives (base → +volume → +intensity → deload/transition). Follow the periodization context when provided.",
    "- Cardio sessions are their own kind: 'cardio' sessions (no exercises, named 'Cardio N' on their own numbering track) and count toward days-per-week.",
    CARDIO_TARGET_RULE,
    "- Quantify +volume/+intensity weeks with targets: set target { metric, deltaPercent } on WeekPlan where appropriate (overall volume ≈ +5%/wk, intensity ≈ +2.5% load).",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    `- Number of sessions must equal the client's days per week (${ctx.client.daysPerWeek ?? "not specified — infer from the previous program"}).`,
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    "- This is a REVISION: the previous draft is provided below. Apply the trainer's feedback exactly.",
    "- Change only what the feedback requires (and what directly follows from it); keep everything else in the previous draft identical.",
  ].join("\n");

  const user = [
    `CLIENT: ${ctx.client.name}`,
    ctx.client.goals ? `GOALS: ${ctx.client.goals}` : "GOALS: not specified",
    ctx.client.limitations
      ? `LIMITATIONS (hard constraints): ${ctx.client.limitations}`
      : "LIMITATIONS: none listed",
    ...(ctx.client.cardioTarget ? [cardioTargetLine(ctx.client.cardioTarget)] : []),
    "",
    ctx.previousProgram
      ? [
          "CURRENT PROGRAM (the block you are following up):",
          programToText(ctx.previousProgram),
        ].join("\n")
      : "CURRENT PROGRAM: none (cold start — design a sensible first block).",
    "",
    ctx.periodization
      ? `PERIODIZATION CONTEXT (read-only, derived from the current block's logs):\n${ctx.periodization}`
      : "PERIODIZATION CONTEXT: none (no phasing on the current program).",
    "",
    ctx.chainBalance
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working sets, last 8 weeks):\n${ctx.chainBalance}`
      : "KINETIC CHAIN BALANCE: no logged training to balance yet.",
    "",
    ctx.history.length > 0
      ? ["RECENT TRAINING LOGS (last 8 weeks, oldest → newest):", historyToText(ctx.history)].join("\n")
      : "RECENT TRAINING LOGS: none.",
    "",
    `EXERCISE CATALOG (use these exerciseId values when possible):`,
    ctx.catalog
      .map(
        (e) =>
          `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
      )
      .join("\n"),
    "",
    "PREVIOUS DRAFT (your earlier output — revise it):",
    draftToText(ctx.previousDraft),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    `TRAINER FEEDBACK (apply this to the previous draft): ${ctx.feedback}`,
  ].join("\n");

  return { system, user };
}

export interface WeekContext extends GenerationContext {
  targetWeek: number;
  plannedWeeks: number;
  targetDirective: WeekDirective | null;
  target: WeekTarget | null;
}

export interface WeekRevisionContext extends WeekContext {
  previousDraft: AiProgramDraft;
  feedback: string;
}

export function buildWeekMessages(ctx: WeekContext): { system: string; user: string } {
  const system = [
    `You are an expert strength & conditioning coach drafting the NEXT WEEK (week ${ctx.targetWeek} of ${ctx.plannedWeeks}) of the client's CURRENT block.`,
    "You reason about progressive overload from logged training data and design sensible mesocycles.",
    "SAFETY: any injury, pain, or limitation listed for the client is a hard constraint — never prescribe movements that conflict with it.",
    "Respond with a single JSON object only, no prose outside the JSON. The JSON must match this schema:",
    DRAFT_SCHEMA_SPEC,
    "Rules:",
    "- Reference exercises by catalog exerciseId when a suitable one exists; use exerciseName only for genuinely new movements.",
    "- Keep exercises the client has been performing (and progressing) unless there is a stated reason to swap.",
    "- Keep exercise selection stable week to week — swap only with a reason stated in rationale.",
    ROLE_RULE,
    "- Balance every session and the week across movement patterns and functional movements: roughly match push volume (vertical + horizontal) with pull volume, and knee-dominant with hip-dominant work; vary functional movements across the week. rationale must state how the block is balanced across patterns and functional movements, and why.",
    "- Progress load conservatively: set targetWeightKg on working sets from the most recent logged load, stepping ~2.5 kg (smaller steps for upper body); regress if RPEs were 9+ or reps were missed. Omit targetWeightKg for bodyweight or RPE-driven work.",
    "- Do NOT propose phasing: the block's periodization is fixed.",
    "- Follow the next week's directive and target when provided.",
    "- Cardio sessions are their own kind: 'cardio' sessions (no exercises, named 'Cardio N' on their own numbering track) and count toward days-per-week.",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    "- sessions is exactly one week — the client's training days.",
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
  ].join("\n");

  const user = [
    `CLIENT: ${ctx.client.name}`,
    ctx.client.goals ? `GOALS: ${ctx.client.goals}` : "GOALS: not specified",
    ctx.client.limitations
      ? `LIMITATIONS (hard constraints): ${ctx.client.limitations}`
      : "LIMITATIONS: none listed",
    "",
    ctx.previousProgram
      ? [
          `CURRENT WEEK (week ${ctx.targetWeek - 1} — what the client is doing now):`,
          programToText(ctx.previousProgram),
        ].join("\n")
      : "CURRENT PROGRAM: none (cold start — design a sensible first block).",
    "",
    `NEXT WEEK: week ${ctx.targetWeek} of ${ctx.plannedWeeks}${
      ctx.targetDirective ? ` · directive ${ctx.targetDirective}` : ""
    }${
      ctx.target
        ? ` · target ${ctx.target.deltaPercent >= 0 ? "+" : ""}${ctx.target.deltaPercent}% ${ctx.target.metric.replace("_", " ")}`
        : ""
    }`,
    "",
    ctx.periodization
      ? `PERIODIZATION CONTEXT (read-only, derived from the current block's logs):\n${ctx.periodization}`
      : "PERIODIZATION CONTEXT: none (no phasing on the current program).",
    "",
    ctx.chainBalance
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working sets, last 8 weeks):\n${ctx.chainBalance}`
      : "KINETIC CHAIN BALANCE: no logged training to balance yet.",
    "",
    ctx.history.length > 0
      ? ["RECENT TRAINING LOGS (last 8 weeks, oldest → newest):", historyToText(ctx.history)].join("\n")
      : "RECENT TRAINING LOGS: none.",
    "",
    `EXERCISE CATALOG (use these exerciseId values when possible):`,
    ctx.catalog
      .map(
        (e) =>
          `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
      )
      .join("\n"),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    `TRAINER INSTRUCTIONS: ${ctx.trainerInstructions || "none"}`,
  ].join("\n");

  return { system, user };
}

export function buildWeekRevisionMessages(ctx: WeekRevisionContext): { system: string; user: string } {
  const system = [
    `You are an expert strength & conditioning coach REVISING the draft of the NEXT WEEK (week ${ctx.targetWeek} of ${ctx.plannedWeeks}) of the client's CURRENT block.`,
    "You reason about progressive overload from logged training data and design sensible mesocycles.",
    "SAFETY: any injury, pain, or limitation listed for the client is a hard constraint — never prescribe movements that conflict with it.",
    "Respond with a single JSON object only, no prose outside the JSON. The JSON must match this schema:",
    DRAFT_SCHEMA_SPEC,
    "Rules:",
    "- Reference exercises by catalog exerciseId when a suitable one exists; use exerciseName only for genuinely new movements.",
    "- Keep exercises the client has been performing (and progressing) unless there is a stated reason to swap.",
    "- Keep exercise selection stable week to week — swap only with a reason stated in rationale.",
    ROLE_RULE,
    "- Balance every session and the week across movement patterns and functional movements: roughly match push volume (vertical + horizontal) with pull volume, and knee-dominant with hip-dominant work; vary functional movements across the week. rationale must state how the block is balanced across patterns and functional movements, and why.",
    "- Progress load conservatively: set targetWeightKg on working sets from the most recent logged load, stepping ~2.5 kg (smaller steps for upper body); regress if RPEs were 9+ or reps were missed. Omit targetWeightKg for bodyweight or RPE-driven work.",
    "- Do NOT propose phasing: the block's periodization is fixed.",
    "- Follow the next week's directive and target when provided.",
    "- Cardio sessions are their own kind: 'cardio' sessions (no exercises, named 'Cardio N' on their own numbering track) and count toward days-per-week.",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    "- sessions is exactly one week — the client's training days.",
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    "- This is a REVISION: the previous draft is provided below. Apply the trainer's feedback exactly.",
    "- Change only what the feedback requires (and what directly follows from it); keep everything else in the previous draft identical.",
  ].join("\n");

  const user = [
    `CLIENT: ${ctx.client.name}`,
    ctx.client.goals ? `GOALS: ${ctx.client.goals}` : "GOALS: not specified",
    ctx.client.limitations
      ? `LIMITATIONS (hard constraints): ${ctx.client.limitations}`
      : "LIMITATIONS: none listed",
    "",
    ctx.previousProgram
      ? [
          `CURRENT WEEK (week ${ctx.targetWeek - 1} — what the client is doing now):`,
          programToText(ctx.previousProgram),
        ].join("\n")
      : "CURRENT PROGRAM: none (cold start — design a sensible first block).",
    "",
    `NEXT WEEK: week ${ctx.targetWeek} of ${ctx.plannedWeeks}${
      ctx.targetDirective ? ` · directive ${ctx.targetDirective}` : ""
    }${
      ctx.target
        ? ` · target ${ctx.target.deltaPercent >= 0 ? "+" : ""}${ctx.target.deltaPercent}% ${ctx.target.metric.replace("_", " ")}`
        : ""
    }`,
    "",
    ctx.periodization
      ? `PERIODIZATION CONTEXT (read-only, derived from the current block's logs):\n${ctx.periodization}`
      : "PERIODIZATION CONTEXT: none (no phasing on the current program).",
    "",
    ctx.chainBalance
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working sets, last 8 weeks):\n${ctx.chainBalance}`
      : "KINETIC CHAIN BALANCE: no logged training to balance yet.",
    "",
    ctx.history.length > 0
      ? ["RECENT TRAINING LOGS (last 8 weeks, oldest → newest):", historyToText(ctx.history)].join("\n")
      : "RECENT TRAINING LOGS: none.",
    "",
    `EXERCISE CATALOG (use these exerciseId values when possible):`,
    ctx.catalog
      .map(
        (e) =>
          `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
      )
      .join("\n"),
    "",
    "PREVIOUS DRAFT (your earlier output — revise it):",
    draftToText(ctx.previousDraft),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    `TRAINER FEEDBACK (apply this to the previous draft): ${ctx.feedback}`,
  ].join("\n");

  return { system, user };
}

function draftToText(d: AiProgramDraft): string {
  const lines = [
    d.name,
    d.rationale,
    ...d.sessions.map((s) => {
      const exercises = s.exercises
        .map((e) => {
          const name = e.exerciseName ?? e.exerciseId ?? "";
          const sets = e.prescribedSets.map(
            (ps) =>
              `${ps.reps}${ps.amrap ? "+" : ""} reps${ps.targetRpe ? ` @ RPE ${ps.targetRpe}` : ""}`
          );
          return `${name}${e.role ? ` (${e.role})` : ""} [${sets.join("; ")}]`;
        })
        .join(", ");
      return `- ${s.name}: ${exercises}`;
    }),
  ];
  return lines.join("\n");
}

function programToText(p: ProgramSummary): string {
  return p.sessions
    .map(
      (s) =>
        `- ${s.name}: ${s.exercises
          .map((e) => `${e.name}${e.role ? ` (${e.role})` : ""} [${e.sets.join("; ")}]`)
          .join(", ")}`
    )
    .join("\n");
}

function historyToText(h: ExerciseHistoryEntry[]): string {
  return h
    .map((e) => `- ${e.exerciseName} (best e1RM ${e.bestE1rm}kg): ${e.recentSets.join(", ")}`)
    .join("\n");
}

export function periodizationContext(
  ph: Phasing,
  week: number,
  summary: string | null
): string {
  const currentPlan = ph.weeks?.find((w) => w.week === week);
  const directivePart = currentPlan?.directive ? ` · this week's directive: ${currentPlan.directive}` : "";
  let targetPart = "";
  if (currentPlan?.target) {
    const metricLabels: Record<string, string> = {
      overall_volume: "overall volume",
      rep_volume: "rep volume",
      intensity: "intensity",
    };
    const label = metricLabels[currentPlan.target.metric] ?? currentPlan.target.metric;
    const sign = currentPlan.target.deltaPercent > 0 ? "+" : "";
    targetPart = ` · target ${label} ${sign}${currentPlan.target.deltaPercent}%`;
  }
  const summaryPart = summary ? ` · ${summary}` : "";
  return `week ${week} of ${ph.plannedWeeks} · ${ph.phase}${directivePart}${targetPart}${summaryPart}`;
}

/** Typed re-export so routes share one import path. */
export type { AiProgramDraft };
