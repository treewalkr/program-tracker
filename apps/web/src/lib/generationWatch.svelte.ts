import type { GenerationDto, PendingGenerationDto, TrainerApi } from "./api/types";
import { POLL_INTERVAL_MS } from "./generation";

/**
 * One watcher for the whole app: tells the trainer when an AI draft
 * (generate, fill, chat build) finishes or fails, wherever they are.
 *
 * - `start()` (root layout) polls `/pending` once, so a refresh keeps
 *   watching a draft that is still running.
 * - `watch(request)` (the page that started the draft) polls until the held
 *   request settles, then reports its row — the POST only returns the id
 *   when the draft is done, so the poll is how a mid-run id is learned.
 * - Polls every 5 s while something is pending, every 30 s while the tab is
 *   hidden, and not at all when nothing is.
 * - A row that leaves the pending list is read once and becomes a notice:
 *   ready (validated) or failed. Cancelled, approved or vanished rows are quiet.
 * - No in-app notice while the trainer is on that client's generate or chat
 *   page (it moves to review on its own); a browser notification still fires
 *   when the tab is hidden.
 */

export const HIDDEN_POLL_MS = 30_000;

export interface DraftNotice {
  /** The generation id. */
  id: string;
  tone: "ready" | "failed";
  clientId: string;
  clientName: string;
  /** "Ada's week 3 is ready" — the whole sentence. */
  title: string;
  /** Failed only: a short reason. */
  reason: string | null;
  href: string;
}

/** What the page knows about a draft it starts — used before the poll has seen the row. */
export interface WatchInfo {
  clientId: string;
  clientName: string;
  /** Where Review/Open goes (default: the client's generate page). */
  href?: string;
}

