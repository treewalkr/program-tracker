/**
 * When the local feedback watcher starts the auto-reply agent. Pure, so it
 * can be tested; feedback-watch.ts does the polling and the spawning.
 */

/** What the last agent run saw, kept between polls (and restarts). */
export interface WatchState {
  /** `/pending` cursor the last run was started for; null = never ran. */
  cursor: string | null;
  /** When that run started, ms. */
  lastRunAt: number | null;
}

export interface Pending {
  inbox: number;
  cursor: string;
}

/** Same work, no news: run again after this long anyway — a run may have failed or skipped a 409. */
export const RETRY_MS = 30 * 60_000;
/** Seconds between polls unless --interval says otherwise, and the floor (be kind to the API). */
export const DEFAULT_INTERVAL_S = 60;
export const MIN_INTERVAL_S = 15;

export type Decision = { run: true; reason: "new work" | "retry" } | { run: false; reason: string };

/**
 * Start the agent when the inbox has tickets and either they changed since
 * the last run (a new ticket, a reply, an edit) or the last run was long
 * enough ago that a retry is due. An empty inbox never starts a run.
 */
export function shouldRun(state: WatchState, pending: Pending, now: number, retryMs = RETRY_MS): Decision {
  if (pending.inbox === 0) return { run: false, reason: "inbox empty" };
  if (pending.cursor !== state.cursor) return { run: true, reason: "new work" };
  if (state.lastRunAt === null || now - state.lastRunAt >= retryMs) return { run: true, reason: "retry" };
  const mins = Math.round((now - state.lastRunAt) / 60_000);
  return { run: false, reason: `same ${pending.inbox} ticket(s) as the run ${mins}m ago` };
}

/** `--interval` seconds → ms, at least MIN_INTERVAL_S; junk → the default. */
export function intervalMs(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_S * 1000;
  return Math.max(n, MIN_INTERVAL_S) * 1000;
}

/** A state file's contents → state; anything unreadable starts fresh. */
export function parseState(raw: string | null): WatchState {
  try {
    const v = JSON.parse(raw ?? "") as Partial<WatchState>;
    return {
      cursor: typeof v.cursor === "string" ? v.cursor : null,
      lastRunAt: typeof v.lastRunAt === "number" ? v.lastRunAt : null,
    };
  } catch {
    return { cursor: null, lastRunAt: null };
  }
}

/**
 * The agent the watcher starts: headless Claude Code running the skill, with
 * the same narrow tool allowlist the T3 schedule uses. FEEDBACK_WATCH_CMD
 * replaces it (run through `sh -c`).
 */
export const DEFAULT_AGENT_CMD = [
  "claude",
  "-p",
  "/answer-feedback",
  "--allowedTools",
  [
    "Read",
    "Grep",
    "Glob",
    "Edit(//tmp/pt-fb-agent/**)",
    "Bash(git fetch:*)",
    "Bash(git log:*)",
    "Bash(git show:*)",
    "Bash(bun run feedback:agent:*)",
    "mcp__codebase-memory-mcp__*",
  ].join(","),
];
