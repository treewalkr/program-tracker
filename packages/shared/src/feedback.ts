/**
 * Feedback mode — a trainer clicks any element in the app and leaves a note
 * tied to it. Each item is self-contained: a coding agent must be able to act
 * on it from the export alone, without follow-up questions.
 */

export const FEEDBACK_STATUSES = ["new", "accepted", "done", "wontfix"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** A source position, repo-relative (e.g. `apps/web/src/lib/components/SessionCard.svelte`). */
export interface FeedbackSourceLoc {
  file: string;
  line: number;
  column: number;
}

/** One hop up the render tree: where the enclosing component/block was rendered. */
export interface FeedbackChainEntry extends FeedbackSourceLoc {
  type: string;
}

export interface FeedbackContext {
  route: {
    /** URL path + query at click time, e.g. `/clients/c_31/programs/new`. */
    path: string;
    /** SvelteKit route id, e.g. `/clients/[id]/programs/new`. */
    id: string | null;
    params: Record<string, string>;
  };
  target: {
    /** Exact element source position; null when the build has no dev metadata. */
    source: FeedbackSourceLoc | null;
    /** Render chain, innermost first. */
    chain: FeedbackChainEntry[];
    tag: string;
    /** Visible text of the element, trimmed. */
    text: string;
    /** outerHTML, truncated. */
    html: string;
    /** Nearest headings above the element, outermost first (page title → panel title). */
    headings: string[];
    /** CSS selector path from the nearest id/landmark. */
    selector: string;
    rect: { x: number; y: number; width: number; height: number };
  };
  /** Snapshot of SvelteKit `page.data` (truncated JSON) — the data the page rendered. */
  pageData: unknown;
  viewport: { width: number; height: number; dpr: number };
  userAgent: string;
  /** Git SHA the UI was built from. */
  appVersion: string;
}

/** The trainer who filed an item (or wrote a reply). */
export interface FeedbackAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** One thread entry: a reply, or a status change made by `author`. */
export interface FeedbackComment {
  id: string;
  kind: "reply" | "status";
  author: FeedbackAuthor | null;
  /** Reply text; null for status entries. */
  body: string | null;
  /** Status moved to; null for replies. */
  status: FeedbackStatus | null;
  createdAt: string;
}

export interface FeedbackItem {
  id: string;
  /** Human handle: FB-<number>. */
  number: number;
  /** Who filed it; null for items filed before authorship was recorded. */
  author: FeedbackAuthor | null;
  status: FeedbackStatus;
  comment: string;
  triageNote: string | null;
  route: string;
  /** `file:line:column` of the clicked element, or null. */
  source: string | null;
  context: FeedbackContext;
  hasElementShot: boolean;
  hasPageShot: boolean;
  /** App version live when it was marked done (e.g. `0.1.3`); null otherwise. */
  shippedIn: string | null;
  /** Replies and status changes, oldest first. */
  thread: FeedbackComment[];
  /** Someone else did something on it since the caller last looked. */
  unread: boolean;
  createdAt: string;
  updatedAt: string;
}

export const feedbackHandle = (n: number) => `FB-${String(n).padStart(3, "0")}`;

export const formatSourceLoc = (loc: FeedbackSourceLoc) => `${loc.file}:${loc.line}:${loc.column}`;

/**
 * Repo-relative path for a Svelte dev `loc.file`. Vite reports paths relative
 * to the web app root (`src/...`) or absolute; agents need repo-relative.
 */
export function toRepoPath(file: string): string {
  const norm = file.replace(/\\/g, "/").split("?")[0];
  const at = norm.lastIndexOf("/apps/web/");
  if (at >= 0) return norm.slice(at + 1);
  if (norm.startsWith("apps/")) return norm;
  if (norm.startsWith("src/")) return `apps/web/${norm}`;
  if (norm.startsWith("/src/")) return `apps/web${norm}`;
  return norm;
}

/**
 * JSON-safe snapshot capped at `maxChars`. Oversized arrays/strings are cut
 * first; if still too big the whole value collapses to a truncated string.
 */
export function snapshotJson(value: unknown, maxChars = 8000): unknown {
  const seen = new WeakSet<object>();
  const prune = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "string") return v.length > 400 ? `${v.slice(0, 400)}…` : v;
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v !== "object") return undefined;
    if (seen.has(v)) return "[circular]";
    if (depth > 6) return "[…]";
    seen.add(v);
    if (Array.isArray(v)) {
      const head = v.slice(0, 20).map((x) => prune(x, depth + 1));
      return v.length > 20 ? [...head, `[… ${v.length - 20} more]`] : head;
    }
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => [k, prune(x, depth + 1)] as const)
        .filter(([, x]) => x !== undefined),
    );
  };
  const pruned = prune(value, 0);
  const json = JSON.stringify(pruned) ?? "null";
  if (json.length <= maxChars) return pruned;
  return `${json.slice(0, maxChars)}… [truncated ${json.length - maxChars} chars]`;
}

