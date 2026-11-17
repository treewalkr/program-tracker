import { describe, expect, mock, test } from "bun:test";
import { render } from "svelte/server";
import type { FeedbackComment } from "@pt/shared";

// The real client reads SvelteKit's $app/$env modules; rendering needs none of it.
mock.module("./client", () => ({ feedbackApi: {} }));
const { default: FixRating } = await import("./FixRating.svelte");

const note = (fixPublic: FeedbackComment["fixPublic"]): FeedbackComment => ({
  id: "n1",
  kind: "reply",
  author: null,
  authorKind: "system",
  visibility: "public",
  aiMeta: null,
  aiPublic: null,
  fixPublic,
  ship: { sha: "abc1234", version: "0.1.34" },
  silent: false,
  body: "Shipped in v0.1.34 — reload the app to get it.",
  status: null,
  attachments: [],
  createdAt: "2026-11-17T10:00:00.000Z",
});

describe("FixRating", () => {
  test("the reporter is asked: Fixed for you?", () => {
    const { body } = render(FixRating, { props: { itemId: "i1", note: note({ rating: null, canRate: true }) } });
    expect(body).toContain("Fixed for you?");
    expect(body).toContain('aria-label="Fixed"');
    expect(body).toContain('aria-label="Not fixed"');
  });

  test("anyone else sees the reporter's verdict, read-only", () => {
    const rating = { score: -1 as const, comment: "Still tiny", at: "2026-11-17T11:00:00.000Z" };
    const { body } = render(FixRating, { props: { itemId: "i1", note: note({ rating, canRate: false }), reporterName: "Kai" } });
    expect(body).toContain("says it isn't fixed");
    expect(body).toContain("Still tiny");
    expect(body).not.toContain("Fixed for you?");
  });

  test("nothing when there's no rating and the viewer can't rate", () => {
    const { body } = render(FixRating, { props: { itemId: "i1", note: note({ rating: null, canRate: false }) } });
    expect(body).not.toContain("thumb");
  });
});
