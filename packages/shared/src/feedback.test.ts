import { describe, expect, test } from "bun:test";
import {
  feedbackFixPrompt,
  feedbackHandle,
  feedbackMarkdown,
  snapshotJson,
  toRepoPath,
  unpinnedContext,
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
  muted: false,
  agentCheck: null,
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
  test("unpinned tickets skip element details", () => {
    const env = { viewport: { width: 1280, height: 900, dpr: 1 }, userAgent: "Safari", appVersion: "0.1.2" };
    const ctx = unpinnedContext("", env);
    const out = feedbackMarkdown([item({ source: null, route: "", context: ctx, hasElementShot: false })], {
      imageUrl: () => null,
    });
    expect(out).toContain("not pinned to an element");
    expect(out).not.toContain("**Route:**");
    expect(out).not.toContain("**Source:**");
    expect(out).not.toContain("**Element:**");
    expect(out).not.toContain("Element HTML");
    const withPage = feedbackMarkdown([item({ context: unpinnedContext("/clients", env) })], { imageUrl: () => null });
    expect(withPage).toContain("- **Route:** `/clients`");
  });
  test("multi-line comments stay quoted", () => {
    const out = feedbackMarkdown([item({ comment: "line one\nline two" })], { imageUrl: () => null });
    expect(out).toContain("> line one\n> line two");
  });
});

describe("feedbackFixPrompt", () => {
  const check = {
    verdict: "ready" as const,
    summary: "Mute warm-up chips.",
    plan: ["Open SetChips.svelte", "Add a muted class for warm-ups"],
    questions: [],
    risk: "low" as const,
    model: "m",
    checkedAt: "2026-11-07T11:00:00.000Z",
    basis: "x",
    stale: false,
  };
  const url = (i: FeedbackItem, k: string) => `https://pt.example/v1/feedback/${i.id}/shot/${k}`;

  test("wraps the ticket in instructions, with the check's plan", () => {
    const p = feedbackFixPrompt(item({ agentCheck: check }), { imageUrl: url });
    expect(p.startsWith("Fix feedback ticket FB-014")).toBe(true);
    expect(p).toContain("outranks the comment");
    expect(p).toContain("1. Open SetChips.svelte\n2. Add a muted class for warm-ups");
    expect(p).toContain("## FB-014 · accepted");
    expect(p).toContain("https://pt.example/v1/feedback/u1/shot/element");
    expect(p).toContain("ask me to attach the image");
    expect(p).not.toContain("**Agent check:**");
  });

  test("lists open questions; leaves out a stale check and the screenshot note when there is none", () => {
    const asks = feedbackFixPrompt(
      item({ agentCheck: { ...check, verdict: "needs_info", plan: [], questions: ["Which chip?"] } }),
      { imageUrl: url },
    );
    expect(asks).toContain("stop and ask me instead of guessing:\n- Which chip?");

    const stale = feedbackFixPrompt(item({ agentCheck: { ...check, stale: true } }), { imageUrl: () => null });
    expect(stale).not.toContain("Suggested plan");
    expect(stale).not.toContain("attach the image");
  });
});
