import {
  EXERCISE_ROLE_INFO,
  EXERCISE_ROLES,
  cardioUnitLabel,
  type AiProgramDraft,
  type CardioTarget,
  type SessionKind,
  type Phasing,
  type WeekDirective,
  type WeekSummaryStats,
  type WeekTarget,
  renderPreferenceSignals,
  rxLabel,
  anchorText,
  type NoteAnchor,
  type PreferenceSignal,
} from "@pt/shared";

export interface ClientContext {
  name: string;
  goals?: string | null;
  limitations?: string | null;
  /** Lifting sessions per week (cardio does not count). */
  sessionsPerWeek?: number | null;
  /** Available ISO weekdays (1=Mon…7=Sun) — context only; code places sessions. */
  trainingDays?: number[] | null;
  cardioTarget?: CardioTarget | null;
}

export interface ProgramSummary {
  name: string;
  sessions: {
    name: string;
    kind?: "lifting" | "cardio";
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
  /** Trainer's coaching note (setup, cues), if any. */
  note?: string | null;
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
  /** The trainer's live session types — drafts label each session with one. */
  sessionTypes?: { name: string; format: SessionKind }[];
  trainerInstructions: string;
  direction?: string | null;
  learnedPreferences?: string | null;
  /** Active coaching rules (trainer-confirmed), client rules first. */
  coachingRules?: CoachingRulePrompt[];
}

export interface CoachingRulePrompt {
  id: string;
  text: string;
  /** "client" = this client only; "always" = every client. */
  scope: "client" | "always";
}

export const COACHING_RULES_HEADER =
  "COACHING RULES (confirmed by the trainer — follow strictly; client rules override general ones):";

/** The trainer-confirmed rules, one per line, client rules first and tagged. */
export function coachingRulesText(rules: CoachingRulePrompt[]): string {
  return [COACHING_RULES_HEADER, ...rules.map((r) => `- ${r.scope === "client" ? "[this client] " : ""}${r.text}`)].join("\n");
}

/** LEARNED PREFERENCES then COACHING RULES — every builder renders both, side by side. */
function guidanceBlocks(ctx: Pick<GenerationContext, "learnedPreferences" | "coachingRules">): string[] {
  return [
    ...(ctx.learnedPreferences
      ? [
          `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${ctx.learnedPreferences}`,
        ]
      : []),
    ...(ctx.coachingRules?.length ? [coachingRulesText(ctx.coachingRules)] : []),
  ];
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
  "sessions": [                     // one week: the lifting sessions, then any cardio sessions (no weekdays — the app schedules them)
    {
      "name": string,
      "kind"?: "lifting" | "cardio", // defaults to "lifting"
      "type"?: string,              // one of SESSION TYPES whose format matches kind (e.g. "Mobility"); omit if none fits
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

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How many lifting sessions to ask for: the client's setting, else the current program's. */
function liftingSessionTarget(client: ClientContext, previous: ProgramSummary | null): string {
  if (client.sessionsPerWeek) return `exactly ${client.sessionsPerWeek}`;
  const prev = previous?.sessions.filter((s) => (s.kind ?? "lifting") === "lifting").length ?? 0;
  return prev > 0
    ? `exactly ${prev} (not set on the client — match the current program's lifting sessions)`
    : "not specified — infer a sensible number from the goals and history";
}

/** Session-structure rules shared by every draft-producing prompt. */
function sessionStructureRules(client: ClientContext, previous: ProgramSummary | null): string[] {
  const days = [...new Set(client.trainingDays ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  return [
    `- Lifting sessions (kind "lifting") per week: ${liftingSessionTarget(client, previous)}. List them in the order they should be trained.`,
    '- Cardio is separate: each cardio bout is its own kind "cardio" session (no exercises), sized from the CARDIO TARGET — unit "sessions" → exactly that many cardio sessions; minutes or zone-minutes → split the total into sensible sessions (typically 20–60 min each, e.g. 150 min → 3 × 50 min). With no CARDIO TARGET, add cardio only when the goals or trainer instructions call for it. Cardio sessions never count toward the lifting session number and do not use up a training day. List cardio sessions after the lifting ones.',
    '- Name every session by its focus (e.g. "Lower — squat focus", "Upper — push", "Zone 2 bike"), never by weekday or "Day N".',
    `- Do not assign weekdays: the app places sessions on the calendar.${
      days.length ? ` For context only, the client can train on ${days.map((d) => WEEKDAY_NAMES[d - 1]).join(", ")}; sessions may share a day.` : ""
    }`,
  ];
}

const WEEK_STABILITY_RULE =
  "- sessions is exactly one week. Keep the current week's sessions in the same order (lifting first, then cardio) so each one keeps its calendar slot; add or drop a session only with a reason stated in rationale.";

const MARKDOWN_RULE =
  '- Format rationale and clientSummary as markdown: short paragraphs, bold lead-ins naming the session (e.g. **Lower — squat focus**), and bullet lists for per-session/per-week breakdowns. No headings, no tables.';

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

/** SESSION TYPES section: the trainer's labels, grouped by the format they need. */
export function sessionTypesText(types: GenerationContext["sessionTypes"]): string {
  if (!types?.length) return "SESSION TYPES: none — omit \"type\".";
  const of = (f: SessionKind) => types.filter((t) => t.format === f).map((t) => t.name).join(", ") || "none";
  return [
    "SESSION TYPES (label every session with the one that fits; its format must match the session kind):",
    `- lifting: ${of("lifting")}`,
    `- cardio: ${of("cardio")}`,
  ].join("\n");
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
    CARDIO_TARGET_RULE,
    "- Quantify +volume/+intensity weeks with targets: set target { metric, deltaPercent } on WeekPlan where appropriate (overall volume ≈ +5%/wk, intensity ≈ +2.5% load).",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    GOLD_STANDARD_RULE,
    ...sessionStructureRules(ctx.client, ctx.previousProgram),
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    MARKDOWN_RULE,
    "- Keep rationale under 2500 characters and clientSummary under 1200 — longer text is rejected.",
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
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working + back-off sets, last 8 weeks):\n${ctx.chainBalance}`
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
                `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})${e.note ? ` — note: ${e.note}` : ""}`
            )
            .join("\n"),
        ]
      : []),
    "",
    ...(ctx.sessionTypes?.length ? [sessionTypesText(ctx.sessionTypes), ""] : []),
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    ...guidanceBlocks(ctx).flatMap((b) => [b, ""]),
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
  /** Recent chat thread for this client, oldest → newest (chat refine only). */
  conversation?: string | null;
  /**
   * "draft" (default): output is the revised draft JSON.
   * "proposal": output is {reply, proposal|null} — a change list only; the
   * draft is built later, when the trainer presses Build.
   */
  outputContract?: "draft" | "proposal";
}

/** Output schema spec for proposal turns (propose → build). */
const PROPOSAL_TURN_SCHEMA_SPEC = `{"reply": string (1-4 sentences — answers the message; when proposing, says in plain words what would change and why), "proposal": {"summary": string (one sentence), "changes": [{"day": number (the session's #N from DRAFT SLOTS — its position in the list, cardio included; NOT a weekday), "slot": number | null (exercise number from DRAFT SLOTS; null only for kind "add"), "kind": "swap" | "edit" | "add" | "remove", "from": string | null (current exercise name; null for "add"), "to": string | null (new exercise name, or the same name for "edit"; null for "remove"), "detail": string (prescription after the change, e.g. "5×5 @RPE 7–8 · rest 180s")}]} | null}`;

const PROPOSAL_RULES = [
  "- This is a CHAT TURN. You do NOT write a new draft in this turn.",
  '- If the message asks to change the program (swap/add/remove/reorder exercises, sets, reps, RPE, rest, volume, intensity, schedule), set "proposal" to the smallest list of slot changes that does what is asked: one entry per exercise slot touched, numbered as in DRAFT SLOTS. Never include a change the trainer did not ask for. Otherwise set "proposal" to null and answer in "reply". When the request is unclear, set "proposal" to null and ask one clarifying question in "reply".',
];

/** Numbered slot listing the proposal contract refers to. */
export function draftSlotsText(d: AiProgramDraft): string {
  const seq = { lifting: 0, cardio: 0 };
  return d.sessions
    .map((s, di) => {
      const kind = s.kind === "cardio" ? "cardio" : "lifting";
      const tag = `${kind === "cardio" ? "Cardio" : "Session"} ${++seq[kind]}`;
      const rows = s.exercises.map(
        (e, ei) => `  slot ${ei + 1} ${e.exerciseName ?? e.exerciseId ?? ""}${e.role ? ` (${e.role})` : ""} — ${rxLabel(e.prescribedSets)}`
      );
      return [`#${di + 1} ${tag} · ${s.name}`, ...rows].join("\n");
    })
    .join("\n");
}

export function buildRevisionMessages(ctx: RevisionContext): { system: string; user: string } {
  const proposal = ctx.outputContract === "proposal";
  const system = [
    "You are an expert strength & conditioning coach REVISING the draft of the NEXT training block for a client.",
    "You reason about progressive overload from logged training data and design sensible mesocycles.",
    "SAFETY: any injury, pain, or limitation listed for the client is a hard constraint — never prescribe movements that conflict with it.",
    "Respond with a single JSON object only, no prose outside the JSON. The JSON must match this schema:",
    proposal ? PROPOSAL_TURN_SCHEMA_SPEC : DRAFT_SCHEMA_SPEC,
    "Rules:",
    "- Reference exercises by catalog exerciseId when a suitable one exists; use exerciseName only for genuinely new movements.",
    "- Keep exercises the client has been performing (and progressing) unless there is a stated reason to swap.",
    ROLE_RULE,
    "- Balance every session and the week across movement patterns and functional movements: roughly match push volume (vertical + horizontal) with pull volume, and knee-dominant with hip-dominant work; vary functional movements across the week. rationale must state how the block is balanced across patterns and functional movements, and why.",
    "- Progress load conservatively: set targetWeightKg on working sets from the most recent logged load, stepping ~2.5 kg (smaller steps for upper body); regress if RPEs were 9+ or reps were missed. Omit targetWeightKg for bodyweight or RPE-driven work.",
    "- Propose phasing for the new block: plannedWeeks, phase name, and week directives (base → +volume → +intensity → deload/transition). Follow the periodization context when provided.",
    CARDIO_TARGET_RULE,
    "- Quantify +volume/+intensity weeks with targets: set target { metric, deltaPercent } on WeekPlan where appropriate (overall volume ≈ +5%/wk, intensity ≈ +2.5% load).",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    GOLD_STANDARD_RULE,
    ...sessionStructureRules(ctx.client, ctx.previousProgram),
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    MARKDOWN_RULE,
    "- Keep rationale under 2500 characters and clientSummary under 1200 — longer text is rejected.",
    ...(proposal
      ? PROPOSAL_RULES
      : [
          "- This is a REVISION: the previous draft is provided below. Apply the trainer's feedback exactly.",
          "- Change only what the feedback requires (and what directly follows from it); keep everything else in the previous draft identical.",
        ]),
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
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working + back-off sets, last 8 weeks):\n${ctx.chainBalance}`
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
                `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})${e.note ? ` — note: ${e.note}` : ""}`
            )
            .join("\n"),
        ]
      : []),
    ...(ctx.sessionTypes?.length ? ["", sessionTypesText(ctx.sessionTypes)] : []),
    ...guidanceBlocks(ctx).flatMap((b) => ["", b]),
    "",
    "PREVIOUS DRAFT (your earlier output — revise it):",
    draftToText(ctx.previousDraft),
    ...(proposal ? ["", "DRAFT SLOTS (use these numbers in proposal.changes):", draftSlotsText(ctx.previousDraft)] : []),
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
    proposal
      ? `TRAINER MESSAGE (answer it in "reply"; fill "proposal" only if it asks for changes): ${ctx.feedback}`
      : `TRAINER FEEDBACK (apply this to the previous draft): ${ctx.feedback}`,
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
  /** See RevisionContext.outputContract. */
  outputContract?: "draft" | "proposal";
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
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    ...sessionStructureRules(ctx.client, ctx.previousProgram),
    WEEK_STABILITY_RULE,
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    MARKDOWN_RULE,
    "- Keep rationale under 2500 characters and clientSummary under 1200 — longer text is rejected.",
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
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working + back-off sets, last 8 weeks):\n${ctx.chainBalance}`
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
          `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})${e.note ? ` — note: ${e.note}` : ""}`
      )
      .join("\n"),
    "",
    ...(ctx.sessionTypes?.length ? [sessionTypesText(ctx.sessionTypes), ""] : []),
    ...(ctx.direction
      ? [`STANDING DIRECTION (block-level — applies to every generation of this block): ${ctx.direction}`, ""]
      : []),
    ...guidanceBlocks(ctx).flatMap((b) => [b, ""]),
    `TRAINER INSTRUCTIONS: ${ctx.trainerInstructions || "none"}`,
  ].join("\n");

  return { system, user };
}

export function buildWeekRevisionMessages(ctx: WeekRevisionContext): { system: string; user: string } {
  const proposal = ctx.outputContract === "proposal";
  const system = [
    `You are an expert strength & conditioning coach REVISING the draft of the NEXT WEEK (week ${ctx.targetWeek} of ${ctx.plannedWeeks}) of the client's CURRENT block.`,
    "You reason about progressive overload from logged training data and design sensible mesocycles.",
    "SAFETY: any injury, pain, or limitation listed for the client is a hard constraint — never prescribe movements that conflict with it.",
    "Respond with a single JSON object only, no prose outside the JSON. The JSON must match this schema:",
    proposal ? PROPOSAL_TURN_SCHEMA_SPEC : DRAFT_SCHEMA_SPEC,
    "Rules:",
    "- Reference exercises by catalog exerciseId when a suitable one exists; use exerciseName only for genuinely new movements.",
    "- Keep exercises the client has been performing (and progressing) unless there is a stated reason to swap.",
    "- Keep exercise selection stable week to week — swap only with a reason stated in rationale.",
    ROLE_RULE,
    "- Balance every session and the week across movement patterns and functional movements: roughly match push volume (vertical + horizontal) with pull volume, and knee-dominant with hip-dominant work; vary functional movements across the week. rationale must state how the block is balanced across patterns and functional movements, and why.",
    "- Progress load conservatively: set targetWeightKg on working sets from the most recent logged load, stepping ~2.5 kg (smaller steps for upper body); regress if RPEs were 9+ or reps were missed. Omit targetWeightKg for bodyweight or RPE-driven work.",
    "- Do NOT propose phasing: the block's periodization is fixed.",
    "- Follow the next week's directive and target when provided.",
    "- Spread volume across the trainer's five kinetic chains: use the chain balance context to give neglected chains work (usually accessories) without regressing the main lifts.",
    ...sessionStructureRules(ctx.client, ctx.previousProgram),
    WEEK_STABILITY_RULE,
    "- rationale and clientSummary must be concrete and reference actual numbers from the history.",
    MARKDOWN_RULE,
    "- Keep rationale under 2500 characters and clientSummary under 1200 — longer text is rejected.",
    ...(proposal
      ? PROPOSAL_RULES
      : [
          "- This is a REVISION: the previous draft is provided below. Apply the trainer's feedback exactly.",
          "- Change only what the feedback requires (and what directly follows from it); keep everything else in the previous draft identical.",
        ]),
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
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working + back-off sets, last 8 weeks):\n${ctx.chainBalance}`
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
          `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})${e.note ? ` — note: ${e.note}` : ""}`
      )
      .join("\n"),
    ...(ctx.sessionTypes?.length ? ["", sessionTypesText(ctx.sessionTypes)] : []),
    ...guidanceBlocks(ctx).flatMap((b) => ["", b]),
    "",
    "PREVIOUS DRAFT (your earlier output — revise it):",
    draftToText(ctx.previousDraft),
    ...(proposal ? ["", "DRAFT SLOTS (use these numbers in proposal.changes):", draftSlotsText(ctx.previousDraft)] : []),
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
    proposal
      ? `TRAINER MESSAGE (answer it in "reply"; fill "proposal" only if it asks for changes): ${ctx.feedback}`
      : `TRAINER FEEDBACK (apply this to the previous draft): ${ctx.feedback}`,
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
          const sets = e.prescribedSets.map((ps) => {
            const amount = ps.durationSeconds != null ? `${ps.durationSeconds}s` : `${ps.reps}${ps.amrap ? "+" : ""} reps`;
            const rpe = ps.targetRpe ? ` @ RPE ${ps.targetRpe}` : "";
            const rest = ps.restSeconds != null ? `, rest ${ps.restSeconds}s` : "";
            return `${amount}${rpe}${rest}`;
          });
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
        `- ${s.name}${s.kind === "cardio" ? " (cardio)" : ""}: ${s.exercises
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
      ` · ${stats.sets} sets` +
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
      ? `KINETIC CHAIN BALANCE (the trainer's five chains; working + back-off sets, last 8 weeks):\n${ctx.chainBalance}`
      : "KINETIC CHAIN BALANCE: no logged training to balance yet.",
    "",
    ctx.history.length > 0
      ? ["RECENT TRAINING LOGS (last 8 weeks, oldest → newest):", historyToText(ctx.history)].join("\n")
      : "RECENT TRAINING LOGS: none.",
    "",
    draftBlock,
    "",
    ...guidanceBlocks(ctx).flatMap((b) => [b, ""]),
    `EXERCISE CATALOG (names for reference):`,
    ...(ctx.catalog.length
      ? [
          ctx.catalog
            .map(
              (e) =>
                `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment}, ${e.movementPattern ?? "pattern n/a"}, ${e.functionalMovement ?? "function n/a"})${e.note ? ` — note: ${e.note}` : ""}`
            )
            .join("\n"),
        ]
      : []),
  ].join("\n");
}


// ---------------------------------------------------------------------------
// Rule extraction (detailed feedback → candidate coaching rule)
// ---------------------------------------------------------------------------

export interface RuleExtractContext {
  /** null = trainer-wide scope. */
  clientName: string | null;
  scope: "client" | "always";
  /** Where the note points, or null for a chat revision. */
  anchor: NoteAnchor | null;
  /** What the AI wrote at that spot, when known. */
  subjectText?: string | null;
  comment: string | null;
  correction: string | null;
  reasonTags?: string[];
  /** Active rules already in force — don't restate them. */
  existingRules: string[];
}

export function buildRuleExtractMessages(ctx: RuleExtractContext): { system: string; user: string } {
  const system = [
    "You turn one piece of a personal trainer's feedback on an AI-written program or reply into ONE standing coaching rule for future AI drafts.",
    'Respond with a single JSON object only: {"rule": string, "category": string, "appliesTo": "client" | "always"}.',
    "Rules:",
    "- One imperative sentence, at most 200 characters, concrete and checkable (exercise, sets/reps, RPE, rest, structure, tone).",
    "- Generalise from the specific case only as far as the feedback supports; keep the trainer's numbers and exercise names exactly.",
    "- Write it in English even when the feedback is in another language.",
    `- category: one of ignored_limitation, wrong_exercise, volume_off, load_off, invented_number, off_topic, tone, too_long, format, style.`,
    "- appliesTo: the scope the trainer chose (given below).",
    "- If an existing rule already says it, return that rule's wording.",
  ].join("\n");

  const user = [
    `SCOPE: ${ctx.scope === "client" ? `this client only (${ctx.clientName ?? "client"})` : "all clients"}`,
    `ABOUT: ${anchorText(ctx.anchor)}`,
    ...(ctx.subjectText ? [`THE AI WROTE: ${ctx.subjectText}`] : []),
    `TRAINER SAID: ${ctx.comment || "(nothing)"}`,
    `DO INSTEAD: ${ctx.correction || "(not given)"}`,
    ...(ctx.reasonTags?.length ? [`TAGS: ${ctx.reasonTags.join(", ")}`] : []),
    "",
    ctx.existingRules.length ? `EXISTING RULES:\n${ctx.existingRules.map((r) => `- ${r}`).join("\n")}` : "EXISTING RULES: none",
  ].join("\n");

  return { system, user };
}
