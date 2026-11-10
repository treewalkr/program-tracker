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

/**
 * The nearest stable attribute on the clicked element or one of its close
 * ancestors (`id`, a `data-*` attribute, `aria-label` or `name`), unique on
 * the page at capture time. `depth` is how many levels above the element it
 * sits (0 = the element itself). Survives production builds, which carry no
 * Svelte source metadata.
 */
export interface FeedbackAnchor {
  attr: string;
  value: string;
  depth: number;
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
    /** Stable attribute anchor; absent on tickets filed before it was recorded. */
    anchor?: FeedbackAnchor | null;
    rect: { x: number; y: number; width: number; height: number };
  };
  /** Snapshot of SvelteKit `page.data` (truncated JSON) — the data the page rendered. */
  pageData: unknown;
  viewport: { width: number; height: number; dpr: number };
  userAgent: string;
  /** Git SHA the UI was built from. */
  appVersion: string;
}

/**
 * Filed from the Feedback page's composer rather than by clicking an element:
 * the target is empty and the route (if any) is what the reporter typed.
 */
export const isPinned = (c: FeedbackContext): boolean => c.target.selector !== "";

/** Context for a ticket written on the Feedback page, not pinned to an element. */
export function unpinnedContext(
  path: string,
  env: { viewport: FeedbackContext["viewport"]; userAgent: string; appVersion: string },
): FeedbackContext {
  return {
    route: { path, id: null, params: {} },
    target: {
      source: null,
      chain: [],
      tag: "",
      text: "",
      html: "",
      headings: [],
      selector: "",
      rect: { x: 0, y: 0, width: 0, height: 0 },
    },
    pageData: null,
    ...env,
  };
}

