/**
 * Red proof: the tests a commit adds or changes fail on its parent's source and pass on its own.
 *
 *   bun scripts/guards/red-proof.ts <sha>                 prove a commit that exists
 *   bun scripts/guards/red-proof.ts --staged [--parent R] prove the index (what commit-msg does)
 *
 * Prints the `Red-Proof:` trailer on stdout and exits 0 when proven; exits 1 when the claim is
 * false (not red, not green, no tests) and 2 when it couldn't tell (Postgres down, lock busy).
 * Progress goes to stderr. Runs in throwaway worktrees under the scratch dir, one proof at a
 * time machine-wide (a lock), cleaned up in `finally` and on a signal.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cleanEnv, git, gitOut, run, toplevel } from "./git";
import { type ProofTrailer, type TestRun, commitType, formatProofTrailer, judgeProof, parseBunTest, proofFiles, subjectOf } from "./lib";

export interface ProofOptions {
  repo: string;
  sha: string;
  /** commit type, which decides what counts as red; default: read from the commit's subject */
  type?: string;
  log?: (line: string) => void;
  scratch?: string;
  lockTimeoutMs?: number;
}

export type ProofResult = { ok: true; trailer: ProofTrailer } | { ok: false; kind: "infra" | "not-red" | "not-green" | "no-tests"; message: string };

export const scratchDir = (): string => process.env.PT_GUARDS_TMP ?? join(tmpdir(), "pt-guards");

