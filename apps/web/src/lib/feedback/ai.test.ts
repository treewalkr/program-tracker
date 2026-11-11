import { describe, expect, test } from "bun:test";
import type { FeedbackAnswerRating, FeedbackComment } from "@pt/shared";
import { aiAnswerTally, publicConfidence, ratingSummary } from "./ai";

const at = "2026-11-10T10:00:00.000Z";
const rating = (score: 1 | -1, over: Partial<FeedbackAnswerRating> = {}): FeedbackAnswerRating => ({ score, tags: [], comment: null, at, ...over });
const answer = (r: FeedbackAnswerRating | null) =>
  ({ aiPublic: { confidence: "high", rating: r, canRate: false } }) as unknown as FeedbackComment;
const human = { aiPublic: null } as unknown as FeedbackComment;

describe("publicConfidence", () => {
  test("high reads good, medium warn, low isn't shown", () => {
    expect(publicConfidence("high")).toEqual({ label: "High confidence", tone: "good" });
    expect(publicConfidence("medium")).toEqual({ label: "Medium confidence", tone: "warn" });
    expect(publicConfidence("low")).toBeNull();
  });
});

describe("ratingSummary", () => {
  test("tags by label, then the comment in quotes", () => {
    expect(ratingSummary(rating(-1, { tags: ["wrong", "missed_question"], comment: "It moved" }))).toBe(
      "Wrong · Didn't answer my question · “It moved”",
    );
    expect(ratingSummary(rating(-1))).toBe("");
  });
});

describe("aiAnswerTally", () => {
  test("counts each sent answer's latest rating across tickets; other entries don't count", () => {
    const items = [
      { thread: [answer(rating(1)), human, answer(rating(-1))] },
      { thread: [answer(null), answer(rating(1))] },
      { thread: [] },
    ];
    expect(aiAnswerTally(items)).toEqual({ up: 2, down: 1, unrated: 1 });
    expect(aiAnswerTally([])).toEqual({ up: 0, down: 0, unrated: 0 });
  });
});
