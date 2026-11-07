import { describe, expect, test } from "bun:test";
import {
  feedbackHandle,
  feedbackMarkdown,
  snapshotJson,
  toRepoPath,
  type FeedbackItem,
} from "./feedback";

const item = (over: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id: "u1",
  number: 14,
  author: { id: "t1", name: "Kai", avatarUrl: null },
  status: "accepted",
  comment: "I can't tell which sets are warm-ups.",
  triageNote: "show warm-up sets with a muted chip",
  route: "/clients/c_31",
  source: "apps/web/src/lib/components/SetChips.svelte:12:4",
  context: {
    route: { path: "/clients/c_31", id: "/clients/[id]", params: { id: "c_31" } },
    target: {
      source: { file: "apps/web/src/lib/components/SetChips.svelte", line: 12, column: 4 },
      chain: [
        { type: "component", file: "apps/web/src/lib/components/SessionCard.svelte", line: 40, column: 6 },
      ],
      tag: "span",
      text: "4×8",
      html: '<span class="chip">4×8</span>',
      headings: ["Ann", "Week 3"],
      selector: "main > section > span.chip",
      rect: { x: 1, y: 2, width: 30, height: 20 },
    },
    pageData: { client: { name: "Ann" } },
    viewport: { width: 390, height: 844, dpr: 3 },
    userAgent: "Safari",
    appVersion: "d8cb841",
  },
  hasElementShot: true,
  hasPageShot: false,
  shippedIn: null,
  thread: [],
  unread: false,
  createdAt: "2026-11-07T10:00:00.000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
  ...over,
});

describe("toRepoPath", () => {
  test("vite-relative src path gets the web app prefix", () => {
    expect(toRepoPath("src/lib/components/A.svelte")).toBe("apps/web/src/lib/components/A.svelte");
  });
  test("absolute path is cut at apps/web", () => {
    expect(toRepoPath("/Users/x/repo/apps/web/src/routes/+page.svelte?v=1")).toBe(
      "apps/web/src/routes/+page.svelte",
    );
  });
  test("already repo-relative stays", () => {
    expect(toRepoPath("apps/web/src/a.svelte")).toBe("apps/web/src/a.svelte");
  });
});

describe("snapshotJson", () => {
  test("small values pass through", () => {
    expect(snapshotJson({ a: 1, d: new Date(0) })).toEqual({ a: 1, d: "1970-01-01T00:00:00.000Z" });
  });
  test("long arrays are capped with a count", () => {
    const out = snapshotJson(Array.from({ length: 25 }, (_, i) => i)) as unknown[];
    expect(out.length).toBe(21);
    expect(out[20]).toBe("[… 5 more]");
  });
  test("circular refs do not throw", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(snapshotJson(a)).toEqual({ self: "[circular]" });
  });
  test("oversized output collapses to a truncated string", () => {
    const big = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, "x".repeat(100)]));
    const out = snapshotJson(big, 500);
    expect(typeof out).toBe("string");
    expect(out as string).toContain("[truncated");
  });
  test("functions are dropped", () => {
    expect(snapshotJson({ f: () => 1, a: 1 })).toEqual({ a: 1 });
  });
});

describe("feedbackMarkdown", () => {
  const md = feedbackMarkdown([item()], {
    imageUrl: (i, kind) => (kind === "element" ? `feedback/${feedbackHandle(i.number)}.png` : null),
  });

  test("carries the handle, verbatim comment, source and chain", () => {
    expect(md).toContain("## FB-014 · accepted");
    expect(md).toContain("> I can't tell which sets are warm-ups.");
    expect(md).toContain("`apps/web/src/lib/components/SetChips.svelte:12:4`");
    expect(md).toContain("`apps/web/src/lib/components/SessionCard.svelte:40:6`");
    expect(md).toContain("390×844 @3x");
    expect(md).toContain('Under heading:** "Ann" › "Week 3"');
    expect(md).toContain("Triage note (owner):** show warm-up sets");
  });
  test("links only screenshots that exist", () => {
    expect(md).toContain("](feedback/FB-014.png)");
    expect(md).not.toContain("Page screenshot");
  });
  test("page data block only when there is data", () => {
    expect(md).toContain("Page data at click time");
    const empty = feedbackMarkdown([item({ context: { ...item().context, pageData: {} } })], { imageUrl: () => null });
    expect(empty).not.toContain("Page data at click time");
  });
  test("carries the thread and the shipped version", () => {
    const out = feedbackMarkdown(
      [
        item({
          shippedIn: "0.1.3",
          thread: [
            { id: "c1", kind: "reply", author: { id: "t2", name: "Ana", avatarUrl: null }, body: "Which screen?\nThe log one?", status: null, createdAt: "2026-11-07T11:00:00.000Z" },
            { id: "c2", kind: "status", author: { id: "t2", name: "Ana", avatarUrl: null }, body: null, status: "done", createdAt: "2026-11-08T09:00:00.000Z" },
          ],
        }),
      ],
      { imageUrl: () => null },
    );
    expect(out).toContain("- **Shipped in:** v0.1.3");
    expect(out).toContain("- **Ana** (2026-11-07): Which screen?\n  The log one?");
    expect(out).toContain("- _Ana marked it done (2026-11-08)_");
    expect(md).not.toContain("**Thread**");
  });
  test("names the reporter", () => {
    expect(md).toContain("- **Reported by:** Kai");
    const anon = feedbackMarkdown([item({ author: null })], { imageUrl: () => null });
    expect(anon).toContain("- **Reported by:** unknown");
  });
  test("multi-line comments stay quoted", () => {
    const out = feedbackMarkdown([item({ comment: "line one\nline two" })], { imageUrl: () => null });
    expect(out).toContain("> line one\n> line two");
  });
});