// ── lock: one proof at a time, across worktrees and processes ───────────────

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Take the lock dir `<scratch>/proof.lock`; wait for a live holder, steal it from a dead one. Returns the release function. */
export async function acquireLock(scratch: string, timeoutMs: number, log: (s: string) => void = () => {}): Promise<() => void> {
  mkdirSync(scratch, { recursive: true });
  const dir = join(scratch, "proof.lock");
  const pidFile = join(dir, "pid");
  const deadline = Date.now() + timeoutMs;
  for (let announced = false; ; ) {
    try {
      mkdirSync(dir);
      writeFileSync(pidFile, String(process.pid));
      return () => rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    let holder = 0;
    try {
      holder = Number(readFileSync(pidFile, "utf8"));
    } catch {
      // lock dir exists but the pid isn't written yet (or the holder just left): retry
      try {
        if (Date.now() - statSync(dir).mtimeMs > 5_000) rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    if (holder && !alive(holder)) {
      log(`proof lock held by dead process ${holder}: taking it over`);
      rmSync(dir, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) throw new Error(`another red proof (pid ${holder || "?"}) is still running after ${Math.round(timeoutMs / 1000)}s`);
    if (!announced) log(`waiting for the running red proof (pid ${holder || "?"}) to finish…`);
    announced = true;
    await Bun.sleep(300);
  }
}

// ── one run of the tests in a worktree ──────────────────────────────────────

const ENV_FILES = [".env", "apps/web/.env", "apps/api/.env"];

/** `apps/api/src/a.test.ts` → package dir `apps/api` and path `./src/a.test.ts` inside it; root-level paths stay at the root. */
export function packageOf(path: string): { dir: string; rel: string } {
  const m = /^((?:apps|packages)\/[^/]+)\/(.+)$/.exec(path);
  return m ? { dir: m[1], rel: `./${m[2]}` } : { dir: "", rel: `./${path}` };
}

function sumRuns(runs: TestRun[]): TestRun {
  return runs.reduce<TestRun>(
    (a, r) => ({ exit: Math.max(a.exit, r.exit), pass: a.pass + r.pass, fail: a.fail + r.fail, skip: a.skip + r.skip, failedTests: a.failedTests + r.failedTests, loadErrors: a.loadErrors + r.loadErrors }),
    { exit: 0, pass: 0, fail: 0, skip: 0, failedTests: 0, loadErrors: 0 },
  );
}

/** Check out `rev` in a throwaway worktree, optionally overlay files from `overlayFrom`, and run the tests. */
function testsAt(o: { repo: string; scratch: string; label: string; rev: string; overlayFrom?: string; overlay: string[]; tests: string[]; log: (s: string) => void }): TestRun {
  const env = cleanEnv();
  const wt = join(o.scratch, `wt-${o.label}-${process.pid}`);
  try {
    const add = git(["worktree", "add", "--detach", "--force", wt, o.rev], { cwd: o.repo, env });
    if (!add.ok) throw new Error(`git worktree add failed: ${add.err.trim()}`);
    for (const f of ENV_FILES) {
      if (existsSync(join(o.repo, f))) copyFileSync(join(o.repo, f), join(wt, f));
    }
    if (existsSync(join(wt, "bun.lock"))) {
      o.log(`${o.label}: bun install`);
      // --ignore-scripts + CI: never run the repo's `prepare` (it would point core.hooksPath at this throwaway tree)
      const inst = run(["bun", "install", "--frozen-lockfile", "--ignore-scripts"], { cwd: wt, env: cleanEnv({ CI: "true" }), timeoutMs: 300_000 });
      if (!inst.ok) throw new Error(`bun install failed in the ${o.label} worktree:\n${(inst.err || inst.out).trim().split("\n").slice(-8).join("\n")}`);
    }
    if (o.overlayFrom) {
      for (const f of o.overlay) {
        const blob = Bun.spawnSync(["git", "show", `${o.overlayFrom}:${f}`], { cwd: o.repo, env, stdout: "pipe", stderr: "pipe" });
        if (blob.exitCode !== 0) throw new Error(`cannot read ${f} from ${o.overlayFrom}`);
        mkdirSync(dirname(join(wt, f)), { recursive: true });
        writeFileSync(join(wt, f), blob.stdout);
      }
    }
    const byPackage = new Map<string, string[]>();
    for (const t of o.tests) {
      const { dir, rel } = packageOf(t);
      byPackage.set(dir, [...(byPackage.get(dir) ?? []), rel]);
    }
    const runs: TestRun[] = [];
    for (const [dir, rels] of byPackage) {
      o.log(`${o.label}: bun test ${rels.join(" ")}${dir ? ` (in ${dir})` : ""}`);
      const r = run(["bun", "test", ...rels], { cwd: join(wt, dir), env: cleanEnv(), timeoutMs: 600_000 });
      runs.push(parseBunTest(`${r.out}\n${r.err}`, r.code));
    }
    return sumRuns(runs);
  } finally {
    git(["worktree", "remove", "--force", wt], { cwd: o.repo, env });
    rmSync(wt, { recursive: true, force: true });
    git(["worktree", "prune"], { cwd: o.repo, env });
  }
}

// ── the proof ───────────────────────────────────────────────────────────────

export async function runProof(o: ProofOptions): Promise<ProofResult> {
  const log = o.log ?? (() => {});
  const scratch = o.scratch ?? scratchDir();
  const env = cleanEnv();
  const parent = gitOut(["rev-parse", `${o.sha}^`], { cwd: o.repo, env });
  if (!parent) return { ok: false, kind: "infra", message: `${o.sha} has no parent commit to compare against` };
  const type = o.type ?? commitType(subjectOf(git(["log", "-1", "--format=%B", o.sha], { cwd: o.repo, env }).out)) ?? "fix";

  const changed = git(["diff-tree", "-r", "--no-commit-id", "--name-status", "--no-renames", "-z", parent, o.sha], { cwd: o.repo, env })
    .out.split("\0")
    .filter(Boolean);
  const entries: { status: string; path: string }[] = [];
  for (let i = 0; i + 1 < changed.length; i += 2) entries.push({ status: changed[i][0], path: changed[i + 1] });
  const { tests, support } = proofFiles(entries);
  if (!tests.length) {
    return { ok: false, kind: "no-tests", message: "the commit adds or changes no test file, so there is nothing to prove. Add a test that fails before the fix, or add a `Red-Proof-Exempt: <ui-only|copy|config|no-harness> <why>` trailer." };
  }

  let release: () => void;
  try {
    release = await acquireLock(scratch, o.lockTimeoutMs ?? 600_000, log);
  } catch (e) {
    return { ok: false, kind: "infra", message: (e as Error).message };
  }
  const cleanup = () => {
    // a signal can land mid-run: drop any worktree of ours, then the lock
    git(["worktree", "prune"], { cwd: o.repo, env });
    release();
  };
  const onSignal = () => {
    cleanup();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    const base = { repo: o.repo, scratch, log, tests };
    log(`proving ${tests.join(", ")} (parent ${parent.slice(0, 8)})`);
    const red = testsAt({ ...base, label: "red", rev: parent, overlayFrom: o.sha, overlay: [...tests, ...support] });
    const green = testsAt({ ...base, label: "green", rev: o.sha, overlay: [] });
    const verdict = judgeProof(type, red, green);
    if (!verdict.ok) return { ok: false, kind: verdict.kind!, message: `${verdict.message} (red: ${red.pass} pass ${red.fail} fail ${red.skip} skip; green: ${green.pass} pass ${green.fail} fail ${green.skip} skip)` };
    return { ok: true, trailer: { files: tests, red: red.failedTests, green: green.fail, parent: parent.slice(0, 8) } };
  } catch (e) {
    return { ok: false, kind: "infra", message: (e as Error).message };
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    cleanup();
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const repo = toplevel() ?? process.cwd();
  const log = (s: string) => console.error(`red-proof: ${s}`);
  let staged = false;
  let sha: string | undefined;
  let parent = "HEAD";
  let type: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--staged") staged = true;
    else if (args[i] === "--parent") parent = args[++i];
    else if (args[i] === "--type") type = args[++i];
    else if (!args[i].startsWith("--")) sha = args[i];
  }

  if (staged) {
    // Turn the index into a throwaway commit object (dangling; git gc collects it) so the proof sees it like any commit.
    const tree = gitOut(["write-tree"]);
    const made = tree ? git(["-c", "user.name=guards", "-c", "user.email=guards@localhost", "commit-tree", tree, "-p", parent, "-m", "red-proof: staged"], { env: cleanEnv() }) : null;
    if (!made?.ok) {
      console.error("red-proof: could not snapshot the staged files");
      process.exit(2);
    }
    sha = made.out.trim();
  }
  if (!sha) {
    console.error("usage: red-proof.ts <sha> | --staged [--parent <rev>] [--type <type>]");
    process.exit(2);
  }
  const result = await runProof({ repo, sha, type, log });
  if (result.ok) {
    console.log(formatProofTrailer(result.trailer));
    process.exit(0);
  }
  console.error(`red-proof: ${result.message}`);
  process.exit(result.kind === "infra" ? 2 : 1);
}
