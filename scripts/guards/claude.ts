/**
 * Claude Code hook entry (PreToolUse / PostToolUse). Reads the hook JSON on stdin; exit 2 with
 * the reason on stderr blocks the tool call. Installed in ~/.claude/settings.json (see README.md),
 * so it runs only when $CLAUDE_PROJECT_DIR has this file — a no-op in any other repo.
 *
 *   PreToolUse   Bash        the bypasses (--no-verify, core.hooksPath), force-push/reset of main,
 *                            and, inside a subagent, push/release/pg_dump/.env reads
 *   PreToolUse   Edit/Write  .env*, COMMITS.md, released migrations
 *   PostToolUse  Edit/Write  on .svelte: the runes and raw-control rules as feedback (never blocks)
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { git, gitOut, lastReleaseTag, releasedMigrations, toplevel } from "./git";
import { type Baseline, checkBashCommand, checkClaudePath, svelteFeedback } from "./lib";

export interface HookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string; file_path?: string; notebook_path?: string };
  /** present when the call comes from a subagent */
  agent_id?: string;
  cwd?: string;
}

export interface Outcome {
  block?: string;
  context?: string;
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

export interface Env {
  /** repo root and a way to ask git/disk about it; replaced in tests */
  root: string;
  branch(): string | null;
  dirty(): boolean;
  released(): Set<string>;
  read(relPath: string): string | null;
  baseline: Baseline;
}

export function handle(input: HookInput, env: Env): Outcome {
  const tool = input.tool_name ?? "";
  const event = input.hook_event_name ?? "";
  if (event === "PreToolUse" && tool === "Bash") {
    const command = input.tool_input?.command ?? "";
    const needsState = /\breset\b/.test(command);
    const found = checkBashCommand(command, { subagent: !!input.agent_id, branch: needsState ? env.branch() : null, dirty: needsState ? env.dirty() : false });
    return found.length ? { block: found.map((x) => x.message).join("\n") } : {};
  }
  if (EDIT_TOOLS.has(tool)) {
    const abs = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (!abs) return {};
    const rel = isAbsolute(abs) ? relative(env.root, abs) : abs;
    if (rel.startsWith("..")) return {};
    if (event === "PreToolUse") {
      const found = checkClaudePath(rel, /^packages\/db\/drizzle\/.*\.sql$/.test(rel) ? env.released() : new Set());
      return found.length ? { block: found.map((x) => x.message).join("\n") } : {};
    }
    if (event === "PostToolUse" && rel.endsWith(".svelte")) {
      const content = env.read(rel);
      const msg = content === null ? null : svelteFeedback(rel, content, env.baseline);
      return msg ? { context: msg } : {};
    }
  }
  return {};
}

if (import.meta.main) {
  let input: HookInput = {};
  try {
    input = JSON.parse(await Bun.stdin.text());
  } catch {
    process.exit(0); // not hook JSON: never get in the way
  }
  const project = process.env.CLAUDE_PROJECT_DIR;
  // Only in this repo: no project dir, or one without the guards, is a no-op.
  if (!project || !existsSync(join(project, "scripts/guards/claude.ts"))) process.exit(0);
  const cwd = input.cwd ?? project ?? process.cwd();
  const root = toplevel(cwd) ?? cwd;
  const env: Env = {
    root,
    branch: () => gitOut(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root }),
    dirty: () => !!git(["status", "--porcelain"], { cwd: root }).out.trim(),
    released: () => releasedMigrations(lastReleaseTag("HEAD", { cwd: root }), { cwd: root }),
    read: (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null),
    baseline: JSON.parse(readFileSync(join(import.meta.dir, "baseline.json"), "utf8")),
  };
  const out = handle(input, env);
  if (out.block) {
    console.error(`Guards blocked this ${input.tool_name} call:\n${out.block}`);
    process.exit(2);
  }
  if (out.context) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: out.context } }));
}
