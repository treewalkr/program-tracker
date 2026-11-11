/**
 * The feedback fix agent's hands: the guarded, deterministic steps around a
 * fix. The coding agent running `/fix-feedback` makes the change itself; this
 * picks the tickets, sets up the worktree, and checks, pushes and opens the PR.
 *
 *   bun run feedback:fix list [--max N]          tickets to fix this run (default 2, cap 5):
 *                                                accepted, low risk, ready, no open/merged PR
 *   bun run feedback:fix prepare <id>            worktree ../pt-fix-fb-012 on fix/fb-012 from
 *                                                origin/main; brief at /tmp/pt-fb-fix/FB-012.md
 *   bun run feedback:fix open <id> --worktree <path>
 *                                                check the branch, push it, open a draft PR,
 *                                                record the PR on the ticket
 *
 * --dry-run (or FEEDBACK_FIX_DRY_RUN=1): `open` runs every check and prints
 * the push, the PR and the record it would make — nothing leaves the machine.
 * `list` and `prepare` are local or read-only either way.
 *
 * Never merges, never pushes main, never force-pushes.
 * Config: PT_API_URL and FEEDBACK_AGENT_TOKEN (.env.agent or the environment).
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { treaty } from "@elysiajs/eden";
import type { App } from "../src/app";
import { agentEnv } from "./agent-env";
import {
  FIX_MAX_CAP,
  checkBranch,
  clampMax,
  fixBranch,
  fixWorktreePath,
  ghCreateArgs,
  pickTickets,
  planFromMarkdown,
  prText,
  pushArgs,
  type PrState,
} from "./feedback-fix-lib";

const BRIEF_DIR = "/tmp/pt-fb-fix";

function fail(message: string): never {
  console.error(`feedback-fix: ${message}`);
  process.exit(1);
}

const run = (cmd: string[], cwd?: string) => {
  const r = Bun.spawnSync(cmd, { cwd, stderr: "pipe" });
  return { ok: r.success, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
};
const must = (cmd: string[], cwd?: string) => {
  const r = run(cmd, cwd);
  if (!r.ok) fail(`${cmd.join(" ")} failed: ${r.err || r.out}`);
  return r.out;
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    max: { type: "string" },
    worktree: { type: "string" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
const [command, id] = positionals;
if (values.help || !command) {
  console.log("usage: feedback-fix list [--max N] | prepare <id> | open <id> --worktree <path>   [--dry-run]");
  process.exit(command ? 0 : 1);
}
const dryRun = values["dry-run"] === true || process.env.FEEDBACK_FIX_DRY_RUN === "1";

const env = agentEnv() ?? fail("set PT_API_URL and FEEDBACK_AGENT_TOKEN (in .env.agent at the repo root, or the environment)");
const api = treaty<App>(env.url, { headers: { authorization: `Bearer ${env.token}` } }).v1.agent.feedback;

/** Every current candidate (the API's cap), so `prepare` and `open` can re-check one by id. */
async function candidates() {
  const { data, error } = await api.fixable.get({ query: { limit: FIX_MAX_CAP } });
  if (error) fail(`fixable: ${String(error.status)} ${JSON.stringify(error.value)}`);
  return data;
}

/** One candidate by id, or why it isn't one any more. */
async function candidate(ticketId: string) {
  const all = await candidates();
  const t = all.tickets.find((x) => x.id === ticketId);
  if (!t) fail(`${ticketId} is not a fix candidate now (accepted, low risk, ready, not a duplicate) — skip it`);
  return t;
}

function prState(url: string): PrState {
  const r = run(["gh", "pr", "view", url, "--json", "state", "--jq", ".state"]);
  return r.ok && ["OPEN", "MERGED", "CLOSED"].includes(r.out) ? (r.out as PrState) : "UNKNOWN";
}

const repoRoot = must(["git", "rev-parse", "--show-toplevel"], import.meta.dir);

