import type { FeedbackStatus } from "@pt/shared";

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  accepted: "Accepted",
  done: "Done",
  wontfix: "Won't fix",
};

export const STATUS_TONE: Record<FeedbackStatus, "good" | "warn" | "bad" | "neutral"> = {
  new: "warn",
  accepted: "good",
  done: "neutral",
  wontfix: "neutral",
};
