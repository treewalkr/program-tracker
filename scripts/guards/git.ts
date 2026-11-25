/** Thin git/process helpers shared by the guard entry points. All I/O lives here and in the entry points; rules live in lib.ts. */
import { VERSION_TAG, type StagedFile } from "./lib";

export interface Run {
  ok: boolean;
  code: number;
  out: string;
  err: string;
}

export interface GitOptions {
  cwd?: string;
  /** Environment for the child; default is ours. Use `cleanEnv()` to drop the hook's GIT_* variables. */
  env?: Record<string, string | undefined>;
  input?: string;
}

export function run(cmd: string[], opts: GitOptions & { timeoutMs?: number } = {}): Run {
  const p = Bun.spawnSync(cmd, {
    cwd: opts.cwd,
    env: opts.env as Record<string, string> | undefined,
    stdin: opts.input === undefined ? "ignore" : new TextEncoder().encode(opts.input),
    stdout: "pipe",
    stderr: "pipe",
    timeout: opts.timeoutMs,
  });
  return { ok: p.exitCode === 0, code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
}

export const git = (args: string[], opts: GitOptions = {}): Run => run(["git", ...args], opts);

/** Trimmed stdout of a git command, or null if it failed. */
export function gitOut(args: string[], opts: GitOptions = {}): string | null {
  const r = git(args, opts);
  return r.ok ? r.out.trim() : null;
}

/** Our environment without the GIT_* variables git sets for a hook (index file, dir…), so a nested git call acts on the repo it is pointed at. */
export function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, val] of Object.entries(process.env)) if (val !== undefined && !k.startsWith("GIT_")) env[k] = val;
  return { ...env, ...extra };
}

export const toplevel = (cwd?: string): string | null => gitOut(["rev-parse", "--show-toplevel"], { cwd });

/** The release tag before (or at) `rev`; `before: true` skips a tag that sits on `rev` itself. */
export function lastReleaseTag(rev = "HEAD", opts: GitOptions & { before?: boolean } = {}): string | null {
  const tag = gitOut(["describe", "--tags", "--abbrev=0", "--match", "v*", rev], opts);
  if (!tag || !VERSION_TAG.test(tag)) return null;
  if (opts.before) {
    const onRev = gitOut(["rev-parse", `${tag}^{commit}`], opts) === gitOut(["rev-parse", `${rev}^{commit}`], opts);
    if (onRev) {
      const prev = gitOut(["describe", "--tags", "--abbrev=0", "--match", "v*", `${rev}^`], opts);
      return prev && VERSION_TAG.test(prev) ? prev : null;
    }
  }
  return tag;
}

/** `packages/db/drizzle/*.sql` as they stand at `tag`. */
export function releasedMigrations(tag: string | null, opts: GitOptions = {}): Set<string> {
  if (!tag) return new Set();
  const out = gitOut(["ls-tree", "-r", "--name-only", tag, "--", "packages/db/drizzle"], opts) ?? "";
  return new Set(out.split("\n").filter((p) => p.endsWith(".sql")));
}

export interface NameStatus {
  status: string;
  path: string;
}

/** `-z` name-status output → entries. Renames are off, so every line is one path. */
export function parseNameStatus(z: string): NameStatus[] {
  const parts = z.split("\0").filter((p) => p !== "");
  const out: NameStatus[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push({ status: parts[i][0], path: parts[i + 1] });
  return out;
}

/** Files changed by the commit about to be made: the index against `parent` (default HEAD). */
export function stagedChanges(parent = "HEAD", opts: GitOptions = {}): NameStatus[] {
  return parseNameStatus(git(["diff", "--cached", "--name-status", "--no-renames", "-z", parent], opts).out);
}

/** Files a commit changed against its first parent (or against nothing, for a root commit). */
export function commitChanges(sha: string, opts: GitOptions = {}): NameStatus[] {
  return parseNameStatus(git(["diff-tree", "--root", "-r", "--no-commit-id", "--name-status", "--no-renames", "-z", sha], opts).out);
}

/** Staged files with their staged content (read only for the types a rule looks at). */
export function stagedFiles(changes: NameStatus[], wants: (path: string) => boolean, opts: GitOptions = {}): StagedFile[] {
  return changes.map((c) => {
    const status = (c.status === "A" || c.status === "D" ? c.status : "M") as StagedFile["status"];
    if (status === "D" || !wants(c.path)) return { path: c.path, status };
    const r = git(["show", `:${c.path}`], opts);
    return { path: c.path, status, content: r.ok ? r.out : undefined };
  });
}

export function report(title: string, violations: { rule: string; message: string }[]): void {
  console.error(`\n${title}: ${violations.length} problem${violations.length === 1 ? "" : "s"}\n`);
  for (const x of violations) console.error(`  ✗ [${x.rule}] ${x.message.replace(/\n/g, "\n    ")}\n`);
}