/** Pages under these route prefixes 404 for a trainer who doesn't own the record. */
const OWNED_ROUTES = [
  { kind: "client", routeId: "/clients/[id]", path: /^\/clients\/([^/?#]+)/ },
  { kind: "program", routeId: "/programs/[id]", path: /^\/programs\/([^/?#]+)/ },
] as const;

/** The trainer-owned record a ticket's page is about, if any (e.g. the client on `/clients/<id>/log`). */
export function ownedRouteRef(c: FeedbackContext): { kind: "client" | "program"; id: string } | null {
  for (const r of OWNED_ROUTES) {
    if (c.route.id) {
      if (c.route.id.startsWith(r.routeId) && c.route.params.id) return { kind: r.kind, id: c.route.params.id };
      continue;
    }
    // Unpinned tickets carry only the path the reporter typed.
    const m = r.path.exec(c.route.path);
    if (m && m[1] !== "new") return { kind: r.kind, id: m[1] };
  }
  return null;
}

/** The trainer who filed an item (or wrote a reply). */
export interface FeedbackAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The feedback auto-reply agent's call on a ticket: it already exists, it
 * shipped after the reporter's build, here's how to do it — or it's a real
 * bug / feature request / unclear and a person should look.
 */
export const FEEDBACK_AI_VERDICTS = ["exists", "shipped", "how_to", "bug", "feature", "unclear"] as const;
export type FeedbackAiVerdict = (typeof FEEDBACK_AI_VERDICTS)[number];
/** Verdicts an AI answer may go out on by itself (auto mode, high confidence). */
export const FEEDBACK_AI_AUTO_VERDICTS: readonly FeedbackAiVerdict[] = ["exists", "shipped", "how_to"];

export const FEEDBACK_AI_CONFIDENCE = ["high", "medium", "low"] as const;
export type FeedbackAiConfidence = (typeof FEEDBACK_AI_CONFIDENCE)[number];

/** How likely the fix is to break something or miss the point. */
export const FEEDBACK_AI_RISKS = ["low", "medium", "high"] as const;
export type FeedbackAiRisk = (typeof FEEDBACK_AI_RISKS)[number];
/** Caps on an AI fix plan: steps, and characters per step. */
export const FEEDBACK_FIX_PLAN_MAX_STEPS = 8;
export const FEEDBACK_FIX_PLAN_STEP_MAX = 300;

/** The admin's switch: no AI answers, drafts for review only, or send confident ones. */
export const FEEDBACK_AI_MODES = ["off", "drafts", "auto"] as const;
export type FeedbackAiMode = (typeof FEEDBACK_AI_MODES)[number];
export const DEFAULT_FEEDBACK_AI_MODE: FeedbackAiMode = "drafts";

/** Who wrote a thread entry: a person, or the auto-reply agent. */
export type FeedbackAuthorKind = "human" | "ai";
/** public = everyone on the ticket; draft = an unsent AI reply; private = an AI triage note. Drafts and private notes are admin-only. */
export type FeedbackVisibility = "public" | "draft" | "private";

/** What the agent recorded alongside an AI reply or note. */
export interface FeedbackAiMeta {
  verdict: FeedbackAiVerdict;
  confidence: FeedbackAiConfidence;
  /** `file:line` references backing the verdict. */
  citations: string[];
  /** `bug` / `feature` only: concrete steps for the coding agent, naming the files to change. */
  fixPlan?: string[];
  /** `bug` / `feature` only: how risky the fix is. */
  risk?: FeedbackAiRisk;
  /** `ticketBasis` of the ticket the agent answered. */
  basis: string;
  model: string | null;
  runAt: string;
}

/** Display name for AI-written entries (they have no trainer author). */
export const FEEDBACK_AI_AUTHOR_NAME = "AI assistant";

/** One thread entry: a reply, or a status change made by `author`. */
export interface FeedbackComment {
  id: string;
  kind: "reply" | "status";
  /** Null for AI entries and deleted trainers. */
  author: FeedbackAuthor | null;
  authorKind: FeedbackAuthorKind;
  /** Non-admins only ever see `public`. */
  visibility: FeedbackVisibility;
  /** AI entries, admin only; null otherwise. */
  aiMeta: FeedbackAiMeta | null;
  /** Reply text; null for status entries. */
  body: string | null;
  /** Status moved to; null for replies. */
  status: FeedbackStatus | null;
  createdAt: string;
}

/**
 * Fingerprint of what an AI answer depends on: the comment, the triage note
 * and the public replies. When any changes, an answer recorded for the old
 * basis is stale. Drafts and private notes don't count — the same basis
 * whoever computes it.
 */
export function ticketBasis(
  item: Pick<FeedbackItem, "comment" | "triageNote"> & { thread: Pick<FeedbackComment, "kind" | "body" | "visibility">[] },
): string {
  const replies = item.thread.filter((c) => c.kind === "reply" && (c.visibility ?? "public") === "public");
  const text = [item.comment, item.triageNote ?? "", ...replies.map((c) => c.body ?? "")]
    .join("\u0000");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
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
  /** The caller muted emails about it. */
  muted: boolean;
  /**
   * The caller can open the ticket's page: false when it belongs to a client
   * or program they don't own (the page would 404), so "Show me" shows the
   * screenshot instead.
   */
  reachable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Which feedback emails reach a person, under the `feedback_emails` master switch. */
export const FEEDBACK_REPLY_SCOPES = ["all", "mine", "off"] as const;
export type FeedbackReplyScope = (typeof FEEDBACK_REPLY_SCOPES)[number];

export interface FeedbackEmailPrefs {
  /** New tickets from trainers (only the admin is ever sent these). */
  newTickets: boolean;
  /** "all" = every ticket you can see; "mine" = tickets you filed, replied on or moved; "off" = none. */
  replies: FeedbackReplyScope;
  /** Accepted / won't fix / shipped on tickets you filed. */
  status: boolean;
}

export const DEFAULT_FEEDBACK_EMAIL_PREFS: FeedbackEmailPrefs = { newTickets: true, replies: "all", status: true };

/** A stored prefs blob (possibly partial or stale) → full prefs. */
export function feedbackEmailPrefs(raw: Partial<FeedbackEmailPrefs> | null | undefined): FeedbackEmailPrefs {
  const p = raw ?? {};
  return {
    newTickets: typeof p.newTickets === "boolean" ? p.newTickets : DEFAULT_FEEDBACK_EMAIL_PREFS.newTickets,
    replies: FEEDBACK_REPLY_SCOPES.includes(p.replies as FeedbackReplyScope)
      ? (p.replies as FeedbackReplyScope)
      : DEFAULT_FEEDBACK_EMAIL_PREFS.replies,
    status: typeof p.status === "boolean" ? p.status : DEFAULT_FEEDBACK_EMAIL_PREFS.status,
  };
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
  const pinned = isPinned(c);
  if (!pinned) lines.push("- **Filed as:** a general ticket from the Feedback page — not pinned to an element");
  if (c.route.path) lines.push(`- **Route:** \`${c.route.path}\`${c.route.id ? ` (route \`${c.route.id}\`)` : ""}`);
  const params = Object.entries(c.route.params);
  if (params.length) lines.push(`- **Params:** ${params.map(([k, v]) => `${k}=\`${v}\``).join(", ")}`);
  if (pinned) lines.push(`- **Source:** ${item.source ? `\`${item.source}\`` : "unknown (no dev metadata)"}`);
  if (c.target.chain.length) {
    lines.push(
      `- **Rendered via:** ${c.target.chain.map((e) => `\`${formatSourceLoc(e)}\``).join(" ← ")}`,
    );
  }
  if (pinned) lines.push(`- **Element:** \`<${c.target.tag}>\` · selector \`${c.target.selector}\``);
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
      const who = c.authorKind === "ai" ? FEEDBACK_AI_AUTHOR_NAME : (c.author?.name ?? "unknown");
      const tag = c.visibility === "draft" ? " _(unsent draft)_" : c.visibility === "private" ? " _(private note)_" : "";
      lines.push(
        c.kind === "status"
          ? `- _${who} marked it ${c.status} (${c.createdAt.slice(0, 10)})_`
          : `- **${who}**${tag} (${c.createdAt.slice(0, 10)}): ${(c.body ?? "").trim().split("\n").join("\n  ")}`,
      );
    }
  }
  if (pinned) {
    lines.push("");
    lines.push("<details><summary>Element HTML</summary>");
    lines.push("");
    lines.push(fence("html", c.target.html));
    lines.push("");
    lines.push("</details>");
  }
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
