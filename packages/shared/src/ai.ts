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
   * Reasoning-effort levels the trainer may pick for this provider's models
   * (UI selector; absent = the provider takes no effort parameter).
   */
  effortLevels: z.array(z.string().min(1)).min(1).optional(),
  /** Which effortLevel is used when none is selected. */
  defaultEffort: z.string().min(1).optional(),
  /**
   * Models the trainer may pick for generation — the first entry is the
   * default. Overridable via `<ID>_MODELS` (csv) / `<ID>_MODEL` (default).
   */
  models: z.array(z.string().min(1)).min(1),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfig>;

export const KNOWN_PROVIDERS = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    maxOutputTokens: 16384,
    // "none" switches thinking off (reasoning_effort: none, api-docs.deepseek.com/guides/thinking_mode)
    effortLevels: ["none", "low", "high", "max"],
    defaultEffort: "high",
    models: [
      "deepseek-flash", // default — V4.1-Flash
      "deepseek-v4-pro",
    ],
  },
  zai: {
    id: "zai",
    label: "Z.ai GLM",
    baseUrl: "https://api.z.ai/api/paas/v4",
    apiKeyEnvVar: "ZAI_API_KEY",
    maxOutputTokens: 8192,
    effortLevels: ["low", "high", "max"],
    defaultEffort: "low", // glm-5 budget low is the shipped default; max maps to the provider's top budget
    models: [
      "glm-5.3-flash", // default
      "glm-5.3",
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

/** Provider used when a request names none; listed first so pickers start on it. */
export const DEFAULT_PROVIDER_ID = "deepseek" satisfies keyof typeof KNOWN_PROVIDERS;

/** Rough wall-clock seconds one generation takes, for UI expectation-setting. */
export const TYPICAL_GENERATION_SECONDS: Record<string, number> = {
  zai: 210, // live GLM ≈ 3.5 min per draft
  deepseek: 20, // live deepseek-chat ≈ 10 s per draft (2026-11-05 run)
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
    /** Name of one of the trainer's session types; resolved on approval, unknown names are dropped. */
    type: z.string().max(40).optional(),
    /** Suggested ISO weekday (1=Mon…7=Sun). Kept when it passes the placement
     *  rules, else re-placed; a bad value is dropped, never fails the draft. */
    weekday: z.number().int().min(1).max(7).nullable().optional().catch(null),
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
  "cancelled",
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
  instructions: z.string().max(2000).nullable(),
  rejectReason: z.string().max(2000).nullable(),
  approvedProgramId: z.string().uuid().nullable(),
  exampleProgramIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string(),
});
export type AiGeneration = z.infer<typeof AiGeneration>;

export function mockReviseDraft(previous: AiProgramDraft, message: string): AiProgramDraft {
  const next = structuredClone(previous);
  next.rationale = `${previous.rationale}\n\nRevision: ${message}`;
  return next;
}

// ---------------------------------------------------------------------------
// AI client message draft
// ---------------------------------------------------------------------------

/** Hard cap for a client-facing message — LINE-sized. */
export const CLIENT_MESSAGE_MAX_CHARS = 1200;

/** Structured output of the "draft client message" call — the only shape accepted. */
export const AiClientMessageDraft = z.object({
  message: z.string().min(1).max(CLIENT_MESSAGE_MAX_CHARS),
});
export type AiClientMessageDraft = z.infer<typeof AiClientMessageDraft>;

// ---------------------------------------------------------------------------
// Chat messages & mocks
// ---------------------------------------------------------------------------

export const CHAT_ROLES = ["trainer", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];
export const CHAT_MESSAGE_KINDS = ["chat", "revision", "draft", "error", "proposal"] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

export const ChatMessage = z.object({
  id: z.string().uuid(),
  trainerId: z.string().uuid(),
  clientId: z.string().uuid(),
  role: z.enum(CHAT_ROLES),
  kind: z.enum(CHAT_MESSAGE_KINDS).default("chat"),
  content: z.string().max(4000),
  generationId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export function mockChatReply(message: string, clientName: string | null): string {
  return `(${clientName ?? "this client"}) You asked: “${message}” — mock reply. This client's profile, current program, recent logs, and latest draft are in the assistant's context; pick a live provider for real answers.`;
}

export function draftNoticeText(d: AiProgramDraft): string {
  return `Draft ready: ${d.name} — ${d.sessions.length} sessions. Open review to inspect and approve.`;
}


// ---------------------------------------------------------------------------
// Chat proposals (propose → build)
// ---------------------------------------------------------------------------

export const ChatProposalChange = z.object({
  /** 1-based session number in the draft being changed. */
  day: z.number().int().min(1),
  /**
   * 1-based exercise number in that session; null for kind "add", and for an
   * "edit" of a cardio session (its prescription — cardio has no exercises).
   */
  slot: z.number().int().min(1).nullable(),
  kind: z.enum(["swap", "edit", "add", "remove"]),
  from: z.string().max(200).nullable(),
  to: z.string().max(200).nullable(),
  /** Prescription after the change, e.g. "5×5 @RPE 7–8 · rest 180s" or "35 min · Z2 · RPE 4". */
  detail: z.string().max(300),
}).refine((c) => c.slot != null || c.kind === "add" || c.kind === "edit", {
  message: 'slot may be null only for "add" or a cardio "edit"',
  path: ["slot"],
});
export type ChatProposalChange = z.infer<typeof ChatProposalChange>;

export const ChatProposal = z.object({
  summary: z.string().min(1).max(500),
  changes: z.array(ChatProposalChange).min(1).max(20),
});
export type ChatProposal = z.infer<typeof ChatProposal>;

/** What chat_messages.proposal stores. */
export interface StoredChatProposal extends ChatProposal {
  /** The version the proposal changes. */
  parentGenerationId: string;
  /** Set once Build produced a validated version; null until then. */
  builtGenerationId: string | null;
  /** The trainer message that asked for this change list — its text is the build's history.
   *  Stored at turn time so a build never has to infer it from timestamps. */
  requestMessageId?: string | null;
}

/** Deterministic mock proposal: an "edit" on day 1, slot 1 (+15s rest). */
export function mockProposal(draft: AiProgramDraft, message: string): ChatProposal {
  const ex = draft.sessions[0]?.exercises[0];
  const name = ex?.exerciseName ?? ex?.exerciseId ?? "Exercise 1";
  return {
    summary: `Mock proposal for: ${message}`,
    changes: [{ day: 1, slot: 1, kind: "edit", from: name, to: name, detail: "rest +15s on every set" }],
  };
}

/**
 * Mock build: applies each "edit" as +15s rest on that slot (+5 min for a cardio
 * session edit, slot null); other kinds are ignored.
 * `rogue` also makes the off-proposal edits a live model made in F04 (next block →
 * "deload", last week's target dropped, first cardio session one zone harder), so
 * tests can prove the build scope reverts them.
 */
export function mockApplyProposal(draft: AiProgramDraft, proposal: ChatProposal, opts: { rogue?: boolean } = {}): AiProgramDraft {
  const next = structuredClone(draft);
  if (opts.rogue) {
    if (next.phasing) {
      next.phasing.nextPhase = "deload";
      const last = next.phasing.weeks?.at(-1);
      if (last) delete last.target;
    }
    const cardio = next.sessions.find((s) => s.cardio)?.cardio;
    if (cardio) cardio.hrZone = Math.min(5, (cardio.hrZone ?? 2) + 1);
  }
  for (const c of proposal.changes) {
    if (c.kind !== "edit") continue;
    if (c.slot == null) {
      const cardio = next.sessions[c.day - 1]?.cardio;
      if (cardio) cardio.durationMin = Math.min(300, (cardio.durationMin ?? 30) + 5);
      continue;
    }
    const ex = next.sessions[c.day - 1]?.exercises[c.slot - 1];
    if (!ex) continue;
    ex.prescribedSets = ex.prescribedSets.map((s) => ({ ...s, restSeconds: (s.restSeconds ?? 60) + 15 }));
  }
  return next;
}

/** Revision feedback text that turns an approved proposal into a draft. */
export function proposalToFeedback(message: string, proposal: ChatProposal): string {
  const lines = proposal.changes.map((c) => {
    const where = c.slot != null ? `Day ${c.day}, slot ${c.slot}` : c.kind === "edit" ? `Day ${c.day}, cardio session` : `Day ${c.day}, new slot`;
    return `- ${where} (${c.kind}): ${c.from ?? "—"} → ${c.to ?? "removed"} — ${c.detail}`;
  });
  return [
    "Apply exactly these changes to the previous draft and nothing else. Keep every other exercise, set, rep, RPE and rest value identical.",
    `Trainer request: ${message}`,
    "Changes:",
    ...lines,
    "Do not change: the block plan / phasing (weeks, targets, next block), cardio sessions not listed, session names, kinds and types, or any slot not listed. Keep rep ranges, loads and set types exactly as they are.",
  ].join("\n");
}
