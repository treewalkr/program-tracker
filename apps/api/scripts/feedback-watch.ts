/**
 * Event-driven feedback answers: a small local poller that starts the
 * auto-reply agent only when there is something to answer, instead of a blind
 * 30-minute schedule. The API can't reach the owner's Mac, so the Mac asks —
 * one cheap `GET /v1/agent/feedback/pending` per interval (counts and a
 * cursor; no Markdown, no images).
 *
 *   bun run feedback:watch                 poll every 60s, run the agent on new work
 *   bun run feedback:watch --interval 120  poll every 120s (floor 15)
 *   bun run feedback:watch --once          one check (and run, if due), then exit
 *   bun run feedback:watch --dry-run       say what it would run; never runs or saves state
 *
 * Starts the agent when the inbox is non-empty and its cursor changed since
 * the last run, or 30 minutes passed (a retry). Runs one at a time, waiting
 * for each to finish. The agent is `claude -p /answer-feedback` with a
 * read-only allowlist, from the repo root; FEEDBACK_WATCH_CMD replaces it.
 * Its output (stream-json) is saved to /tmp/pt-fb-agent/run-<start>.jsonl
 * (the newest 20 kept) and named in run.json while it runs, so
 * `feedback:agent answer` uploads it with each answer.
 * Config: PT_API_URL and FEEDBACK_AGENT_TOKEN (.env.agent or the environment).
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { treaty } from "@elysiajs/eden";
import type { App } from "../src/app";
import { agentEnv } from "./agent-env";
import { DEFAULT_AGENT_CMD, intervalMs, parseState, shouldRun, transcriptName, type WatchState } from "./feedback-watch-lib";
import { transcriptStats, transcriptsToPrune } from "../src/lib/agent-transcript";

const DIR = "/tmp/pt-fb-agent";
const STATE_FILE = join(DIR, "watch-state.json");
const LOCK_FILE = join(DIR, "watch.pid");
const RUN_FILE = join(DIR, "run.json");

const log = (msg: string) => console.log(`${new Date().toISOString()} feedback-watch: ${msg}`);
function fail(message: string): never {
  console.error(`feedback-watch: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    interval: { type: "string" },
    once: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
if (values.help) {
  console.log("usage: feedback-watch [--interval <seconds>] [--once] [--dry-run]");
  process.exit(0);
}
const dryRun = values["dry-run"] === true;
const every = intervalMs(values.interval);

const env = agentEnv() ?? fail("set PT_API_URL and FEEDBACK_AGENT_TOKEN (in .env.agent at the repo root, or the environment)");
const api = treaty<App>(env.url, { headers: { authorization: `Bearer ${env.token}` } }).v1.agent.feedback;
const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: import.meta.dir });
const repoRoot = top.success ? top.stdout.toString().trim() : process.cwd();
const agentCmd = process.env.FEEDBACK_WATCH_CMD ? ["sh", "-c", process.env.FEEDBACK_WATCH_CMD] : DEFAULT_AGENT_CMD;

mkdirSync(DIR, { recursive: true });

/** One watcher per machine: a second one exits instead of doubling the runs. */
function takeLock() {
  if (existsSync(LOCK_FILE)) {
    const pid = Number(readFileSync(LOCK_FILE, "utf8"));
    let alive = false;
    try {
      alive = pid > 0 && process.kill(pid, 0);
    } catch {}
    if (alive && pid !== process.pid) fail(`already running (pid ${pid}); stop it or remove ${LOCK_FILE}`);
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  const release = () => {
    try {
      if (readFileSync(LOCK_FILE, "utf8") === String(process.pid)) unlinkSync(LOCK_FILE);
    } catch {}
  };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0));
}

const loadState = (): WatchState => parseState(existsSync(STATE_FILE) ? readFileSync(STATE_FILE, "utf8") : null);
const saveState = (s: WatchState) => writeFileSync(STATE_FILE, JSON.stringify(s));

async function tick() {
  const res = await api.pending.get().catch((e: unknown) => ({ data: null, error: { status: String(e), value: null } }));
  if (!res.data) {
    log(`pending check failed (${String(res.error?.status)}) — will try again`);
    return;
  }
  const pending = res.data;
  const state = loadState();
  const now = Date.now();
  const decision = shouldRun(state, pending, now);
  if (!decision.run) {
    if (values.once || dryRun) log(`no run: ${decision.reason} (fixable: ${pending.fixable})`);
    return;
  }
  log(`${pending.inbox} ticket(s) waiting — ${decision.reason}${dryRun ? "; dry run, would start:" : "; starting:"} ${agentCmd.join(" ")}`);
  if (dryRun) return;
  // Saved before the run: a crash mid-run still waits for news or the retry instead of looping.
  saveState({ cursor: pending.cursor, lastRunAt: now });
  // The agent's stdout (its stream-json run) goes to a file; run.json tells the CLI which one.
  const transcript = join(DIR, transcriptName(now));
  const fd = openSync(transcript, "w");
  writeFileSync(RUN_FILE, JSON.stringify({ transcript, startedAt: now }));
  let code: number;
  try {
    const proc = Bun.spawn(agentCmd, { cwd: repoRoot, stdout: fd, stderr: "inherit", stdin: "ignore" });
    code = await proc.exited;
  } finally {
    closeSync(fd);
    rmSync(RUN_FILE, { force: true });
  }
  const stats = transcriptStats(readFileSync(transcript, "utf8"));
  const cost = stats.costUsd === null ? "" : `, $${stats.costUsd.toFixed(2)}`;
  const turns = stats.numTurns === null ? "" : `, ${stats.numTurns} turns`;
  log(`agent finished (exit ${code}, ${Math.round((Date.now() - now) / 1000)}s${turns}${cost}) — transcript ${transcript}`);
  for (const old of transcriptsToPrune(readdirSync(DIR))) rmSync(join(DIR, old), { force: true });
}

if (!dryRun) takeLock();
log(`watching ${env.url} every ${every / 1000}s${dryRun ? " (dry run)" : ""}`);
for (;;) {
  await tick();
  if (values.once) break;
  await Bun.sleep(every);
}
