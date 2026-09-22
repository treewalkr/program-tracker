import type { AiProgramDraft } from "@pt/shared";

export interface ClientContext {
  name: string;
  goals?: string | null;
  limitations?: string | null;
  daysPerWeek?: number | null;
}

export interface ProgramSummary {
  name: string;
  sessions: {
    name: string;
    exercises: { name: string; sets: string[] }[];
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
}

export interface GenerationContext {
  client: ClientContext;
  previousProgram: ProgramSummary | null;
  history: ExerciseHistoryEntry[];
  catalog: CatalogEntry[];
  trainerInstructions: string;
}

const DRAFT_SCHEMA_SPEC = `{
  "name": string,                    // short program name
  "rationale": string,              // trainer-facing: progression logic, volume/intensity changes, and why
  "clientSummary": string,          // client-facing blurb, encouraging, no jargon
  "sessions": [                     // exactly the client's training days per week
    {
      "name": string,
      "notes": string?,             // optional
      "exercises": [
        {
          "exerciseId": string?,    // preferred: use a catalog id
          "exerciseName": string,   // required if exerciseId omitted
          "prescribedSets": [
            {
              "setNumber": number,  // 1-indexed, sequential
              "type": "warm_up" | "working" | "backoff",
              "reps": number,       // target reps (1-100)
              "amrap": boolean,     // true = reps is the minimum, go to failure
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
    "- Progress load conservatively (~2.5% or the nearest practical increment); regress if RPEs were 9+ or reps were missed.",
    "- Include warm-up sets for the first heavy compound of each session.",
    `- Number of sessions must equal the client's days per week (${ctx.client.daysPerWeek ?? "not specified — infer from the previous program"}).`,
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
          "CURRENT PROGRAM (the block you are following up):",
          programToText(ctx.previousProgram),
        ].join("\n")
      : "CURRENT PROGRAM: none (cold start — design a sensible first block).",
    "",
    ctx.history.length > 0
      ? ["RECENT TRAINING LOGS (last 8 weeks, oldest → newest):", historyToText(ctx.history)].join("\n")
      : "RECENT TRAINING LOGS: none.",
    "",
    `EXERCISE CATALOG (use these exerciseId values when possible):`,
    ctx.catalog.map((e) => `- ${e.id} | ${e.name} (${e.primaryMuscleGroup}, ${e.equipment})`).join("\n"),
    "",
    `TRAINER INSTRUCTIONS: ${ctx.trainerInstructions || "none"}`,
  ].join("\n");

  return { system, user };
}

function programToText(p: ProgramSummary): string {
  return p.sessions
    .map(
      (s) =>
        `- ${s.name}: ${s.exercises
          .map((e) => `${e.name} [${e.sets.join("; ")}]`)
          .join(", ")}`
    )
    .join("\n");
}

function historyToText(h: ExerciseHistoryEntry[]): string {
  return h
    .map((e) => `- ${e.exerciseName} (best e1RM ${e.bestE1rm}kg): ${e.recentSets.join(", ")}`)
    .join("\n");
}

/** Typed re-export so routes share one import path. */
export type { AiProgramDraft };
