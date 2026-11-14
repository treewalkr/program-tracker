import { z } from "zod";
import {
  CardioPrescription,
  ExerciseRole,
  Phasing,
  PrescribedSet,
  Rotation,
  SessionKind,
  rotationOfWeek,
  sessionsInSeqOrder,
  type ProgramWeek,
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
  maxOutputTokens: z.number().int().min(256).max(65536).default(8192),
  /**
   * The model's real output ceiling, asked for by calls that write a whole
   * block (every week in one answer; thinking shares it). Absent = maxOutputTokens.
   */
  blockOutputTokens: z.number().int().min(256).max(131072).optional(),
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
    maxOutputTokens: 65536,
    blockOutputTokens: 65536,
    // "none" switches thinking off (reasoning_effort: none, api-docs.deepseek.com/guides/thinking_mode)
    effortLevels: ["none", "low", "high", "max"],
    defaultEffort: "max", // sent on every call that picks none (callLlm)
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
    blockOutputTokens: 131072, // glm-5.x max_tokens ceiling (docs.z.ai, concept-param)
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
    /** Label; the prompt asks for one on every exercise. An unknown value is dropped
     *  here and filled by suggestRole when the draft is settled (fixDraftRoles). */
    role: ExerciseRole.optional().catch(undefined),
    prescribedSets: z.array(PrescribedSet).min(1).max(20),
    notes: z.string().max(1000).optional(),
    /** Superset letter; members adjacent with equal set counts. Tidied by normalizeGroups when settled. */
    group: z.string().regex(/^[A-Z]$/).optional().catch(undefined),
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

/** One week of an AI draft: its sessions, and its A/B letter when the block alternates. */
export const DraftWeek = z.object({
  week: z.number().int().min(1).max(26),
  /** A/B letter (odd = A, even = B); absent = same every week. */
  rotation: Rotation.optional(),
  /** Fill drafts: a week the trainer wrote — kept as is, never written by the AI. */
  locked: z.boolean().optional(),
  sessions: z.array(DraftSession).min(1).max(14),
});
export type DraftWeek = z.infer<typeof DraftWeek>;

/** Most weeks a draft carries (a block is 2–26 weeks). */
export const MAX_DRAFT_WEEKS = 26;
/** Most weeks the AI writes in one block draft or fill (the builder still allows 26). */
export const MAX_AI_BLOCK_WEEKS = 12;
/** Fewest weeks in a block. */
export const MIN_BLOCK_WEEKS = 2;

const DraftBody = z
  .object({
    /** Short program name, e.g. "Lower/Hypertrophy Block 2". */
    name: z.string().min(1).max(160),
    /** Trainer-facing rationale: progression logic, volume changes, why. */
    rationale: z.string().max(4000),
    /** Client-facing blurb the trainer can edit before sending. */
    clientSummary: z.string().max(2000),
    /** Proposed periodization for the new block (week directives from the scheme). */
    phasing: Phasing.optional(),
    /**
     * Every week in full, in week order: a block draft has one entry per
     * planned week, a week draft (`kind: "week"`) has just its target week.
     */
    weeks: z.array(DraftWeek).min(1).max(MAX_DRAFT_WEEKS),
  })
  .superRefine((d, ctx) => {
    d.weeks.forEach((w, i) => {
      if (i > 0 && w.week <= d.weeks[i - 1].week) {
        ctx.addIssue({ code: "custom", message: "weeks must be in week order, each week once", path: ["weeks", i, "week"] });
      }
    });
  });

/** The pre-FB-013 draft: one week of sessions, stamped onto every week on approve. */
export type LegacyDraft = Omit<AiProgramDraft, "weeks"> & { sessions: DraftSession[] };

/**
 * Read an old one-week draft (`sessions`) as `weeks[]`: the week copied to
 * every planned week (phasing.plannedWeeks, else one week), as approve used to
 * stamp it. Anything else passes through untouched.
 */
export function upgradeDraft(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = raw as Record<string, unknown>;
  if (r.weeks !== undefined || !Array.isArray(r.sessions)) return raw;
  const { sessions, ...rest } = r;
  const planned = (r.phasing as { plannedWeeks?: unknown } | undefined)?.plannedWeeks;
  const n = typeof planned === "number" && Number.isInteger(planned) ? Math.min(Math.max(planned, 1), MAX_DRAFT_WEEKS) : 1;
  return {
    ...rest,
    weeks: Array.from({ length: n }, (_, i) => ({ week: i + 1, sessions: JSON.parse(JSON.stringify(sessions)) })),
  };
}

/**
 * Structured output of the "generate next program" call. Validated with this
 * schema before anything is stored or shown; a failed validation is retried
 * once, then surfaced as an error to the trainer. Old one-week drafts
 * (`sessions`) read as `weeks[]` (upgradeDraft).
 */
export const AiProgramDraft = z.preprocess(upgradeDraft, DraftBody);
export type AiProgramDraft = z.infer<typeof DraftBody>;

/** A one-week draft written the old way (tests, mocks) as `weeks[]`: its week copied `weeks` times (default 1). No validation. */
export function draftFromSessions(d: LegacyDraft, weeks = 1): AiProgramDraft {
  const { sessions, ...rest } = d;
  return {
    ...rest,
    weeks: Array.from({ length: weeks }, (_, i) => ({ week: i + 1, sessions: JSON.parse(JSON.stringify(sessions)) as DraftSession[] })),
  };
}

/** The draft's week `week` (by number); the first week when absent. */
export function draftWeek<T extends { weeks: { week: number }[] }>(d: T, week?: number | null): T["weeks"][number] {
  return (week != null ? d.weeks.find((w) => w.week === week) : undefined) ?? d.weeks[0];
}

/**
 * A program week as a draft week (fill drafts show the trainer's weeks this
 * way): sessions in draft order (lifting, then cardio), catalog refs, roles,
 * sets, groups, weekdays and session types kept.
 */
export function programWeekToDraftWeek(w: ProgramWeek, opts: { locked?: boolean } = {}): DraftWeek {
  return {
    week: w.week,
    ...(w.rotation ? { rotation: w.rotation } : {}),
    ...(opts.locked ? { locked: true } : {}),
    sessions: sessionsInSeqOrder(w.sessions).map((s) => ({
      name: s.name,
      kind: s.kind,
      ...(s.typeName ? { type: s.typeName } : {}),
      ...(s.weekday != null ? { weekday: s.weekday } : {}),
      ...(s.cardio ? { cardio: s.cardio } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      exercises: [...s.exercises]
        .sort((a, b) => a.order - b.order)
        .map((e) => ({
          ...(e.exerciseId.startsWith("pending:") ? {} : { exerciseId: e.exerciseId }),
          ...(e.exerciseName ? { exerciseName: e.exerciseName } : {}),
          ...(e.role ? { role: e.role } : {}),
          prescribedSets: e.prescribedSets,
          ...(e.notes ? { notes: e.notes } : {}),
          ...(e.group ? { group: e.group } : {}),
        })),
    })),
  };
}

/**
 * The draft cut or grown to `weeks` weeks (a block plan edit changed its
 * length): extra weeks are dropped; a new week copies the last earlier week
 * with its letter (odd A / even B when the draft alternates), else the last week.
 */
export function resizeDraftWeeks(d: AiProgramDraft, weeks: number): AiProgramDraft {
  const alternate = d.weeks.some((w) => w.rotation != null);
  const out = d.weeks.filter((w) => w.week <= weeks).map((w) => structuredClone(w));
  for (let week = (out.at(-1)?.week ?? 0) + 1; week <= weeks; week++) {
    const letter = alternate ? rotationOfWeek(week) : undefined;
    const src = [...out].reverse().find((w) => !letter || w.rotation === letter) ?? out[out.length - 1];
    const { locked: _l, ...copy } = structuredClone(src);
    out.push({ ...copy, week, ...(letter ? { rotation: letter } : {}) });
  }
  return { ...d, weeks: out };
}

/** True when the draft's weeks carry A/B letters. */
export const draftAlternates = (d: { weeks: { rotation?: string | null }[] }): boolean => d.weeks.some((w) => w.rotation != null);

/** What a block draft must look like: its length, letters and session count. */
export interface DraftWeekRules {
  /** Weeks the block has (one entry each, numbered 1..n). */
  plannedWeeks: number;
  /** Odd weeks A, even weeks B, and the two routines must differ. */
  alternate: boolean;
  /** Lifting sessions every week must have; null = only "the same every week". */
  liftingSessions?: number | null;
  /** Weeks the trainer wrote (fill): the AI must leave them out. */
  lockedWeeks?: readonly number[];
}

const liftingCount = (w: Pick<DraftWeek, "sessions">) => w.sessions.filter((s) => (s.kind ?? "lifting") === "lifting").length;
const exerciseSet = (w: Pick<DraftWeek, "sessions">) =>
  [...new Set(w.sessions.flatMap((s) => s.exercises.map((e) => (e.exerciseId ?? e.exerciseName ?? "").toLowerCase())))].sort().join("|");

/**
 * Problems with a block draft's weeks, as plain sentences (empty = fine):
 * one entry per planned week (locked weeks left out), each with the lifting
 * session count, letters odd = A / even = B when alternating (none
 * otherwise), and an A routine that differs from the B routine.
 */
export function draftWeekIssues(d: Pick<AiProgramDraft, "weeks">, rules: DraftWeekRules): string[] {
  const out: string[] = [];
  const locked = new Set(rules.lockedWeeks ?? []);
  const want = Array.from({ length: rules.plannedWeeks }, (_, i) => i + 1).filter((w) => !locked.has(w));
  const got = d.weeks.map((w) => w.week);
  for (const w of got) if (locked.has(w)) out.push(`week ${w} is the trainer's (locked): leave it out`);
  const missing = want.filter((w) => !got.includes(w));
  const extra = got.filter((w) => !locked.has(w) && !want.includes(w));
  if (missing.length) out.push(`missing week${missing.length > 1 ? "s" : ""} ${missing.join(", ")}: write every week of the block in full`);
  if (extra.length) out.push(`week${extra.length > 1 ? "s" : ""} ${extra.join(", ")} beyond the ${rules.plannedWeeks}-week block`);
  const lifting = rules.liftingSessions ?? (d.weeks[0] ? liftingCount(d.weeks[0]) : 0);
  for (const w of d.weeks) {
    if (liftingCount(w) !== lifting) out.push(`week ${w.week} has ${liftingCount(w)} lifting sessions, not ${lifting}`);
    if (rules.alternate && w.rotation !== rotationOfWeek(w.week)) {
      out.push(`week ${w.week} must be rotation "${rotationOfWeek(w.week)}" (odd weeks A, even weeks B)`);
    }
    if (!rules.alternate && w.rotation != null) out.push(`week ${w.week} has rotation "${w.rotation}" but the block does not alternate`);
  }
  if (rules.alternate) {
    const a = d.weeks.find((w) => w.rotation === "A");
    const b = d.weeks.find((w) => w.rotation === "B");
    if (a && b && exerciseSet(a) === exerciseSet(b)) out.push("the B routine repeats the A routine: B weeks must use different exercises");
  }
  return out;
}

/** AiProgramDraft plus the block's week rules — a failing draft is retried like any invalid output. */
export function blockDraftSchema(rules: DraftWeekRules) {
  return AiProgramDraft.transform((d) => (rules.alternate ? d : withoutLetters(d))).superRefine((d, ctx) => {
    for (const message of draftWeekIssues(d, rules)) ctx.addIssue({ code: "custom", message, path: ["weeks"] });
  });
}

/** The draft with every A/B letter dropped (a "same every week" block never alternates on its own). */
export function withoutLetters(d: AiProgramDraft): AiProgramDraft {
  return { ...d, weeks: d.weeks.map(({ rotation: _r, ...w }) => w) };
}

/** Weeks a change made in week `week` reaches: every week with its letter, or every week when the draft doesn't alternate. */
export function sameLetterWeeks(d: Pick<AiProgramDraft, "weeks">, week: number): number[] {
  const letter = d.weeks.find((w) => w.week === week)?.rotation;
  return d.weeks.filter((w) => w.rotation === letter).map((w) => w.week);
}

// ---------------------------------------------------------------------------
// Generation audit record
// ---------------------------------------------------------------------------

/** block: a new block · week: re-draft the next week · fill: write the weeks the trainer left empty. */
export const GENERATION_KINDS = ["block", "week", "fill"] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

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
  kind: z.enum(GENERATION_KINDS).default("block"),
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
export const CHAT_MESSAGE_KINDS = ["chat", "revision", "draft", "error", "proposal", "edit"] as const;
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
  const n = d.weeks[0]?.sessions.length ?? 0;
  const weeks = d.weeks.length > 1 ? ` × ${d.weeks.length} weeks${draftAlternates(d) ? " (A/B)" : ""}` : "";
  return `Draft ready: ${d.name} — ${n} sessions${weeks}. Open review to inspect and approve.`;
}


// ---------------------------------------------------------------------------
// Chat proposals (propose → build)
// ---------------------------------------------------------------------------

export const ChatProposalChange = z.object({
  /**
   * Week whose DRAFT SLOTS the day/slot numbers read (absent = week 1). The
   * change reaches every week with that week's A/B letter — every week when
   * the block doesn't alternate.
   */
  week: z.number().int().min(1).max(MAX_DRAFT_WEEKS).nullable().optional(),
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
  const ex = draft.weeks[0]?.sessions[0]?.exercises[0];
  const name = ex?.exerciseName ?? ex?.exerciseId ?? "Exercise 1";
  return {
    summary: `Mock proposal for: ${message}`,
    changes: [{ day: 1, slot: 1, kind: "edit", from: name, to: name, detail: "rest +15s on every set" }],
  };
}

/**
 * Mock build: applies each "edit" as +15s rest on that slot (+5 min for a cardio
 * session edit, slot null) in every week the change reaches (sameLetterWeeks);
 * other kinds are ignored.
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
    for (const w of next.weeks) {
      const cardio = w.sessions.find((s) => s.cardio)?.cardio;
      if (cardio) cardio.hrZone = Math.min(5, (cardio.hrZone ?? 2) + 1);
    }
  }
  for (const c of proposal.changes) {
    if (c.kind !== "edit") continue;
    const reach = new Set(sameLetterWeeks(next, c.week ?? next.weeks[0].week));
    for (const w of next.weeks) {
      if (!reach.has(w.week)) continue;
      if (c.slot == null) {
        const cardio = w.sessions[c.day - 1]?.cardio;
        if (cardio) cardio.durationMin = Math.min(300, (cardio.durationMin ?? 30) + 5);
        continue;
      }
      const ex = w.sessions[c.day - 1]?.exercises[c.slot - 1];
      if (!ex) continue;
      ex.prescribedSets = ex.prescribedSets.map((s) => ({ ...s, restSeconds: (s.restSeconds ?? 60) + 15 }));
    }
  }
  return next;
}

/** Revision feedback text that turns an approved proposal into a draft. */
export function proposalToFeedback(message: string, proposal: ChatProposal): string {
  const lines = proposal.changes.map((c) => {
    const at = c.week != null && c.week > 1 ? `Week ${c.week}, day` : "Day";
    const where = c.slot != null ? `${at} ${c.day}, slot ${c.slot}` : c.kind === "edit" ? `${at} ${c.day}, cardio session` : `${at} ${c.day}, new slot`;
    return `- ${where} (${c.kind}): ${c.from ?? "—"} → ${c.to ?? "removed"} — ${c.detail}`;
  });
  return [
    "Apply exactly these changes to the previous draft and nothing else. Keep every other exercise, set, rep, RPE and rest value identical.",
    `Trainer request: ${message}`,
    "Changes:",
    ...lines,
    "Each change applies to that slot in every week with the same A/B letter (every week when the block does not alternate); keep each week's own loads and progression.",
    "Do not change: the block plan / phasing (weeks, targets, next block), the week letters, cardio sessions not listed, session names, kinds and types, or any slot not listed. Keep rep ranges, loads and set types exactly as they are.",
  ].join("\n");
}

/**
 * Sample session lead the generation prompt shows for rationale markdown. The
 * draft review routes a block or bullet opening with a session's bold name to
 * that session's "Why" panel, so the prompt and that parser share this one
 * example (a test holds them together).
 */
export const RATIONALE_SESSION_LEAD_EXAMPLE = "Lower — squat focus";
