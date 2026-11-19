/**
 * Feedback mode — a trainer clicks any element in the app and leaves a note
 * tied to it. Each item is self-contained: a coding agent must be able to act
 * on it from the export alone, without follow-up questions.
 */

import { z } from "zod";
import { redactJson } from "./redact";

export const FEEDBACK_STATUSES = ["new", "accepted", "in_progress", "done", "wontfix"] as const;
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

/**
 * What a ticket is, picked by the reporter when filing: something broken, the
 * app doing the wrong thing, an idea, or a question. Null on older tickets.
 */
export const FEEDBACK_KINDS = ["bug", "behaviour", "idea", "question"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Bug",
  behaviour: "Wrong behaviour",
  idea: "Idea",
  question: "Question",
};
/** Kinds that ask for expected / actual / how often. */
export const FEEDBACK_REPORT_KINDS: readonly FeedbackKind[] = ["bug", "behaviour"];
export const hasReportFields = (kind: FeedbackKind | null | undefined): boolean =>
  !!kind && FEEDBACK_REPORT_KINDS.includes(kind);

export const FEEDBACK_REPEATS = ["always", "sometimes", "once"] as const;
export type FeedbackRepeat = (typeof FEEDBACK_REPEATS)[number];
export const FEEDBACK_REPEAT_LABELS: Record<FeedbackRepeat, string> = {
  always: "Every time",
  sometimes: "Sometimes",
  once: "Once so far",
};
export const FEEDBACK_REPORT_TEXT_MAX = 1000;

/** Bug and wrong-behaviour tickets: what the reporter expected, what happened, how often. All optional. */
export const FeedbackReportSchema = z.object({
  expected: z.string().max(FEEDBACK_REPORT_TEXT_MAX).optional(),
  actual: z.string().max(FEEDBACK_REPORT_TEXT_MAX).optional(),
  repeat: z.enum(FEEDBACK_REPEATS).optional(),
});
export type FeedbackReport = z.infer<typeof FeedbackReportSchema>;

/** Shorter than this, a bug with no "expected" gets one nudge before it is sent. */
export const FEEDBACK_THIN_TICKET_CHARS = 30;
/** A bug report too thin to act on: no expected text and a short comment. The composer asks once. */
export const isThinTicket = (kind: FeedbackKind | null, comment: string, report?: FeedbackReport): boolean =>
  kind === "bug" && !report?.expected?.trim() && comment.trim().length < FEEDBACK_THIN_TICKET_CHARS;

/** The report with blank fields dropped; undefined when nothing is left (or the kind takes none). */
export function cleanReport(kind: FeedbackKind | null, report: FeedbackReport | undefined): FeedbackReport | undefined {
  if (!hasReportFields(kind) || !report) return undefined;
  const out: FeedbackReport = {};
  if (report.expected?.trim()) out.expected = report.expected.trim();
  if (report.actual?.trim()) out.actual = report.actual.trim();
  if (report.repeat) out.repeat = report.repeat;
  return Object.keys(out).length ? out : undefined;
}

/** Ring-buffer sizes and the per-string cap for what the browser records before a ticket is filed. */
export const FEEDBACK_RUNTIME_CAPS = { errors: 20, requests: 10, breadcrumbs: 15, text: 500, stackLines: 8 } as const;

const RuntimeText = z.string().max(FEEDBACK_RUNTIME_CAPS.text);
const MsAgo = z.number().int().min(0);

/**
 * What the browser saw in the minutes before a ticket was filed: recent
 * errors, failed or slow API calls (with the server's request id) and the
 * steps that led there. Memory only until the ticket is sent; no request or
 * response bodies, never the text of inputs. `msAgo` counts back from filing.
 */
