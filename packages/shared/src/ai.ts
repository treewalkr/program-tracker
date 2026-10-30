import { z } from "zod";
import {
  CardioPrescription,
  ExerciseRole,
  Phasing,
  PrescribedSet,
  SessionKind,
} from "./domain";

// ---------------------------------------------------------------------------
// AI provider abstraction
// ---------------------------------------------------------------------------

/**
 * Every provider speaks the OpenAI chat-completions dialect.
 * Z.ai GLM flash is the default; more slot in by config when needed.
 */
export const AiProviderConfig = z.object({
  /** Stable key used in DB records, e.g. "zai". */
  id: z.string().min(1),
  /** Human label shown in the trainer UI. */
  label: z.string().min(1),
  baseUrl: z.string().url(),
  /** API key is injected server-side from env — never serialized to clients. */
  apiKeyEnvVar: z.string().min(1),
  /** Max output tokens for program generation. */
  maxOutputTokens: z.number().int().min(256).max(32768).default(8192),
  /**
   * Z.ai GLM 4.x are thinking models: without this, reasoning eats the token
   * budget and `content` comes back empty (or truncated) for structured JSON.
   */
  disableThinking: z.boolean().optional(),
  /**
   * Models the trainer may pick for generation — the first entry is the
   * default. Overridable via `<ID>_MODELS` (csv) / `<ID>_MODEL` (default).
   */
  models: z.array(z.string().min(1)).min(1),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfig>;

export const KNOWN_PROVIDERS = {
  zai: {
    id: "zai",
    label: "Z.ai GLM",
    baseUrl: "https://api.z.ai/api/paas/v4",
    apiKeyEnvVar: "ZAI_API_KEY",
    maxOutputTokens: 8192,
    disableThinking: true,
    models: [
      "glm-4.5-flash", // default — free tier
      "glm-5.3-flash",
      "glm-5.3"
    ],
  },
  /** Canned draft, no network, no key. For tests and UI development. */
  mock: {
    id: "mock",
    label: "Mock (canned draft)",
    baseUrl: "mock://local",
    apiKeyEnvVar: "MOCK_NO_KEY_NEEDED",
    maxOutputTokens: 4096,
    models: ["mock-draft-v1"],
  },
} as const satisfies Record<string, AiProviderConfig>;

/** Rough wall-clock seconds one generation takes, for UI expectation-setting. */
export const TYPICAL_GENERATION_SECONDS: Record<string, number> = {
  zai: 210, // live GLM ≈ 3.5 min per draft
  mock: 3, // mock generate delays 2.2 s
};
export const DEFAULT_GENERATION_SECONDS = 240;
export function typicalGenerationSeconds(providerId: string): number {
  return TYPICAL_GENERATION_SECONDS[providerId] ?? DEFAULT_GENERATION_SECONDS;
}

// ---------------------------------------------------------------------------
// AI program draft — the ONLY shape the LLM is allowed to emit
// ---------------------------------------------------------------------------

/**
 * Exercise reference in an AI draft. Prefer a known catalog id; fall back to a
 * free-text name that the trainer maps or creates on approval.
 */
export const DraftExerciseRef = z
  .object({
    exerciseId: z.string().uuid().optional(),
    exerciseName: z.string().min(1).max(160).optional(),
    /** Session slot; the prompt asks for one on every exercise, the gate tolerates its absence. */
    role: ExerciseRole.optional(),
    prescribedSets: z.array(PrescribedSet).min(1).max(20),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.exerciseId !== undefined || v.exerciseName !== undefined, {
    message: "Provide exerciseId (from catalog) or exerciseName",
  });
export type DraftExerciseRef = z.infer<typeof DraftExerciseRef>;

export const DraftSession = z
  .object({
    name: z.string().min(1).max(160),
    kind: SessionKind.default("lifting"),
    cardio: CardioPrescription.nullable().optional(),
    exercises: z.array(DraftExerciseRef).max(20).default([]),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "lifting") {
      if (val.exercises.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting session requires at least one exercise",
          path: ["exercises"],
        });
      }
      if (val.cardio != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting session must not have cardio prescription",
          path: ["cardio"],
        });
      }
    } else if (val.kind === "cardio") {
      if (val.cardio == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio session requires cardio prescription",
          path: ["cardio"],
        });
      }
      if (val.exercises.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio session must not have exercises",
          path: ["exercises"],
        });
      }
    }
  });
export type DraftSession = z.infer<typeof DraftSession>;

/**
 * Structured output of the "generate next program" call. Validated with this
 * schema before anything is stored or shown; a failed validation is retried
 * once, then surfaced as an error to the trainer.
 */
export const AiProgramDraft = z.object({
  /** Short program name, e.g. "Lower/Hypertrophy Block 2". */
  name: z.string().min(1).max(160),
  /** Trainer-facing rationale: progression logic, volume changes, why. */
  rationale: z.string().max(4000),
  /** Client-facing blurb the trainer can edit before sending. */
  clientSummary: z.string().max(2000),
  /** Proposed periodization for the new block (week directives from the scheme). */
  phasing: Phasing.optional(),
  sessions: z.array(DraftSession).min(1).max(14),
});
export type AiProgramDraft = z.infer<typeof AiProgramDraft>;

// ---------------------------------------------------------------------------
// Generation audit record
// ---------------------------------------------------------------------------

export const GENERATION_STATUSES = [
  "pending",
  "validated",
  "failed_validation",
  "failed_provider",
  "approved",
  "rejected",
] as const;
export const GenerationStatus = z.enum(GENERATION_STATUSES);
export type GenerationStatus = z.infer<typeof GenerationStatus>;

export const AiGeneration = z.object({
  id: z.string().uuid(),
  trainerId: z.string().uuid(),
  clientId: z.string().uuid(),
  /** Program this draft was generated from; null for a cold start. */
  basedOnProgramId: z.string().uuid().nullable(),
  kind: z.enum(["block", "week"]).default("block"),
  targetWeek: z.number().int().min(1).max(26).nullable().optional(),
  direction: z.string().max(500).nullable().optional(),
  providerId: z.string(),
  model: z.string(),
  status: GenerationStatus,
  /** Validated draft when status = validated|approved|rejected. */
  draft: AiProgramDraft.nullable(),
  /** Error detail when status = failed_*. */
  error: z.string().max(4000).nullable(),
  parentGenerationId: z.string().uuid().nullable(),
  revisionMessage: z.string().max(2000).nullable(),
  exampleProgramIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string(),
});
export type AiGeneration = z.infer<typeof AiGeneration>;

export function mockReviseDraft(previous: AiProgramDraft, message: string): AiProgramDraft {
  const next = structuredClone(previous);
  next.rationale = `${previous.rationale}\n\nRevision: ${message}`;
  return next;
}