export interface WatchDeps {
  api: Pick<TrainerApi, "pendingGenerations" | "generation" | "generations">;
  /** The current pathname. */
  path: () => string;
  hidden: () => boolean;
  /** Browser notification for a settled draft (tab hidden). */
  notify?: (notice: DraftNotice) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Your client";
const possessive = (name: string) => `${name}${name.endsWith("s") ? "’" : "’s"}`;

/** "Ada’s week 3 is ready", "Ada’s draft failed", "Ada’s new version is ready". */
export function noticeTitle(
  gen: Pick<GenerationDto, "kind" | "targetWeek" | "parentGenerationId">,
  clientName: string,
  tone: DraftNotice["tone"]
): string {
  const thing =
    gen.kind === "week" && gen.targetWeek
      ? `week ${gen.targetWeek}`
      : gen.parentGenerationId
        ? "new version"
        : gen.kind === "fill"
          ? "filled weeks"
          : "draft";
  const verb = tone === "ready" ? (thing === "filled weeks" ? "are ready" : "is ready") : "failed";
  return `${possessive(firstName(clientName))} ${thing} ${verb}`;
}

/** First line of the error, trimmed — the notice is not the place for a stack. */
export function shortReason(error: string | null | undefined): string | null {
  const line = error?.split("\n").find((l) => l.trim())?.trim();
  if (!line) return null;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** True while the trainer is on `clientId`'s generate or chat page. */
export function onDraftPage(path: string, clientId: string): boolean {
  return path === `/clients/${clientId}/generate` || path === `/clients/${clientId}/chat`;
}

export function createGenerationWatch(deps: WatchDeps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;

  let notices = $state<DraftNotice[]>([]);
  /** Rows seen pending: id → what the notice needs. */
  const watching = new Map<string, WatchInfo & { gen?: PendingGenerationDto }>();
  /** Ids already reported (or deliberately skipped) — a row settles once. */
  const settled = new Set<string>();
  /** Held requests still running — the poll keeps going for them. */
  let inFlight = 0;
  let started = false;
  let timer: unknown = null;
  let polling: Promise<void> | null = null;

  const active = () => started && (watching.size > 0 || inFlight > 0);

  function schedule(ms = deps.hidden() ? HIDDEN_POLL_MS : POLL_INTERVAL_MS) {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!active()) return;
    timer = setTimer(() => {
      timer = null;
      void poll().then(() => schedule());
    }, ms);
  }

  function report(gen: GenerationDto, info: WatchInfo) {
    if (settled.has(gen.id)) return;
    const tone = gen.status === "validated" ? "ready" : gen.status === "failed_validation" || gen.status === "failed_provider" ? "failed" : null;
    if (gen.status === "pending") return;
    settled.add(gen.id);
    watching.delete(gen.id);
    if (!tone) return;
    const notice: DraftNotice = {
      id: gen.id,
      tone,
      clientId: gen.clientId,
      clientName: info.clientName,
      title: noticeTitle(gen, info.clientName, tone),
      reason: tone === "failed" ? shortReason(gen.error) : null,
      href: info.href ?? `/clients/${gen.clientId}/generate`,
    };
    if (deps.hidden()) deps.notify?.(notice);
    if (onDraftPage(deps.path(), gen.clientId)) return;
    notices = [notice, ...notices.filter((n) => n.id !== notice.id)];
  }

  async function settle(id: string, info: WatchInfo) {
    try {
      report(await deps.api.generation(id), info);
    } catch (err) {
      // Gone (404) is quiet; anything else retries on the next poll.
      if ((err as { status?: unknown }).status === 404 || /not found/i.test((err as Error).message ?? "")) {
        settled.add(id);
        watching.delete(id);
      }
    }
  }

  async function pollOnce() {
    let rows: PendingGenerationDto[];
    try {
      rows = await deps.api.pendingGenerations();
    } catch {
      return; // offline or signed out — try again next tick
    }
    const live = new Set(rows.map((r) => r.id));
    for (const row of rows) {
      if (settled.has(row.id)) continue;
      const prev = watching.get(row.id);
      watching.set(row.id, { clientId: row.clientId, clientName: row.clientName, href: prev?.href, gen: row });
    }
    const gone = [...watching].filter(([id]) => !live.has(id));
    await Promise.all(gone.map(([id, info]) => settle(id, info)));
  }

  /** One poll at a time; a caller during a poll waits for that one. */
  function poll(): Promise<void> {
    polling ??= pollOnce().finally(() => (polling = null));
    return polling;
  }

  /** A held request ended without a row (dropped connection, 5xx): find the row it made. */
  async function recover(info: WatchInfo, since: number) {
    try {
      const gens = await deps.api.generations(info.clientId);
      const row = gens.find((g) => new Date(g.createdAt).getTime() >= since - 5_000 && !settled.has(g.id));
      if (!row) return;
      if (row.status === "pending") watching.set(row.id, { ...info, ...watching.get(row.id) });
      else report(row, { ...info, ...watching.get(row.id) });
    } catch {
      // nothing more to learn — the page shows its own error
    }
  }

  return {
    get notices() {
      return notices;
    },

    /** Begin: one poll for drafts still running from before a refresh. Idempotent. */
    async start() {
      if (started) return;
      started = true;
      await poll();
      schedule();
    },

    /** Signed out (or the app went away): stop polling and forget this trainer's drafts. */
    stop() {
      started = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
      watching.clear();
      notices = [];
    },

    /**
     * Track a held generate/fill/build request. Resolves to the same row (or
     * null) so the caller can keep awaiting it; rejections pass through.
     */
    watch<T extends GenerationDto | null>(request: Promise<T>, info: WatchInfo): Promise<T> {
      const since = now();
      inFlight++;
      // The row is written a moment after the request starts; look for it soon.
      schedule(1_000);
      request.then(
        (row) => {
          inFlight--;
          if (row) {
            const known = watching.get(row.id);
            report(row, { ...info, ...known, href: info.href ?? known?.href });
          }
          schedule();
        },
        async () => {
          inFlight--;
          await recover(info, since);
          schedule();
        }
      );
      return request;
    },

    /** The tab came back: check now, then at the visible pace. */
    async wake() {
      if (!active()) return;
      await poll();
      schedule();
    },

    /** Visibility changed while hidden: slow down (or resume) the timer. */
    reschedule() {
      schedule();
    },

    dismiss(id: string) {
      notices = notices.filter((n) => n.id !== id);
    },

    dismissAll() {
      notices = [];
    },

    /** For tests: the ids currently watched. */
    get watched() {
      return [...watching.keys()];
    },
  };
}

export type GenerationWatch = ReturnType<typeof createGenerationWatch>;