export const FeedbackRuntimeSchema = z.object({
  errors: z
    .array(
      z.object({
        source: z.enum(["error", "rejection", "console"]),
        message: RuntimeText,
        /** First lines of the stack, when there was one. */
        stack: RuntimeText.optional(),
        msAgo: MsAgo,
      }),
    )
    .max(FEEDBACK_RUNTIME_CAPS.errors),
  requests: z
    .array(
      z.object({
        method: z.string().max(10),
        /** Path only, no query values. */
        path: RuntimeText,
        /** Null when the request never got a response (offline, aborted). */
        status: z.number().int().nullable(),
        ms: z.number().int().min(0),
        /** The response's `x-request-id`: `feedback:agent logs <id>` finds what the server logged. */
        requestId: z.string().max(64).nullable(),
        msAgo: MsAgo,
      }),
    )
    .max(FEEDBACK_RUNTIME_CAPS.requests),
  breadcrumbs: z
    .array(
      z.object({
        kind: z.enum(["route", "click", "submit"]),
        /** A route path, or the selector path of what was clicked or submitted. */
        detail: RuntimeText,
        msAgo: MsAgo,
      }),
    )
    .max(FEEDBACK_RUNTIME_CAPS.breadcrumbs),
  session: z.object({
    role: z.string().max(40).nullable(),
    locale: z.string().max(40),
    online: z.boolean(),
    /** Opened as an installed app (display-mode standalone). */
    standalone: z.boolean(),
    /** Filed while the admin viewed the app as a trainer: who was really looking, at whom. */
    viewingAs: z.object({ actorId: z.string().max(64), trainerId: z.string().max(64) }).optional(),
  }),
});
export type FeedbackRuntime = z.infer<typeof FeedbackRuntimeSchema>;

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
  /** Errors, failed requests and steps before filing; absent on tickets filed before it was recorded. */
  runtime?: FeedbackRuntime;
  /** Bug / wrong behaviour: expected, actual, how often. Absent when not given. */
  report?: FeedbackReport;
}

/**
 * The context with its free data redacted (`redactJson`): page data now,
 * runtime entries and the reporter's expected/actual text as they come. The
 * web runs it before sending, the API again on ingest.
 */
export function redactContext(c: FeedbackContext): FeedbackContext {
  return {
    ...c,
    pageData: redactJson(c.pageData),
    ...(c.runtime ? { runtime: redactJson(c.runtime) } : {}),
    ...(c.report ? { report: redactJson(c.report) } : {}),
  };
}

/**
 * Filed from the Feedback page's composer rather than by clicking an element:
 * the target is empty and the route (if any) is what the reporter typed.
 */
export const isPinned = (c: FeedbackContext): boolean => c.target.selector !== "";

