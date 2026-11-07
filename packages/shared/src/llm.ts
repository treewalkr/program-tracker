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

export const LLM_SIGNALS = [...LLM_IMPLICIT_SIGNALS, ...LLM_EXPLICIT_SIGNALS] as const;
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
};

/** Days after approval during which program edits still count as feedback on the AI draft. */
export const PROGRAM_EDIT_FEEDBACK_DAYS = 14;

/** Dataset label derived from a call's feedback (see the llm_examples view). */
export const LLM_LABELS = ["gold", "silver", "negative", "unlabeled"] as const;
export type LlmLabel = (typeof LLM_LABELS)[number];
