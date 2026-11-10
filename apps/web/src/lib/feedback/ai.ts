import type { FeedbackAiConfidence, FeedbackAiMode, FeedbackAiVerdict } from "@pt/shared";

/** How the feedback AI's verdicts read in the thread (admin only). */
export const AI_VERDICT_LABEL: Record<FeedbackAiVerdict, string> = {
  exists: "Already exists",
  shipped: "Shipped since their build",
  how_to: "How-to",
  bug: "Bug",
  feature: "Feature request",
  unclear: "Unclear",
};

export const AI_CONFIDENCE_LABEL: Record<FeedbackAiConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export const AI_CONFIDENCE_TONE: Record<FeedbackAiConfidence, "good" | "warn" | "neutral"> = {
  high: "good",
  medium: "warn",
  low: "neutral",
};

/** Settings choices for the admin's AI answers switch. */
export const AI_MODE_OPTIONS: { value: FeedbackAiMode; label: string; help: string }[] = [
  { value: "off", label: "Off", help: "The agent doesn't answer tickets." },
  { value: "drafts", label: "Drafts only", help: "Every answer waits on the ticket for you to send, edit or discard." },
  {
    value: "auto",
    label: "Auto-send confident",
    help: "Answers it verified in the code (already exists, shipped, how-to) go to the reporter; the rest wait as drafts.",
  },
];
