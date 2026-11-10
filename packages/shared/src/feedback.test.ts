import { describe, expect, test } from "bun:test";
import {
  ticketBasis,
  feedbackHandle,
  feedbackMarkdown,
  ownedRouteRef,
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
  attachments: [{ id: "a-el", kind: "element", mime: "image/png", width: 30, height: 20, position: 0 }],
  reachable: true,
  shippedIn: null,
  thread: [],
  unread: false,
  muted: false,
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
    imageUrl: (i, a) => (a.kind === "element" ? `feedback/${feedbackHandle(i.number)}.png` : null),
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
  test("lists every image on the ticket and in the thread, by attachment id", () => {
    const img = (id: string, kind: "element" | "page" | "upload", position: number) =>
      ({ id, kind, mime: "image/webp", width: 10, height: 10, position });
    const reply = (id: string, attachments: ReturnType<typeof img>[]) => ({
      id, kind: "reply" as const, author: { id: "t2", name: "Ana", avatarUrl: null }, body: "See these", status: null,
      createdAt: "2026-11-08T00:00:00.000Z", authorKind: "human" as const, visibility: "public" as const, aiMeta: null, attachments,
    });
    const out = feedbackMarkdown(
      [
        item({
          attachments: [img("e", "element", 0), img("p", "page", 1), img("u1", "upload", 2), img("u2", "upload", 3)],
          thread: [reply("r1", [img("r1a", "upload", 0)]), reply("r2", [img("r2a", "upload", 0), img("r2b", "upload", 1)])],
        }),
      ],
      { imageUrl: (_, a) => `https://x/att/${a.id}` },
    );
    expect(out).toContain("- **Element screenshot:** ![FB-014 ticket element screenshot](https://x/att/e)");
    expect(out).toContain("- **Page screenshot (element outlined in red):** ![FB-014 ticket page screenshot](https://x/att/p)");
    expect(out).toContain("- **Image 1 of 2:** ![FB-014 ticket image 1 of 2](https://x/att/u1)");
    expect(out).toContain("- **Image 2 of 2:** ![FB-014 ticket image 2 of 2](https://x/att/u2)");
    expect(out).toContain("  - Image: ![FB-014 reply image](https://x/att/r1a)");
    expect(out).toContain("  - Image 2 of 2: ![FB-014 reply image 2 of 2](https://x/att/r2b)");
    // replies' images sit under their reply, after the ticket's
    expect(out.indexOf("att/r1a")).toBeGreaterThan(out.indexOf("See these"));
    expect(out.match(/!\[/g)).toHaveLength(7);
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
            { id: "c1", kind: "reply", author: { id: "t2", name: "Ana", avatarUrl: null }, body: "Which screen?\nThe log one?", status: null, createdAt: "2026-11-07T11:00:00.000Z", authorKind: "human" as const, visibility: "public" as const, aiMeta: null, attachments: [] },
            { id: "c2", kind: "status", author: { id: "t2", name: "Ana", avatarUrl: null }, body: null, status: "done", createdAt: "2026-11-08T09:00:00.000Z", authorKind: "human" as const, visibility: "public" as const, aiMeta: null, attachments: [] },
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
  test("labels AI entries and drafts; private notes stay out of the thread", () => {
    const meta = { verdict: "exists" as const, confidence: "high" as const, citations: [], basis: "b", model: null, runAt: "2026-11-09T00:00:00.000Z" };
    const ai = (id: string, visibility: "public" | "draft" | "private", body: string) => ({
      id, kind: "reply" as const, author: null, authorKind: "ai" as const, visibility, aiMeta: meta, body, status: null, attachments: [], createdAt: "2026-11-09T00:00:00.000Z",
    });
    const out = feedbackMarkdown([item({ thread: [ai("a", "public", "Sent"), ai("b", "draft", "Unsent"), ai("c", "private", "Note")] })], { imageUrl: () => null });
    expect(out).toContain("- **AI assistant** (2026-11-09): Sent");
    expect(out).toContain("- **AI assistant** _(unsent draft)_ (2026-11-09): Unsent");
    expect(out).not.toContain("Note");
  });
  describe("AI triage", () => {
    const at = (day: number) => `2026-11-0${day}T00:00:00.000Z`;
    const note = (id: string, basis: string, day: number, over: Record<string, unknown> = {}) => ({
      id, kind: "reply" as const, author: null, authorKind: "ai" as const, visibility: "private" as const, body: `Note ${id}`, status: null, attachments: [], createdAt: at(day),
      aiMeta: { verdict: "bug" as const, confidence: "medium" as const, citations: ["apps/web/src/lib/A.svelte:3"], basis, model: null, runAt: at(day), ...over },
    });
    const current = ticketBasis(item());

    test("shows the latest current note with its plan, risk and citations", () => {
      const out = feedbackMarkdown(
        [item({ thread: [note("old", current, 1), note("new", current, 2, { risk: "low", fixPlan: ["Open A.svelte", "Mute warm-up chips"] })] })],
        { imageUrl: () => null },
      );
      expect(out).toContain("- **AI triage (read the code, 2026-11-02):** bug · medium confidence · low risk");
      expect(out).toContain("  > Note new");
      expect(out).toContain("  - Fix plan:\n    1. Open A.svelte\n    2. Mute warm-up chips");
      expect(out).toContain("  - Citations: `apps/web/src/lib/A.svelte:3`");
      expect(out).not.toContain("Note old");
      expect(out).not.toContain("**Thread**");
    });

    test("skips notes for an older version of the ticket", () => {
      const out = feedbackMarkdown([item({ thread: [note("stale", "deadbeef", 1, { fixPlan: ["Stale step"] })] })], { imageUrl: () => null });
      expect(out).not.toContain("AI triage (");
      expect(out).not.toContain("Stale step");
      expect(out).not.toContain("Note stale");
    });

    test("leaves out risk and plan when the note has none", () => {
      const out = feedbackMarkdown([item({ thread: [note("n", current, 1, { verdict: "how_to" })] })], { imageUrl: () => null });
      expect(out).toContain("**AI triage (read the code, 2026-11-01):** how to · medium confidence\n");
      expect(out).not.toContain("Fix plan");
    });
  });
  test("names the reporter", () => {
    expect(md).toContain("- **Reported by:** Kai");
    const anon = feedbackMarkdown([item({ author: null })], { imageUrl: () => null });
    expect(anon).toContain("- **Reported by:** unknown");
  });
  test("unpinned tickets skip element details", () => {
    const env = { viewport: { width: 1280, height: 900, dpr: 1 }, userAgent: "Safari", appVersion: "0.1.2" };
    const ctx = unpinnedContext("", env);
    const out = feedbackMarkdown([item({ source: null, route: "", context: ctx, attachments: [] })], {
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

describe("ticketBasis", () => {
  const reply = (body: string, visibility: "public" | "draft" | "private" = "public") => ({ kind: "reply" as const, body, visibility });
  const base = { comment: "c", triageNote: null };

  test("changes with public replies", () => {
    expect(ticketBasis({ ...base, thread: [reply("a")] })).not.toBe(ticketBasis({ ...base, thread: [] }));
  });
  test("ignores drafts, private notes and status entries", () => {
    const plain = ticketBasis({ ...base, thread: [reply("a")] });
    const noisy = ticketBasis({
      ...base,
      thread: [reply("a"), reply("draft", "draft"), reply("note", "private"), { kind: "status" as const, body: null, visibility: "public" as const }],
    });
    expect(noisy).toBe(plain);
  });
});

describe("ticketBasis with images", () => {
  /** The function as it was before images counted — the basis every stored AI answer was recorded against. */
  function textOnlyBasis(i: { comment: string; triageNote: string | null; thread: { kind: string; body: string | null; visibility: string }[] }) {
    const replies = i.thread.filter((c) => c.kind === "reply" && (c.visibility ?? "public") === "public");
    const text = [i.comment, i.triageNote ?? "", ...replies.map((c) => c.body ?? "")].join("\u0000");
    let h = 0x811c9dc5;
    for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
  const img = (id: string, kind: "element" | "page" | "upload" = "upload") => ({ id, kind });
  const reply = (body: string, attachments: ReturnType<typeof img>[] = [], visibility: "public" | "draft" = "public") => ({
    kind: "reply" as const,
    body,
    visibility,
    attachments,
  });
  const base = { comment: "Rest timer is tiny", triageNote: "bigger digits" };

  test("a ticket without uploads keeps exactly the old hash, captured screenshots or not", () => {
    for (const t of [
      { ...base, thread: [] },
      { ...base, attachments: [img("e", "element"), img("p", "page")], thread: [reply("which screen?"), reply("log")] },
      { ...base, triageNote: null, attachments: [], thread: [reply("draft with image", [img("d")], "draft")] },
    ]) {
      expect(ticketBasis(t)).toBe(textOnlyBasis(t));
    }
    expect(ticketBasis(item())).toBe(textOnlyBasis(item()));
  });
  test("changes when uploads are added, removed or swapped, on the ticket or a public reply", () => {
    const plain = ticketBasis({ ...base, thread: [] });
    const one = ticketBasis({ ...base, attachments: [img("u1")], thread: [] });
    const other = ticketBasis({ ...base, attachments: [img("u2")], thread: [] });
    const onReply = ticketBasis({ ...base, thread: [reply("see", [img("u3")])] });
    expect(one).not.toBe(plain);
    expect(other).not.toBe(one);
    expect(onReply).not.toBe(ticketBasis({ ...base, thread: [reply("see")] }));
  });
  test("drafts' images don't count", () => {
    expect(ticketBasis({ ...base, thread: [reply("d", [img("u")], "draft")] })).toBe(ticketBasis({ ...base, thread: [reply("d", [], "draft")] }));
  });
});

describe("ownedRouteRef", () => {
  const env = { viewport: { width: 1, height: 1, dpr: 1 }, userAgent: "t", appVersion: "x" };
  const routed = (path: string, id: string | null, params: Record<string, string> = {}) => ({
    ...unpinnedContext(path, env),
    route: { path, id, params },
  });

  test("client and program pages name their record", () => {
    expect(ownedRouteRef(routed("/clients/c1/log", "/clients/[id]/log", { id: "c1" }))).toEqual({ kind: "client", id: "c1" });
    expect(ownedRouteRef(routed("/programs/p1", "/programs/[id]", { id: "p1" }))).toEqual({ kind: "program", id: "p1" });
  });

  test("pages without an owned record have none", () => {
    expect(ownedRouteRef(routed("/clients", "/clients"))).toBeNull();
    expect(ownedRouteRef(routed("/clients/new", "/clients/new"))).toBeNull();
    expect(ownedRouteRef(routed("/admin/clients/c1", "/admin/clients/[id]", { id: "c1" }))).toBeNull();
  });

  test("unpinned tickets fall back to the typed path", () => {
    expect(ownedRouteRef(unpinnedContext("/clients/c9/generate?x=1", env))).toEqual({ kind: "client", id: "c9" });
    expect(ownedRouteRef(unpinnedContext("/clients/new", env))).toBeNull();
    expect(ownedRouteRef(unpinnedContext("", env))).toBeNull();
  });
});
