import {
  FEEDBACK_ANSWER_TAG_LABELS,
  type FeedbackAiConfidence,
  type FeedbackAiMode,
  type FeedbackAiRisk,
  type FeedbackAiVerdict,
  type FeedbackAnswerRating,
  type FeedbackItem,
} from "@pt/shared";

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

/** Risk of the AI's fix plan: low is the calm case, high the one to read twice. */
export const AI_RISK_LABEL: Record<FeedbackAiRisk, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export const AI_RISK_TONE: Record<FeedbackAiRisk, "good" | "warn" | "bad"> = {
  low: "good",
  medium: "warn",
  high: "bad",
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

/**
 * The confidence a reporter sees beside a sent AI answer. Only high and
 * medium: a low-confidence answer goes out only after the admin sent it,
 * and then the admin's judgement, not the AI's guess, stands behind it.
 */
export function publicConfidence(c: FeedbackAiConfidence): { label: string; tone: "good" | "warn" } | null {
  if (c === "low") return null;
  return { label: AI_CONFIDENCE_LABEL[c], tone: c === "high" ? "good" : "warn" };
}

/** "Wrong · Unclear · “It moved”" — a 👎's tags and comment in one quiet line. */
export function ratingSummary(r: FeedbackAnswerRating): string {
  return [...r.tags.map((t) => FEEDBACK_ANSWER_TAG_LABELS[t]), r.comment ? `“${r.comment}”` : null].filter(Boolean).join(" · ");
}

/** How reporters rated the sent AI answers on these tickets (latest rating per answer). */
export function aiAnswerTally(items: Pick<FeedbackItem, "thread">[]): { up: number; down: number; unrated: number } {
  const out = { up: 0, down: 0, unrated: 0 };
  for (const i of items) {
    for (const c of i.thread) {
      if (!c.aiPublic) continue;
      const s = c.aiPublic.rating?.score;
      if (s === 1) out.up++;
      else if (s === -1) out.down++;
      else out.unrated++;
    }
  }
  return out;
}