/** Context for a ticket written on the Feedback page, not pinned to an element. */
export function unpinnedContext(
  path: string,
  env: {
    viewport: FeedbackContext["viewport"];
    userAgent: string;
    appVersion: string;
    runtime?: FeedbackRuntime;
    report?: FeedbackReport;
  },
): FeedbackContext {
  return redactContext({
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
  });
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
 * bug / feature request / unclear and a person should look. `needs_info`:
 * one specific fact from the reporter would settle it — the reply asks for
 * it, always as a draft the owner sends.
 */
export const FEEDBACK_AI_VERDICTS = ["exists", "shipped", "how_to", "bug", "feature", "unclear", "needs_info"] as const;
export type FeedbackAiVerdict = (typeof FEEDBACK_AI_VERDICTS)[number];
/** Verdicts an AI answer may go out on by itself (auto mode, medium or high confidence). */
export const FEEDBACK_AI_AUTO_VERDICTS: readonly FeedbackAiVerdict[] = ["exists", "shipped", "how_to"];

export const FEEDBACK_AI_CONFIDENCE = ["high", "medium", "low"] as const;
export type FeedbackAiConfidence = (typeof FEEDBACK_AI_CONFIDENCE)[number];
/** Verdicts a person decides on, or that wait on the reporter: never `high`. */
export const FEEDBACK_AI_MEDIUM_CAP: readonly FeedbackAiVerdict[] = ["bug", "feature", "needs_info"];

/** `needs_info`: the questions for the reporter — 1 to 3, each short. */
export const FEEDBACK_AI_QUESTIONS_MAX = 3;
export const FEEDBACK_AI_QUESTION_MAX = 200;

/** How likely the fix is to break something or miss the point. */
export const FEEDBACK_AI_RISKS = ["low", "medium", "high"] as const;
export type FeedbackAiRisk = (typeof FEEDBACK_AI_RISKS)[number];
/** Caps on an AI fix plan: steps, and characters per step. */
export const FEEDBACK_FIX_PLAN_MAX_STEPS = 8;
export const FEEDBACK_FIX_PLAN_STEP_MAX = 300;
/** Acceptance criteria on a fix plan: 1–3 checkable statements, each short. */
export const FEEDBACK_ACCEPTANCE_MAX = 3;
export const FEEDBACK_ACCEPTANCE_ITEM_MAX = 200;
/** The export's line above the criteria — the fix CLI reads them back by it. */
export const FEEDBACK_ACCEPTANCE_HEADING = "- Acceptance criteria (each needs a test, story or browser check):";

/** The admin's switch: no AI answers, drafts for review only, or send confident ones. */
export const FEEDBACK_AI_MODES = ["off", "drafts", "auto"] as const;
export type FeedbackAiMode = (typeof FEEDBACK_AI_MODES)[number];
export const DEFAULT_FEEDBACK_AI_MODE: FeedbackAiMode = "drafts";

/** Who wrote a thread entry: a person, the auto-reply agent, or a release (CI closing a ticket from a commit). */
export type FeedbackAuthorKind = "human" | "ai" | "system";
/** public = everyone on the ticket; draft = an unsent AI reply; private = an AI triage note. Drafts and private notes are admin-only. */
export type FeedbackVisibility = "public" | "draft" | "private";

/** What the agent recorded alongside an AI reply or note. */
export interface FeedbackAiMeta {
  verdict: FeedbackAiVerdict;
  confidence: FeedbackAiConfidence;
  /** `file:line` references backing the verdict. */
  citations: string[];
  /** `needs_info` only: what the reply asks the reporter (1–3). */
  questions?: string[];
  /** `bug` / `feature` only: concrete steps for the coding agent, naming the files to change. */
  fixPlan?: string[];
  /** `bug` / `feature` only: how risky the fix is. */
  risk?: FeedbackAiRisk;
  /**
   * `bug` / `feature` only: 1–3 checkable statements that are true once it's
   * fixed — each becomes a test, story or browser check in the fix PR.
   */
  acceptance?: string[];
  /**
   * `bug` / `feature` only: the fix plan is complete, checked against the code
   * and leaves no product question open — a coding agent could start now.
   * With `risk: low` on an accepted ticket, the fix agent may pick it up.
   */
  ready?: boolean;
  /** `ticketBasis` of the ticket the agent answered. */
  basis: string;
  model: string | null;
  runAt: string;
}

/**
 * Why a reporter gave an AI answer 👎 — quick tags beside the optional comment.
 * Stored as `llm_feedback.reason_tags` on subject kind `feedback_answer`.
 */
export const FEEDBACK_ANSWER_TAGS = ["wrong", "missed_question", "unclear", "outdated"] as const;
export type FeedbackAnswerTag = (typeof FEEDBACK_ANSWER_TAGS)[number];
export const FEEDBACK_ANSWER_TAG_LABELS: Record<FeedbackAnswerTag, string> = {
  wrong: "Wrong",
  missed_question: "Didn't answer my question",
  unclear: "Unclear",
  outdated: "Outdated",
};
/** Longest comment on a 👎. */
export const FEEDBACK_ANSWER_COMMENT_MAX = 1000;

/** The reporter's latest verdict on one AI answer (a later one replaces it). */
export interface FeedbackAnswerRating {
  score: 1 | -1;
  tags: FeedbackAnswerTag[];
  comment: string | null;
  /** When it was given — a 👎 sends the ticket back to the agent once. */
  at: string;
}

/** The reporter's latest verdict on a shipped fix ("Fixed for you?"); a later one replaces it. */
export interface FeedbackFixRating {
  score: 1 | -1;
  /** What's still wrong, on a 👎; null otherwise. */
  comment: string | null;
  at: string;
}
/** Longest comment on a "not fixed" 👎. */
export const FEEDBACK_FIX_COMMENT_MAX = 1000;

/** What every viewer sees on a release's shipped note: the reporter's verdict on the fix. */
export interface FeedbackFixPublic {
  rating: FeedbackFixRating | null;
  /** The viewer is the ticket's reporter, the only one who may rate it. */
  canRate: boolean;
}

/** The reply posted in the reporter's name when they rate a fix 👎 without saying why. */
export const notFixedNote = (ticketText: string): string =>
  isMostlyThai(ticketText) ? "👎 ยังไม่หาย" : "👎 Not fixed for me.";

/** What every viewer sees about a sent AI answer: how sure it was, and the reporter's verdict. */
export interface FeedbackAiPublic {
  confidence: FeedbackAiConfidence;
  rating: FeedbackAnswerRating | null;
  /** The viewer is the ticket's reporter, the only one who may rate it. */
  canRate: boolean;
}

/** Display name for AI-written entries (they have no trainer author). */
export const FEEDBACK_AI_AUTHOR_NAME = "AI assistant";
/** Display name for entries a release wrote when it closed a ticket. */
export const FEEDBACK_RELEASE_AUTHOR_NAME = "Release";

/**
 * The one trace a "view as trainer" leaves for the trainer: a silent public line
 * on the ticket the admin started it from (no email, no unread badge). Stored in
 * English; the thread shows it in the reader's language.
 */
export const FEEDBACK_VIEWED_NOTE = "Support viewed your account to check this";
export const FEEDBACK_VIEWED_NOTE_TEXT = {
  en: FEEDBACK_VIEWED_NOTE,
  th: "ทีมซัพพอร์ตเข้าไปดูบัญชีของคุณเพื่อตรวจเรื่องนี้",
} as const;

/** Whether a thread entry is the "Support viewed your account" line. */
export const isViewedNote = (c: { authorKind: FeedbackAuthorKind; kind: string; body: string | null; ship?: unknown }) =>
  c.authorKind === "system" && c.kind === "reply" && !c.ship && c.body === FEEDBACK_VIEWED_NOTE;

/** On entries a release wrote: the commit that named the ticket, and the version it went live in. */
export interface FeedbackShip {
  sha: string;
  version: string;
}

/**
 * Ticket numbers a commit subject names, as `FB-<digits>` (`FB-012`, `FB-12`),
 * in order, once each. Upper case only: `fb-12` is not a reference.
 */
export function feedbackHandlesIn(subject: string): number[] {
  const out: number[] = [];
  for (const m of subject.matchAll(/\bFB-(\d{1,9})\b/g)) {
    const n = Number(m[1]);
    if (n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Text is clearly Thai: more Thai letters than Latin ones. */
export const isMostlyThai = (text: string): boolean => {
  const thai = text.match(/[\u0E01-\u0E5B]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return thai > 0 && thai > latin;
};

/** The release's public note to the reporter, in the ticket's language. */
export const shippedNote = (version: string, ticketText: string): string =>
  isMostlyThai(ticketText)
    ? `ปล่อยแล้วในเวอร์ชัน v${version} — รีโหลดแอปเพื่อใช้งาน`
    : `Shipped in v${version} — reload the app to get it.`;

/**
 * Where an image on a ticket came from: the captured close-up of the clicked
 * element, the captured page (element outlined in red), or one the trainer
 * pasted, dropped or picked.
 */
export const FEEDBACK_ATTACHMENT_KINDS = ["element", "page", "upload"] as const;
export type FeedbackAttachmentKind = (typeof FEEDBACK_ATTACHMENT_KINDS)[number];

/** Image types a ticket or reply accepts (the browser re-encodes to webp before upload). */
export const FEEDBACK_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type FeedbackImageMime = (typeof FEEDBACK_IMAGE_MIMES)[number];
/** Uploaded images per ticket, and per reply. The two captured screenshots don't count. */
export const FEEDBACK_MAX_IMAGES = 6;
/** Per image, after the browser's compression. */
export const FEEDBACK_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** The browser scales images down so the longest side is at most this. */
export const FEEDBACK_IMAGE_MAX_SIDE = 2000;

/** An image on a ticket or a reply (metadata only; the bytes have their own URL). */
export interface FeedbackAttachment {
  id: string;
  kind: FeedbackAttachmentKind;
  mime: string;
  /** Null for a few screenshots copied over from before attachments existed. */
  width: number | null;
  height: number | null;
  /** Order within its ticket or reply. */
  position: number;
}

/** File extension for an image type (`jpg`, not `jpeg`). */
export const imageExt = (mime: string): string =>
  ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[mime] ?? "bin";

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
  /** Sent AI answers, for every viewer: confidence and the reporter's rating; null otherwise. */
  aiPublic: FeedbackAiPublic | null;
  /** A release's shipped note, for every viewer: the reporter's "Fixed for you?" rating; null otherwise. */
  fixPublic: FeedbackFixPublic | null;
  /** Release entries: the commit and version that closed the ticket; null otherwise. */
  ship: FeedbackShip | null;
  /** Reply text; null for status entries. */
  body: string | null;
  /** Status moved to; null for replies. */
  status: FeedbackStatus | null;
  /**
   * The admin changed the status (or gave the Won't-fix reason) without telling
   * the reporter: no email, no unread badge. Admin only — always false for anyone else.
   */
  silent: boolean;
  /** Images posted with a reply, in order; empty for status entries. */
  attachments: FeedbackAttachment[];
  createdAt: string;
}

type BasisImages = { attachments?: Pick<FeedbackAttachment, "id" | "kind">[] };

/**
 * Fingerprint of what an AI answer depends on: the comment, the triage note,
 * the public replies and the images people uploaded to the ticket or those
 * replies. When any changes, an answer recorded for the old basis is stale.
 * Drafts and private notes don't count — the same basis whoever computes it.
 * Captured screenshots don't count either: they only show what the comment
 * is about. Upload ids are appended only when there are any, so a ticket
 * without uploads keeps the basis it had before images counted; the same
 * goes for the expected / actual text of a bug report.
 */
export function ticketBasis(
  item: Pick<FeedbackItem, "comment" | "triageNote"> &
    BasisImages & {
      thread: (Pick<FeedbackComment, "kind" | "body" | "visibility"> & BasisImages)[];
      context?: Pick<FeedbackContext, "report">;
    },
): string {
  const replies = item.thread.filter((c) => c.kind === "reply" && (c.visibility ?? "public") === "public");
  const uploads = [item, ...replies]
    .flatMap((e) => e.attachments ?? [])
    .filter((a) => a.kind === "upload")
    .map((a) => a.id);
  // Expected / actual are the reporter's words too; appended only when given, like uploads.
  const r = item.context?.report;
  const report = r?.expected || r?.actual ? `${r.expected ?? ""}\u0001${r.actual ?? ""}` : "";
  const text = [
    item.comment,
    item.triageNote ?? "",
    ...replies.map((c) => c.body ?? ""),
    ...(uploads.length ? [`uploads:${uploads.join(",")}`] : []),
    ...(report ? [`report:${report}`] : []),
  ].join("\u0000");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Another ticket, by handle number and where it stands — all a duplicate link shows. */
export interface FeedbackTicketRef {
  number: number;
  status: FeedbackStatus;
}

/** Statuses still being worked on; `done` and `wontfix` are closed. */
export type OpenFeedbackStatus = Extract<FeedbackStatus, "new" | "accepted" | "in_progress">;
export const OPEN_FEEDBACK_STATUSES: readonly OpenFeedbackStatus[] = ["new", "accepted", "in_progress"];
export const isOpenFeedback = (status: FeedbackStatus): status is OpenFeedbackStatus =>
  (OPEN_FEEDBACK_STATUSES as readonly FeedbackStatus[]).includes(status);

/** A status as plain words for Markdown and emails: `in_progress` → `in progress`. */
export const feedbackStatusText = (status: FeedbackStatus): string => status.replace(/_/g, " ");

/**
 * `FB-12`, `fb-012`, `#FB-12` or a bare `12` → 12; null when it isn't a
 * ticket number. For the "Duplicate of" field and the agent CLI.
 */
export function parseFeedbackHandle(raw: string): number | null {
  const m = /^\s*#?(?:FB-?)?0*([1-9]\d{0,8})\s*$/i.exec(raw);
  return m ? Number(m[1]) : null;
}

export interface FeedbackItem {
  id: string;
  /** Human handle: FB-<number>. */
  number: number;
  /** Who filed it; null for items filed before authorship was recorded. */
  author: FeedbackAuthor | null;
  status: FeedbackStatus;
  /** What the reporter said it is; null on tickets filed before kinds. */
  kind: FeedbackKind | null;
  comment: string;
  /** The admin's private memo for the agent; always null for anyone else. */
  triageNote: string | null;
  route: string;
  /** `file:line:column` of the clicked element, or null. */
  source: string | null;
  context: FeedbackContext;
  /** Images on the ticket itself (screenshots and uploads), in order. Replies carry their own. */
  attachments: FeedbackAttachment[];
  /** App version live when it was marked done (e.g. `0.1.3`); null otherwise. */
  shippedIn: string | null;
  /** Replies and status changes, oldest first. */
  thread: FeedbackComment[];
  /** Last time the comment or the ticket's images were edited; null = never. */
  editedAt: string | null;
  /** Who made that edit (the reporter or the admin); null if never edited or the trainer was deleted. */
  editedBy: FeedbackAuthor | null;
  /** The open ticket this one repeats: it closes when that one does. Null = not a duplicate. */
  duplicateOf: FeedbackTicketRef | null;
  /** Tickets marked as duplicates of this one, by number. */
  duplicates: FeedbackTicketRef[];
  /** The fix agent's pull request for it; admin only (always null for anyone else). */
  fixPr: { url: string; at: string } | null;
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
  /** Accepted / in progress / won't fix / shipped on tickets you filed. */
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
  /** Link target for one of the item's images (on the ticket or a reply); null leaves it out. */
  imageUrl: (item: FeedbackItem, attachment: FeedbackAttachment) => string | null;
  title?: string;
}

const ATTACHMENT_LABEL: Record<FeedbackAttachmentKind, string> = {
  element: "Element screenshot",
  page: "Page screenshot (element outlined in red)",
  upload: "Image",
};

/** `![alt](url)` per image with a URL; uploads are numbered within their entry. */
function imageLines(item: FeedbackItem, list: FeedbackAttachment[], opts: FeedbackMarkdownOptions, where: string) {
  const handle = feedbackHandle(item.number);
  const uploads = list.filter((a) => a.kind === "upload").length;
  let n = 0;
  return list.flatMap((a) => {
    const url = opts.imageUrl(item, a);
    if (a.kind === "upload") n++;
    if (!url) return [];
    const label = a.kind === "upload" && uploads > 1 ? `${ATTACHMENT_LABEL.upload} ${n} of ${uploads}` : ATTACHMENT_LABEL[a.kind];
    return [{ label, md: `![${handle} ${where} ${label.split(" (")[0].toLowerCase()}](${url})` }];
  });
}

const fence = (lang: string, body: string) => {
  const ticks = body.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${body}\n${ticks}`;
};

/**
 * The auto-reply agent's latest private note that still matches the ticket
 * (same `ticketBasis`), or null. Older notes judged a different ticket text.
 * Needs the admin view: other viewers get no private notes or `aiMeta`.
 */
export function currentAiNote(item: FeedbackItem): (FeedbackComment & { aiMeta: FeedbackAiMeta }) | null {
  const basis = ticketBasis(item);
  const note = item.thread.findLast(
    (c) => c.authorKind === "ai" && c.visibility === "private" && c.aiMeta?.basis === basis,
  );
  return note?.aiMeta ? (note as FeedbackComment & { aiMeta: FeedbackAiMeta }) : null;
}

/**
 * The reporter's 👎 the agent hasn't acted on, or null. It counts when it's on
 * the latest sent AI answer and nothing came after it — no AI entry (an
 * answer, a draft or a note) and no reply from the owner. So a ticket goes
 * back to the agent at most once per 👎. Pure; works on any viewer's item.
 */
export function pendingDownvote(
  item: Pick<FeedbackItem, "author" | "thread">,
): { commentId: string; rating: FeedbackAnswerRating } | null {
  const answer = item.thread.findLast((c) => c.kind === "reply" && c.visibility === "public" && c.authorKind === "ai");
  const rating = answer?.aiPublic?.rating;
  if (!answer || !rating || rating.score !== -1) return null;
  const after = item.thread.some(
    (c) =>
      c.createdAt > rating.at &&
      (c.authorKind === "ai" ||
        (c.kind === "reply" && c.visibility === "public" && c.authorKind === "human" && c.author?.id !== item.author?.id)),
  );
  return after ? null : { commentId: answer.id, rating };
}

/** "👎 Wrong, Unclear — “It's under Settings”", for Markdown and the CLI. */
export function answerRatingText(r: FeedbackAnswerRating): string {
  const tags = r.tags.map((t) => FEEDBACK_ANSWER_TAG_LABELS[t]).join(", ");
  const said = r.comment ? `“${r.comment.trim().split("\n").join(" ")}”` : "";
  return [r.score === 1 ? "👍" : "👎", [tags, said].filter(Boolean).join(" — ")].filter(Boolean).join(" ");
}

/** The reporter's words on one Markdown line, quoted (they are as untrusted as the comment). */
const quoteInline = (s: string) => `"${s.trim().split("\n").join(" / ")}"`;

/** `12 s before`, `3 min before` — how long before filing. */
const before = (ms: number) =>
  ms < 1000 ? "just before" : ms < 60_000 ? `${Math.round(ms / 1000)} s before` : `${Math.round(ms / 60_000)} min before`;
/** Runtime text on one line, quoted; it is the browser's, as untrusted as the comment. */
const oneLine = (s: string) => `"${s.replace(/\s+/g, " ").trim().replace(/"/g, "'")}"`;

/** The **Runtime** lines: session, errors, failed or slow requests (with request ids), steps before the report. */
function runtimeLines(r: FeedbackRuntime): string[] {
  const s = r.session;
  const out = [
    `- **Runtime:** ${[s.online ? "online" : "offline", `locale ${s.locale}`, s.standalone ? "installed app" : "browser tab", ...(s.role ? [`role ${s.role}`] : [])].join(" · ")}`,
  ];
  if (r.errors.length) {
    out.push("  - Errors (oldest first):");
    for (const e of r.errors) {
      out.push(`    - ${e.source}, ${before(e.msAgo)}: ${oneLine(e.message)}`);
      if (e.stack) out.push(`      ${oneLine(e.stack)}`);
    }
  }
  if (r.requests.length) {
    out.push("  - Failed or slow requests (oldest first; `feedback:agent logs <request id>` shows the server's side):");
    for (const q of r.requests) {
      const id = q.requestId ? ` · request \`${q.requestId}\`` : " · no request id";
      out.push(`    - \`${q.method} ${q.path}\` → ${q.status ?? "no response"} in ${q.ms} ms${id} (${before(q.msAgo)})`);
    }
  }
  if (r.breadcrumbs.length) {
    out.push("  - Steps before the report (oldest first):");
    for (const b of r.breadcrumbs) out.push(`    - ${b.kind} \`${b.detail.replace(/`/g, "'")}\` (${before(b.msAgo)})`);
  }
  if (!r.errors.length && !r.requests.length) out.push("  - No errors or failed requests recorded before the report");
  return out;
}

/**
 * The reporter's 👎 on the latest shipped fix, when the ticket is open again
 * because of it: the fix went out and didn't solve it for them. Null otherwise.
 */
export function failedFix(item: Pick<FeedbackItem, "status" | "thread">): { note: FeedbackComment; rating: FeedbackFixRating } | null {
  if (!isOpenFeedback(item.status)) return null;
  const note = item.thread.findLast((c) => c.fixPublic);
  const rating = note?.fixPublic?.rating;
  return note && rating?.score === -1 ? { note, rating } : null;
}

/** "👎 — “still tiny on my phone”", for Markdown and the CLI. */
export const fixRatingText = (r: FeedbackFixRating): string =>
  [r.score === 1 ? "👍 fixed" : "👎 not fixed", r.comment ? `“${r.comment.trim().split("\n").join(" ")}”` : ""]
    .filter(Boolean)
    .join(" — ");

/** One item as a self-contained Markdown section. */
export function feedbackItemMarkdown(item: FeedbackItem, opts: FeedbackMarkdownOptions): string {
  const c = item.context;
  const lines: string[] = [];
  const ai = currentAiNote(item);
  lines.push(`## ${feedbackHandle(item.number)} · ${feedbackStatusText(item.status)}`);
  lines.push("");
  lines.push(`> ${item.comment.trim().split("\n").join("\n> ")}`);
  lines.push("");
  if (item.kind) lines.push(`- **Kind:** ${FEEDBACK_KIND_LABELS[item.kind] ?? item.kind}`);
  const r = c.report;
  if (r?.expected) lines.push(`- **Expected:** ${quoteInline(r.expected)}`);
  if (r?.actual) lines.push(`- **Actual:** ${quoteInline(r.actual)}`);
  if (r?.repeat) lines.push(`- **Happens:** ${FEEDBACK_REPEAT_LABELS[r.repeat].toLowerCase()}`);
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
  if (c.runtime) lines.push(...runtimeLines(c.runtime));
  lines.push(`- **Reported by:** ${item.author?.name ?? "unknown"}`);
  lines.push(`- **Build:** \`${c.appVersion}\` · reported ${item.createdAt}`);
  if (item.editedAt) {
    lines.push(
      `- **Edited:** ${item.editedAt} by ${item.editedBy?.name ?? "unknown"} — the comment and images above are the edited version; replies before that answered the earlier text`,
    );
  }
  if (item.duplicateOf) {
    lines.push(`- **Duplicate of:** ${feedbackHandle(item.duplicateOf.number)} (${feedbackStatusText(item.duplicateOf.status)}) — it closes when that ticket does`);
  }
  if (item.duplicates?.length) {
    lines.push(`- **Duplicates:** ${item.duplicates.map((d) => `${feedbackHandle(d.number)} (${feedbackStatusText(d.status)})`).join(", ")} — they close with this ticket`);
  }
  if (item.triageNote) lines.push(`- **Triage note (owner):** ${item.triageNote}`);
  const downvote = pendingDownvote(item);
  if (downvote) {
    lines.push(
      `- **Reporter rated the last AI answer ${answerRatingText(downvote.rating)}** (${downvote.rating.at.slice(0, 10)}) — answer again; this answer waits as a draft for the owner`,
    );
  }
  const failed = failedFix(item);
  if (failed) {
    const sha = failed.note.ship?.sha ? ` (commit \`${failed.note.ship.sha.slice(0, 7)}\`, v${failed.note.ship.version})` : "";
    lines.push(
      `- **The shipped fix didn't work for the reporter${sha}:** ${fixRatingText(failed.rating)} (${failed.rating.at.slice(0, 10)}) — reopened; find what the fix missed`,
    );
  }
  if (item.shippedIn) lines.push(`- **Shipped in:** v${item.shippedIn}`);
  if (item.fixPr) lines.push(`- **Fix PR:** ${item.fixPr.url} (opened ${item.fixPr.at.slice(0, 10)})`);
  if (ai) {
    const m = ai.aiMeta;
    const rated = [
      m.verdict.replace(/_/g, " "),
      `${m.confidence} confidence`,
      ...(m.risk ? [`${m.risk} risk`] : []),
      ...(m.ready === undefined ? [] : [m.ready ? "ready to fix" : "not ready to fix"]),
    ];
    lines.push(`- **AI triage (read the code, ${ai.createdAt.slice(0, 10)}):** ${rated.join(" · ")}`);
    lines.push(`  > ${(ai.body ?? "").trim().split("\n").join("\n  > ")}`);
    if (m.fixPlan?.length) {
      lines.push("  - Fix plan:");
      m.fixPlan.forEach((step, i) => lines.push(`    ${i + 1}. ${step}`));
    }
    if (m.acceptance?.length) {
      lines.push(`  ${FEEDBACK_ACCEPTANCE_HEADING}`);
      m.acceptance.forEach((c) => lines.push(`    - ${c}`));
    }
    if (m.questions?.length) {
      lines.push("  - Asked the reporter:");
      m.questions.forEach((q) => lines.push(`    - ${q}`));
    }
    if (m.citations.length) lines.push(`  - Citations: ${m.citations.map((x) => `\`${x}\``).join(", ")}`);
  }
  for (const img of imageLines(item, item.attachments ?? [], opts, "ticket")) lines.push(`- **${img.label}:** ${img.md}`);
  // AI private notes: the current one is the AI triage above; older ones judged a ticket that has since changed.
  const thread = item.thread.filter((e) => !(e.authorKind === "ai" && e.visibility === "private"));
  if (thread.length) {
    lines.push("");
    lines.push("**Thread** (oldest first — clarifications from the reporter and the owner):");
    lines.push("");
    for (const c of thread) {
      const who =
        c.authorKind === "ai"
          ? FEEDBACK_AI_AUTHOR_NAME
          : c.authorKind === "system"
            ? FEEDBACK_RELEASE_AUTHOR_NAME
            : (c.author?.name ?? "unknown");
      const tag = c.visibility === "draft" ? " _(unsent draft)_" : "";
      lines.push(
        c.kind === "status"
          ? `- _${who} marked it ${c.status ? feedbackStatusText(c.status) : ""} (${c.createdAt.slice(0, 10)})_`
          : `- **${who}**${tag} (${c.createdAt.slice(0, 10)}): ${(c.body ?? "").trim().split("\n").join("\n  ")}`,
      );
      for (const img of imageLines(item, c.attachments ?? [], opts, "reply")) lines.push(`  - ${img.label}: ${img.md}`);
      const rating = c.aiPublic?.rating;
      if (rating) lines.push(`  - _Reporter's rating (${rating.at.slice(0, 10)}):_ ${answerRatingText(rating)}`);
      const fix = c.fixPublic?.rating;
      if (fix) lines.push(`  - _Reporter's rating of the fix (${fix.at.slice(0, 10)}):_ ${fixRatingText(fix)}`);
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
    "owner's decision and outranks the comment when they differ. **AI triage** is the auto-reply",
    "agent's latest read of the code for the ticket as it stands; verify its fix plan before you follow it.",
  ];
  return [...head, "", ...items.map((i) => `${feedbackItemMarkdown(i, opts)}\n`)].join("\n");
}
