import {
  EXERCISE_ROLE_INFO,
  EXERCISE_ROLES,
  cardioUnitLabel,
  type AiProgramDraft,
  type CardioTarget,
  type Phasing,
  type WeekDirective,
  type WeekSummaryStats,
  type WeekTarget,
  renderPreferenceSignals,
  type PreferenceSignal,
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

export interface ExampleProgramSummary {
  programId: string;
  name: string;
  goal: string | null;
  level: string | null;
  daysPerWeek: number | null;
  sessions: ProgramSummary["sessions"];
}

export interface GenerationContext {
  client: ClientContext;
  previousProgram: ProgramSummary | null;
  /** Auto-injected, read-only: "week 3 of 6 · directive +intensity · overall volume/e1RM summary". */
  periodization: string | null;
  chainBalance: string | null;
  /** Gold-standard programs retrieved from the trainer's example library (few-shot). */
  examples?: ExampleProgramSummary[];
  history: ExerciseHistoryEntry[];
  catalog: CatalogEntry[];
  trainerInstructions: string;
  direction?: string | null;
  learnedPreferences?: string | null;
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

const GOLD_STANDARD_RULE =
  "- When GOLD-STANDARD EXAMPLE PROGRAMS are provided, treat them as the trainer's gold standard: mirror their session structure, exercise-role usage, set/rep style and level of detail, adapted to this client's history — never copy exercises or loads blindly.";

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
    GOLD_STANDARD_RULE,
    `- Number of sessions must equal the client's days per week (${ctx.client.daysPerWeek ?? "not specified — infer from the previous program"}).`,
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    "- Format rationale and clientSummary as markdown: short paragraphs, bold lead-ins (e.g. **Day 1**), and bullet lists for per-day/per-week breakdowns. No headings, no tables.",
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
    ...(ctx.examples?.length
      ? [examplesToText(ctx.examples)]
      : ["GOLD-STANDARD EXAMPLE PROGRAMS: none matching this client."]),
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
    ...(ctx.catalog.length
      ? [
          ctx.catalog
            .map(
              (e) =>
                `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
            )
            .join("\n"),
        ]
      : []),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    ...(ctx.learnedPreferences
      ? [
          `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${ctx.learnedPreferences}`,
          "",
        ]
      : []),
    `TRAINER INSTRUCTIONS: ${ctx.trainerInstructions || "none"}`,
  ].join("\n");

  return { system, user };
}

/** Chat-history window threaded into revision prompts (chat refine loop). */
export const REVISION_CONVERSATION_LIMIT = 10;
/** Max characters per conversation line, after whitespace collapsing. */
export const REVISION_CONVERSATION_MAX_CHARS = 600;

/**
 * Render chat rows as "Trainer: …" / "Assistant: …" lines (oldest → newest),
 * whitespace-collapsed and capped. Returns null for an empty conversation so
 * prompts stay byte-identical when there is no history.
 */
export function conversationToText(
  rows: { role: "trainer" | "assistant"; content: string }[]
): string | null {
  if (rows.length === 0) return null;
  return rows
    .map(
      (r) =>
        `${r.role === "trainer" ? "Trainer" : "Assistant"}: ${r.content
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, REVISION_CONVERSATION_MAX_CHARS)}`
    )
    .join("\n");
}

export interface RevisionContext extends GenerationContext {
  previousDraft: AiProgramDraft;
  feedback: string;
  /** Recent chat thread for this client, oldest → newest (chat revise only). */
  conversation?: string | null;
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
    GOLD_STANDARD_RULE,
    `- Number of sessions must equal the client's days per week (${ctx.client.daysPerWeek ?? "not specified — infer from the previous program"}).`,
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    "- Format rationale and clientSummary as markdown: short paragraphs, bold lead-ins (e.g. **Day 1**), and bullet lists for per-day/per-week breakdowns. No headings, no tables.",
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
    ...(ctx.examples?.length
      ? [examplesToText(ctx.examples)]
      : ["GOLD-STANDARD EXAMPLE PROGRAMS: none matching this client."]),
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
    ...(ctx.catalog.length
      ? [
          ctx.catalog
            .map(
              (e) =>
                `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
            )
            .join("\n"),
        ]
      : []),
    ...(ctx.learnedPreferences
      ? [
          "",
          `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${ctx.learnedPreferences}`,
        ]
      : []),
    "",
    "PREVIOUS DRAFT (your earlier output — revise it):",
    draftToText(ctx.previousDraft),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    ...(ctx.conversation
      ? [
          "CONVERSATION SO FAR (earlier chat with the trainer, oldest → newest — context only; apply only the TRAINER FEEDBACK below):",
          ctx.conversation,
          "",
        ]
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
  /** Recent chat thread for this client, oldest → newest (chat revise only). */
  conversation?: string | null;
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
    "- Format rationale and clientSummary as markdown: short paragraphs, bold lead-ins (e.g. **Day 1**), and bullet lists for per-day/per-week breakdowns. No headings, no tables.",
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
    ...(ctx.learnedPreferences
      ? [
          `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${ctx.learnedPreferences}`,
          "",
        ]
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
    "- Format rationale and clientSummary as markdown: short paragraphs, bold lead-ins (e.g. **Day 1**), and bullet lists for per-day/per-week breakdowns. No headings, no tables.",
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
    ...(ctx.learnedPreferences
      ? [
          "",
          `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${ctx.learnedPreferences}`,
        ]
      : []),
    "",
    "PREVIOUS DRAFT (your earlier output — revise it):",
    draftToText(ctx.previousDraft),
    "",
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    ...(ctx.conversation
      ? [
          "CONVERSATION SO FAR (earlier chat with the trainer, oldest → newest — context only; apply only the TRAINER FEEDBACK below):",
          ctx.conversation,
          "",
        ]
      : []),
    `TRAINER FEEDBACK (apply this to the previous draft): ${ctx.feedback}`,
  ].join("\n");

  return { system, user };
}

export function draftToText(d: AiProgramDraft): string {
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

function examplesToText(examples: ExampleProgramSummary[]): string {
  return [
    "GOLD-STANDARD EXAMPLE PROGRAMS (the trainer's library — few-shot: mirror their structure, style and detail level; adapt to this client, never copy exercises or loads blindly):",
    ...examples.flatMap((e) => [
      `- ${e.name} (goal: ${e.goal ?? "n/a"} · level: ${e.level ?? "n/a"} · ${e.daysPerWeek ?? "?"} days/week)`,
      ...programToText({ name: e.name, sessions: e.sessions })
        .split("\n")
        .map((line) => `  ${line}`),
    ]),
  ].join("\n");
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

export interface DistillContext {
  clientName: string | null; // null = trainer-wide
  previousDocument: string | null;
  signals: PreferenceSignal[];
}

export function buildDistillMessages(ctx: DistillContext): { system: string; user: string } {
  const system = [
    "You are distilling a personal trainer's standing style preferences from their feedback history into one preferences document. The document is injected verbatim into every future AI program-draft prompt for this trainer, like standing instructions.",
    "Respond with the document as plain text only — no JSON, no preamble.",
    "Rules:",
    '- A short bullet list (one rule per "- " line), at most 300 words.',
    "- Only rules the feedback signals support; prefer concrete, checkable rules (RPE caps, set/rep ranges, exercise substitutions, block structure, selection style) over vague taste.",
    "- Ignore one-off requests that never recur.",
    "- When a previous document is provided, keep its still-valid rules stable and merge in what is new.",
  ].join("\n");

  const user = [
    `SCOPE: ${ctx.clientName ? `client ${ctx.clientName} only` : "trainer-wide — all clients"}`,
    ...(ctx.previousDocument
      ? [
          "",
          `PREVIOUS DOCUMENT (keep stable what still holds):\n${ctx.previousDocument}`,
        ]
      : []),
    "",
    `FEEDBACK SIGNALS (oldest → newest):\n${renderPreferenceSignals(ctx.signals)}`,
  ].join("\n");

  return { system, user };
}

/** Typed re-export so routes share one import path. */
export type { AiProgramDraft };

// ---------------------------------------------------------------------------
// Client message (weekly result summary + compliment)
// ---------------------------------------------------------------------------

/** Deterministic render of the computed week stats — the ONLY numbers the model
 *  ever sees. What the AI gets, the trainer can re-read in the stats panel. */
export function clientMessageStatsText(stats: WeekSummaryStats): string {
  const lines: string[] = [];
  lines.push(
    `WEEK OF ${stats.weekStart} · ${stats.sessionsLogged}/${stats.sessionsPlanned ?? "?"} sessions` +
      (stats.adherencePct != null ? ` (${stats.adherencePct}%)` : "")
  );
  lines.push(
    `VOLUME ${stats.overallVolume}kg` +
      (stats.overallVolumeDelta != null
        ? ` (${stats.overallVolumeDelta >= 0 ? "+" : ""}${stats.overallVolumeDelta}% vs last week)`
        : "") +
      ` · ${stats.sets} working sets` +
      (stats.avgRpe != null ? ` · avg RPE ${stats.avgRpe}` : "")
  );
  if (stats.prs.length > 0) {
    for (const pr of stats.prs.slice(0, 3)) {
      lines.push(
        `PR ${pr.exerciseName} ${pr.weightKg}kg × ${pr.reps} (est. 1RM ${pr.e1rm}kg, previous best ${pr.prevBest}kg)`
      );
    }
  } else {
    lines.push("NO NEW BESTS");
  }
  if (stats.nextWeek) {
    let next = `NEXT WEEK ${stats.nextWeek.directive ?? "—"}`;
    if (stats.nextWeek.target) {
      const t = stats.nextWeek.target;
      next += ` · target ${t.deltaPercent >= 0 ? "+" : ""}${t.deltaPercent}% ${t.metric.replace("_", " ")}`;
    }
    lines.push(next);
  } else {
    lines.push("FINAL WEEK OF THE BLOCK — no next week planned");
  }
  return lines.join("\n");
}

export interface ClientMessageContext {
  clientName: string;
  programName: string;
  stats: WeekSummaryStats;
}

/** Fixed system rules + rendered stats. The model phrases; it never computes. */
export function buildClientMessageMessages(ctx: ClientMessageContext): {
  system: string;
  user: string;
} {
  const system = [
    "You are a personal trainer writing a short message to your client on LINE.",
    "The message comes from the trainer to the client, in the trainer's voice — warm, direct, specific.",
    "Rules:",
    "- Plain text only: no markdown, no hashtags, no headers, no emoji lists.",
    "- 2–4 short paragraphs, at most about 120 words total. Keep each paragraph 1–3 sentences.",
    "- Paragraph 1: what they did this week — use ONLY the numbers given in the data, exactly as given.",
    "- Paragraph 2: what's next week, from the NEXT WEEK line. If the data says FINAL WEEK, wrap up the block warmly — do not invent a next week.",
    "- Include one genuine compliment that references a specific effort, personal record, or consistency shown in the data.",
    "- No jargon: never write \"e1RM\", \"RPE table\", or \"volume\". Use plain words and the actual numbers (e.g. \"your best squat day yet\", \"100kg for 5\", \"all 3 sessions done\").",
    "- NEVER invent or estimate any number that is not in the data.",
    "- Never comment on body weight or appearance. Compliment effort, consistency, or strength only.",
    "Respond with a single JSON object only: {\"message\": string}.",
  ].join("\n");

  const first = ctx.clientName.split(" ")[0];
  const user = [
    `CLIENT: ${first}`,
    `PROGRAM: ${ctx.programName}`,
    "",
    "WEEK DATA (computed from logged training — the only numbers you may use):",
    clientMessageStatsText(ctx.stats),
  ].join("\n");

  return { system, user };
}

// ---------------------------------------------------------------------------
// Chat system prompt
// ---------------------------------------------------------------------------

export interface ChatDraftContext {
  kind: "block" | "week";
  targetWeek: number | null;
  text: string; // draftToText output
  revisionMessage: string | null;
}

export interface ChatContext extends Omit<GenerationContext, "trainerInstructions"> {
  latestDraft: ChatDraftContext | null;
}

export function buildChatSystem(ctx: ChatContext): string {
  const header = [
    "You are the trainer's assistant inside their strength & conditioning app, chatting about ONE client.",
    "Answer only about this client — profile, current program, logged numbers, progress, and AI drafts. This is not a general assistant: for anything else, point the trainer to the right part of their app.",
    "Ground every claim in the CONTEXT below and quote actual numbers. If the context does not cover it, say so plainly — never invent data.",
    "LIMITATIONS are hard constraints: never suggest movements that conflict with them.",
    'If the trainer wants the latest draft changed, tell them to send the message with "Revise draft" — that creates the next draft version; you cannot change drafts yourself.',
    "Keep replies short and concrete.",
  ].join("\n");

  const draftBlock = ctx.latestDraft
    ? [
        "LATEST DRAFT (under review — the trainer can revise it):",
        ctx.latestDraft.kind === "week"
          ? `week ${ctx.latestDraft.targetWeek ?? "?"} draft`
          : "next-block draft",
        `${ctx.latestDraft.text}${ctx.latestDraft.revisionMessage ? `\nLast revision message: ${ctx.latestDraft.revisionMessage}` : ""}`,
      ].join("\n")
    : "LATEST DRAFT: none under review.";

  return [
    header,
    "",
    "CONTEXT:",
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
    draftBlock,
    "",
    ...(ctx.learnedPreferences
      ? [
          `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${ctx.learnedPreferences}`,
          "",
        ]
      : []),
    `EXERCISE CATALOG (names for reference):`,
    ...(ctx.catalog.length
      ? [
          ctx.catalog
            .map(
              (e) =>
                `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})`
            )
            .join("\n"),
        ]
      : []),
  ].join("\n");
}

