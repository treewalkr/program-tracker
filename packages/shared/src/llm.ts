/**
 * LLM interaction log vocabulary (docs/llm-logging-plan.md). One source of
 * truth for the API (writes), the web (thumbs UI) and the export script.
 */

/** What a provider call was for — the dataset split key. */
export const LLM_PURPOSES = [
  "block_generate",
  "week_generate",
  "revision",
  "week_revision",
  "proposal_turn",
  "chat_qa",
  "client_message",
  "distill",
  "feedback_check",
  "rule_extract",
] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

export const LLM_CALL_STATUSES = ["ok", "provider_error", "parse_error", "validation_error", "aborted"] as const;
export type LlmCallStatus = (typeof LLM_CALL_STATUSES)[number];

/** What a verdict judges. */
export const LLM_SUBJECT_KINDS = ["call", "chat_message", "generation", "client_message"] as const;
export type LlmSubjectKind = (typeof LLM_SUBJECT_KINDS)[number];

/** Fixed reason vocabulary for thumbs-down (and optional on thumbs-up). */
export const LLM_REASON_TAGS = [
  "ignored_limitation",
  "wrong_exercise",
  "volume_off",
  "load_off",
  "invented_number",
  "off_topic",
  "tone",
  "too_long",
  "format",
] as const;
export type LlmReasonTag = (typeof LLM_REASON_TAGS)[number];

/** Short chip labels, trainer-facing. */
export const LLM_REASON_LABELS: Record<LlmReasonTag, string> = {
  ignored_limitation: "Ignored a limitation",
  wrong_exercise: "Wrong exercise",
  volume_off: "Volume off",
  load_off: "Load off",
  invented_number: "Made up a number",
  off_topic: "Off topic",
  tone: "Tone",
  too_long: "Too long",
  format: "Format",
};

/** Implicit signals recorded by the API as a side effect of existing actions. */
export const LLM_IMPLICIT_SIGNALS = [
  "draft_approved_unedited",
  "draft_approved_edited",
  "draft_rejected",
  "draft_revised",
  "draft_regenerated",
  "program_edited_after_approval",
  "proposal_built",
  "proposal_adjusted",
  "proposal_ignored",
  "client_message_approved",
  "client_message_rejected",
  "client_message_copied",
  "chat_cleared",
] as const;

/** Explicit trainer verdicts. */
export const LLM_EXPLICIT_SIGNALS = ["thumbs_up", "thumbs_down"] as const;

/** An anchored note: critique pinned to one part of an output (§10). */
export const LLM_NOTE_SIGNAL = "note" as const;

export const LLM_SIGNALS = [...LLM_IMPLICIT_SIGNALS, ...LLM_EXPLICIT_SIGNALS, LLM_NOTE_SIGNAL] as const;
export type LlmSignal = (typeof LLM_SIGNALS)[number];

/** Signals the web may send through POST /v1/ai/feedback (the rest happen server-side). */
export const LLM_CLIENT_SIGNALS = ["thumbs_up", "thumbs_down", "proposal_adjusted", "client_message_copied"] as const;
export type LlmClientSignal = (typeof LLM_CLIENT_SIGNALS)[number];

/** −1 / 0 / +1 label per signal; null = marker only (no label). */
export const LLM_SIGNAL_SCORE: Record<LlmSignal, -1 | 0 | 1 | null> = {
  draft_approved_unedited: 1,
  draft_approved_edited: 0,
  draft_rejected: -1,
  draft_revised: 0,
  draft_regenerated: -1,
  program_edited_after_approval: 0,
  proposal_built: 1,
  proposal_adjusted: 0,
  proposal_ignored: -1,
  client_message_approved: 1,
  client_message_rejected: -1,
  client_message_copied: 1,
  chat_cleared: null,
  thumbs_up: 1,
  thumbs_down: -1,
  note: 0,
};

/** Days after approval during which program edits still count as feedback on the AI draft. */
export const PROGRAM_EDIT_FEEDBACK_DAYS = 14;

/** Dataset label derived from a call's feedback (see the llm_examples view). */
export const LLM_LABELS = ["gold", "silver", "negative", "unlabeled"] as const;
export type LlmLabel = (typeof LLM_LABELS)[number];

// ---------------------------------------------------------------------------
// Detailed feedback + coaching rules (docs/llm-logging-plan.md §10)
// ---------------------------------------------------------------------------

/** Whether a note should apply again: only this output, this client, or every client. */
export const NOTE_SCOPES = ["once", "client", "always"] as const;
export type NoteScope = (typeof NOTE_SCOPES)[number];