export interface FeedbackMarkdownOptions {
  /** Link target for an item's screenshot; null when the shot is missing. */
  imageUrl: (item: FeedbackItem, kind: "element" | "page") => string | null;
  title?: string;
}

const fence = (lang: string, body: string) => {
  const ticks = body.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${body}\n${ticks}`;
};

/** One item as a self-contained Markdown section. */
export function feedbackItemMarkdown(item: FeedbackItem, opts: FeedbackMarkdownOptions): string {
  const c = item.context;
  const lines: string[] = [];
  lines.push(`## ${feedbackHandle(item.number)} · ${item.status}`);
  lines.push("");
  lines.push(`> ${item.comment.trim().split("\n").join("\n> ")}`);
  lines.push("");
  lines.push(`- **Route:** \`${c.route.path}\`${c.route.id ? ` (route \`${c.route.id}\`)` : ""}`);
  const params = Object.entries(c.route.params);
  if (params.length) lines.push(`- **Params:** ${params.map(([k, v]) => `${k}=\`${v}\``).join(", ")}`);
  lines.push(`- **Source:** ${item.source ? `\`${item.source}\`` : "unknown (no dev metadata)"}`);
  if (c.target.chain.length) {
    lines.push(
      `- **Rendered via:** ${c.target.chain.map((e) => `\`${formatSourceLoc(e)}\``).join(" ← ")}`,
    );
  }
  lines.push(`- **Element:** \`<${c.target.tag}>\` · selector \`${c.target.selector}\``);
  if (c.target.headings.length) lines.push(`- **Under heading:** ${c.target.headings.map((h) => `"${h}"`).join(" › ")}`);
  if (c.target.text) lines.push(`- **Visible text:** "${c.target.text}"`);
  lines.push(
    `- **Viewport:** ${c.viewport.width}×${c.viewport.height} @${c.viewport.dpr}x · ${c.userAgent}`,
  );
  lines.push(`- **Reported by:** ${item.author?.name ?? "unknown"}`);
  lines.push(`- **Build:** \`${c.appVersion}\` · reported ${item.createdAt}`);
  if (item.triageNote) lines.push(`- **Triage note (owner):** ${item.triageNote}`);
  if (item.shippedIn) lines.push(`- **Shipped in:** v${item.shippedIn}`);
  const el = opts.imageUrl(item, "element");
  const pg = opts.imageUrl(item, "page");
  if (el) lines.push(`- **Element screenshot:** ![${feedbackHandle(item.number)} element](${el})`);
  if (pg) lines.push(`- **Page screenshot (element outlined in red):** ![${feedbackHandle(item.number)} page](${pg})`);
  if (item.thread.length) {
    lines.push("");
    lines.push("**Thread** (oldest first — clarifications from the reporter and the owner):");
    lines.push("");
    for (const c of item.thread) {
      const who = c.author?.name ?? "unknown";
      lines.push(
        c.kind === "status"
          ? `- _${who} marked it ${c.status} (${c.createdAt.slice(0, 10)})_`
          : `- **${who}** (${c.createdAt.slice(0, 10)}): ${(c.body ?? "").trim().split("\n").join("\n  ")}`,
      );
    }
  }
  lines.push("");
  lines.push("<details><summary>Element HTML</summary>");
  lines.push("");
  lines.push(fence("html", c.target.html));
  lines.push("");
  lines.push("</details>");
  const hasData =
    c.pageData !== null &&
    c.pageData !== undefined &&
    !(typeof c.pageData === "object" && Object.keys(c.pageData as object).length === 0);
  if (hasData) {
    lines.push("");
    lines.push("<details><summary>Page data at click time</summary>");
    lines.push("");
    lines.push(fence("json", JSON.stringify(c.pageData, null, 2)));
    lines.push("");
    lines.push("</details>");
  }
  return lines.join("\n");
}

/** Whole export: a short preamble telling the agent how to read it, then each item. */
export function feedbackMarkdown(items: FeedbackItem[], opts: FeedbackMarkdownOptions): string {
  const head = [
    `# ${opts.title ?? "Trainer feedback"}`,
    "",
    `${items.length} item${items.length === 1 ? "" : "s"}. Each item is a comment the trainer left on one UI element.`,
    "The quoted text is the trainer's words, verbatim. **Source** is the exact element in the repo;",
    "**Rendered via** lists the enclosing components, innermost first. A **Triage note** is the",
    "owner's decision and outranks the comment when they differ.",
  ];
  return [...head, "", ...items.map((i) => `${feedbackItemMarkdown(i, opts)}\n`)].join("\n");
}