if (command === "list") {
  const max = clampMax(values.max);
  const data = await candidates();
  const states = new Map(data.tickets.filter((t) => t.fixPr).map((t) => [t.fixPr!, prState(t.fixPr!)]));
  const { take, skip } = pickTickets(data.tickets, states, max);
  const lines = [`# Fix run — ${take.length} ticket${take.length === 1 ? "" : "s"} (max ${max})${dryRun ? " · dry run" : ""}`];
  const skipped = [...skip, ...data.skipped];
  if (skipped.length || data.more) lines.push("");
  for (const s of skipped) lines.push(`- skip ${s.handle}: ${s.reason}`);
  if (data.more) lines.push(`- ${data.more} more candidate(s) wait for a later run`);
  for (const t of take) lines.push("", "---", "", `id: ${t.id}`, `branch: ${fixBranch(t.number)}`, "", t.markdown);
  if (!take.length) lines.push("", "Nothing to fix.");
  console.log(lines.join("\n"));
} else if (command === "prepare") {
  if (!id) fail("prepare needs a ticket id");
  const t = await candidate(id);
  const branch = fixBranch(t.number);
  const path = resolve(fixWorktreePath(repoRoot, t.number));
  if (existsSync(path)) fail(`${path} already exists — finish or remove it (git worktree remove ${path})`);
  if (run(["git", "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot).ok) {
    fail(`branch ${branch} already exists — delete it (git branch -D ${branch}) if its PR was closed`);
  }
  must(["git", "fetch", "origin", "main", "--quiet"], repoRoot);
  must(["git", "worktree", "add", "-b", branch, path, "origin/main"], repoRoot);
  // the new worktree needs its own deps and the gitignored env files the tests read
  for (const f of [".env.agent", "apps/web/.env"]) {
    if (existsSync(join(repoRoot, f))) must(["cp", join(repoRoot, f), join(path, f)]);
  }
  await mkdir(BRIEF_DIR, { recursive: true });
  const brief = join(BRIEF_DIR, `${t.handle}.md`);
  await writeFile(brief, `${t.markdown}\n`);
  console.log([`worktree: ${path}`, `branch: ${branch}`, `brief: ${brief}`, "next: bun install, make the fix, run the tests, commit, then `open`"].join("\n"));
} else if (command === "open") {
  if (!id) fail("open needs a ticket id");
  if (!values.worktree) fail("open needs --worktree <path>");
  const path = resolve(values.worktree);
  const t = await candidate(id);
  if (t.fixPr) {
    const state = prState(t.fixPr);
    if (state !== "CLOSED") fail(`${t.handle} already has a PR (${state.toLowerCase()}): ${t.fixPr}`);
  }
  must(["git", "fetch", "origin", "main", "--quiet"], path);
  const branch = must(["git", "rev-parse", "--abbrev-ref", "HEAD"], path);
  const subjects = must(["git", "log", "--reverse", "--format=%s", "origin/main..HEAD"], path).split("\n").filter(Boolean);
  const dirty = must(["git", "status", "--porcelain"], path) !== "";
  const problem = checkBranch({ number: t.number, branch, subjects, dirty });
  if (problem) fail(`${t.handle}: ${problem}`);

  const { title, body } = prText({ handle: t.handle, subjects, plan: planFromMarkdown(t.markdown) });
  await mkdir(BRIEF_DIR, { recursive: true });
  const bodyFile = join(BRIEF_DIR, `${t.handle}-pr.md`);
  await writeFile(bodyFile, body);
  const push = ["git", ...pushArgs(branch)];
  const gh = ["gh", ...ghCreateArgs(branch, title, bodyFile)];
  if (dryRun) {
    console.log(
      [
        `dry run — ${t.handle} passes every check; nothing pushed, no PR, nothing recorded.`,
        `would run (in ${path}):`,
        `  ${push.join(" ")}`,
        `  ${gh.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
        `  then record the PR URL on ${t.handle}`,
        "",
        `PR body (${bodyFile}):`,
        body,
      ].join("\n"),
    );
    process.exit(0);
  }
  must(push, path);
  const url = must(gh, path).split("\n").find((l) => l.startsWith("https://github.com/"));
  if (!url) fail("gh pr create printed no PR URL");
  const { error } = await api({ id: t.id })["fix-pr"].post({ url });
  if (error) fail(`PR ${url} opened, but recording it failed: ${String(error.status)} ${JSON.stringify(error.value)}`);
  console.log(`${t.handle} → ${url}`);
} else {
  fail(`unknown command "${command}" (list | prepare | open)`);
}