export const NOTE_SCOPE_LABELS: Record<NoteScope, string> = {
  once: "Just this once",
  client: "This client",
  always: "All clients",
};

/** Where a note points: one exercise (or session) of a draft, or a quote in a reply. */
export type NoteAnchor =
  | {
      type: "slot";
      week?: number | null;
      /** Session name as shown ("Day A — Lower"). */
      session: string;
      /** 0-based position of the session in the draft. */
      sessionIndex: number;
      /** 0-based exercise position; absent = the whole session. */
      exerciseIndex?: number | null;
      exerciseId?: string | null;
      exerciseName?: string | null;
      setIndex?: number | null;
    }
  | { type: "text"; quote: string; start: number; end: number };

/** Plain-text pointer for prompts, exports and the UI ("Week 2 · Day A — Lower · #2 Back Squat"). */
export function anchorText(anchor: NoteAnchor | null | undefined): string {
  if (!anchor) return "the whole output";
  if (anchor.type === "text") {
    const q = anchor.quote.replace(/\s+/g, " ").trim();
    return `“${q.length > 160 ? `${q.slice(0, 157)}…` : q}”`;
  }
  const parts = [
    anchor.week ? `Week ${anchor.week}` : null,
    `Session ${anchor.sessionIndex + 1} (${anchor.session})`,
    anchor.exerciseIndex != null
      ? `exercise #${anchor.exerciseIndex + 1}${anchor.exerciseName ? ` ${anchor.exerciseName}` : ""}`
      : null,
    anchor.setIndex != null ? `set ${anchor.setIndex + 1}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** A note as a revision request — what "Apply to this draft" sends down the revision path. */
export function noteRevisionText(note: { anchor: NoteAnchor | null; comment: string | null; correction: string | null }): string {
  return [
    `Change ${anchorText(note.anchor)}.`,
    note.comment ? `Trainer's note: ${note.comment}` : null,
    note.correction ? `Do this instead: ${note.correction}` : null,
    "Leave everything else as it is.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Rule categories: the reason vocabulary plus a catch-all for style. */
export const COACHING_RULE_CATEGORIES = [...LLM_REASON_TAGS, "style"] as const;
export type CoachingRuleCategory = (typeof COACHING_RULE_CATEGORIES)[number];

export const COACHING_RULE_CATEGORY_LABELS: Record<CoachingRuleCategory, string> = {
  ...LLM_REASON_LABELS,
  style: "Style",
};

/** proposed → (trainer confirms) → active → (trainer retires) → retired. Only active rules reach a prompt. */
export const COACHING_RULE_STATUSES = ["proposed", "active", "retired"] as const;
export type CoachingRuleStatus = (typeof COACHING_RULE_STATUSES)[number];

export const COACHING_RULE_SOURCES = ["note", "chat", "manual"] as const;
export type CoachingRuleSource = (typeof COACHING_RULE_SOURCES)[number];

/** Prompt cap: client rules first, then newest. */
export const COACHING_RULES_PROMPT_LIMIT = 30;

/** What the rule_extract call returns. */
export interface ExtractedRule {
  rule: string;
  category: CoachingRuleCategory;
  appliesTo: "client" | "always";
}

/**
 * Deterministic stand-in for the rule_extract call (mock provider, demo mode):
 * the correction becomes the rule, the critique its reason.
 */
export function mockExtractRule(input: {
  anchor: NoteAnchor | null;
  comment: string | null;
  correction: string | null;
  scope: "client" | "always";
  reasonTags?: readonly string[];
}): ExtractedRule {
  const what = input.anchor?.type === "slot" && input.anchor.exerciseName ? input.anchor.exerciseName : null;
  const comment = input.comment?.trim().replace(/[.\s]+$/, "") || null;
  const correction = input.correction?.trim().replace(/[.\s]+$/, "") || null;
  const rule = correction
    ? `${what ? `Instead of ${what}: ` : "Prefer: "}${correction}${comment ? ` (${comment.toLowerCase()})` : ""}.`
    : `${what ? `${what}: ` : ""}${comment ?? "Follow the trainer's note"}.`;
  const tag = input.reasonTags?.find((t): t is LlmReasonTag => (LLM_REASON_TAGS as readonly string[]).includes(t));
  return {
    rule: rule.slice(0, 280),
    category: tag ?? (what ? "wrong_exercise" : "style"),
    appliesTo: input.scope,
  };
}
