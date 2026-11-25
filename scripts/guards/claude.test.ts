import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Env, type HookInput, handle } from "./claude";

const env = (over: Partial<Env> = {}): Env => ({
  root: "/repo",
  branch: () => "main",
  dirty: () => false,
  released: () => new Set(["packages/db/drizzle/0050_old.sql"]),
  read: () => null,
  baseline: {},
  ...over,
});
const bash = (command: string, extra: Partial<HookInput> = {}): HookInput => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, ...extra });

describe("claude hook: PreToolUse Bash", () => {
  test("red: --no-verify blocks, with a reason", () => {
    expect(handle(bash("git commit --no-verify -m x"), env()).block).toContain("skips the guards");
  });
  test("green: an ordinary command passes", () => {
    expect(handle(bash("git status"), env())).toEqual({});
  });
  test("red: the subagent ban applies only when agent_id is present", () => {
    expect(handle(bash("git push origin main", { agent_id: "a1" }), env()).block).toContain("subagents never push");
    expect(handle(bash("git push origin main"), env())).toEqual({});
  });
  test("red: reset --hard on a dirty main; green when clean", () => {
    expect(handle(bash("git reset --hard origin/main"), env({ dirty: () => true })).block).toContain("uncommitted");
    expect(handle(bash("git reset --hard origin/main"), env())).toEqual({});
  });
});

describe("claude hook: Edit/Write", () => {
  const edit = (file_path: string, event = "PreToolUse", tool_name = "Edit"): HookInput => ({ hook_event_name: event, tool_name, tool_input: { file_path } });
  test("red: .env, COMMITS.md, a released migration", () => {
    expect(handle(edit("/repo/apps/web/.env"), env()).block).toBeDefined();
    expect(handle(edit("/repo/COMMITS.md", "PreToolUse", "Write"), env()).block).toBeDefined();
    expect(handle(edit("/repo/packages/db/drizzle/0050_old.sql"), env()).block).toContain("released migration");
  });
  test("green: source, a new migration, a file outside the repo", () => {
    expect(handle(edit("/repo/apps/api/src/a.ts"), env())).toEqual({});
    expect(handle(edit("/repo/packages/db/drizzle/0099_new.sql"), env())).toEqual({});
    expect(handle(edit("/elsewhere/.env"), env())).toEqual({});
  });
  test("PostToolUse: a legacy .svelte edit comes back as context, never a block", () => {
    const out = handle(edit("/repo/apps/web/src/lib/A.svelte", "PostToolUse"), env({ read: () => "<script>\n  export let x;\n</script>" }));
    expect(out.block).toBeUndefined();
    expect(out.context).toContain("legacy props");
  });
  test("PostToolUse: a clean .svelte file gives nothing", () => {
    expect(handle(edit("/repo/apps/web/src/lib/A.svelte", "PostToolUse"), env({ read: () => "<script>let { x } = $props();</script>" }))).toEqual({});
  });
});

describe("claude hook: process", () => {
  const entry = join(import.meta.dir, "claude.ts");
  const call = (input: object, project?: string) => {
    const p = Bun.spawnSync(["bun", entry], { stdin: new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe", env: { ...process.env, ...(project ? { CLAUDE_PROJECT_DIR: project } : {}) } });
    return { code: p.exitCode, err: p.stderr.toString(), out: p.stdout.toString() };
  };
  const repoRoot = join(import.meta.dir, "..", "..");
  test("red: exits 2 and says why", () => {
    const r = call({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git commit -n -m x" }, cwd: repoRoot }, repoRoot);
    expect(r.code).toBe(2);
    expect(r.err).toContain("Guards blocked");
  });
  test("green: exits 0 for a harmless call", () => {
    expect(call({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: repoRoot }, repoRoot).code).toBe(0);
  });
  test("a project without scripts/guards/claude.ts is left alone, even for a blocked command", () => {
    const other = mkdtempSync(join(tmpdir(), "pt-claude-test-"));
    try {
      expect(call({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" }, cwd: other }, other).code).toBe(0);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
  test("garbage on stdin never blocks", () => {
    const p = Bun.spawnSync(["bun", entry], { stdin: new TextEncoder().encode("not json"), stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
  });
});
