import { z } from "zod";
import { Phasing, PrescribedSet } from "./domain";

// ---------------------------------------------------------------------------
// AI provider abstraction
// ---------------------------------------------------------------------------

/**
 * Every provider speaks the OpenAI chat-completions dialect.
 * Z.ai GLM flash is the default; OpenAI/Groq/OpenRouter slot in by config.
 */
export const AiProviderConfig = z.object({
  /** Stable key used in DB records, e.g. "zai", "openai". */
  id: z.string().min(1),
  /** Human label shown in the trainer UI. */
  label: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  /** API key is injected server-side from env — never serialized to clients. */
  apiKeyEnvVar: z.string().min(1),
  /** Max output tokens for program generation. */
  maxOutputTokens: z.number().int().min(256).max(32768).default(8192),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfig>;

export const KNOWN_PROVIDERS = {
  zai: {
    id: "zai",
    label: "Z.ai GLM Flash",
    baseUrl: "https://api.z.ai/api/paas/v4",
    model: "glm-4.5-flash",
    apiKeyEnvVar: "ZAI_API_KEY",
    maxOutputTokens: 8192,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKeyEnvVar: "OPENAI_API_KEY",
    maxOutputTokens: 8192,
  },
  /** Canned draft, no network, no key. For tests and UI development. */
  mock: {
    id: "mock",
    label: "Mock (canned draft)",
    baseUrl: "mock://local",
    model: "mock-draft-v1",
    apiKeyEnvVar: "MOCK_NO_KEY_NEEDED",
    maxOutputTokens: 4096,
  },
} as const satisfies Record<string, AiProviderConfig>;

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
    prescribedSets: z.array(PrescribedSet).min(1).max(20),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.exerciseId !== undefined || v.exerciseName !== undefined, {
    message: "Provide exerciseId (from catalog) or exerciseName",
  });
export type DraftExerciseRef = z.infer<typeof DraftExerciseRef>;

export const DraftSession = z.object({
  name: z.string().min(1).max(160),
  exercises: z.array(DraftExerciseRef).min(1).max(20),
  notes: z.string().max(2000).optional(),
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
  providerId: z.string(),
  model: z.string(),
  status: GenerationStatus,
  /** Validated draft when status = validated|approved|rejected. */
  draft: AiProgramDraft.nullable(),
  /** Error detail when status = failed_*. */
  error: z.string().max(4000).nullable(),
  createdAt: z.string(),
});
export type AiGeneration = z.infer<typeof AiGeneration>;
