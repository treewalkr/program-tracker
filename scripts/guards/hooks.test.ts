import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The shims in scripts/githooks, driven the way git drives them, in a throwaway repo.
const hooks = join(import.meta.dir, "..", "githooks");
const root = mkdtempSync(join(tmpdir(), "pt-hooks-test-"));
const repo = join(root, "repo");

const env = (extra: Record<string, string> = {}): Record<string, string> => {
  const base = { ...(process.env as Record<string, string>) };
  delete base.CI; // the suite may itself run under CI
  return { ...base, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", PT_GUARDS_TMP: join(root, "scratch"), ...extra };
};
const git = (args: string[], extra: Record<string, string> = {}) => {
  const p = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe", env: env(extra) });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};
const put = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (msg: string, extra: Record<string, string> = {}) => git(["commit", "-q", "-m", msg], extra);

beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "t"]);
  git(["config", "user.email", "t@t.t"]);
  put(".gitignore", "COMMITS.md\n.env*\n!.env.example\n");
  put("CHANGELOG.md", "## Unreleased\n");
  git(["add", "-A"]);
  expect(commit("chore: init").code).toBe(0);
  git(["config", "core.hooksPath", hooks]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("commit-msg shim", () => {
  test("red: a free-form message is refused and nothing is committed", () => {
    put("a.txt", "a");
    git(["add", "a.txt"]);
    const r = commit("Update the thing");
    expect(r.code).toBe(1);
    expect(r.err).toContain("[format]");
    expect(git(["log", "--oneline"]).out.trim().split("\n")).toHaveLength(1);
  });
  test("red: Co-Authored-By", () => {
    const r = git(["commit", "-q", "-m", "chore: a", "-m", "Co-Authored-By: x <x@y.z>"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("[co-authored-by]");
  });
  test("green: a conforming message commits", () => {
    expect(commit("chore: add a").code).toBe(0);
  });
  test("red: --no-verify gets through git itself (the Claude hook and CI are what stop it)", () => {
    put("b.txt", "b");
    git(["add", "b.txt"]);
    expect(git(["commit", "-q", "--no-verify", "-m", "whatever"]).code).toBe(0);
  });
  test("CI=true: every hook is a no-op", () => {
    put("c.txt", "c");
    git(["add", "c.txt"]);
    expect(commit("not conventional", { CI: "true" }).code).toBe(0);
  });
});

describe("post-commit shim", () => {
  test("writes the ignored COMMITS.md", () => {
    expect(commit("chore: one more").code).toBe(1); // nothing staged
    put("d.txt", "d");
    git(["add", "d.txt"]);
    expect(commit("chore: add d").code).toBe(0);
    expect(readFileSync(join(repo, "COMMITS.md"), "utf8")).toContain("chore: add d");
    expect(git(["status", "--porcelain"]).out).toBe("");
  });
});

describe("pre-commit shim", () => {
  test("red: a forbidden path", () => {
    put(".env", "SECRET=1");
    git(["add", "-f", ".env"]);
    const r = commit("chore: env");
    expect(r.code).toBe(1);
    expect(r.err).toContain("[forbidden-path]");
    git(["rm", "-q", "--cached", ".env"]);
    rmSync(join(repo, ".env"));
  });
  test("red: a hand-rolled select in a route; green: the same file with the escape", () => {
    put("apps/web/src/routes/x/+page.svelte", "<select></select>\n");
    git(["add", "-A"]);
    const r = commit("feat(app): add x");
    expect(r.code).toBe(1);
    expect(r.err).toContain("[raw-select]");
    put("apps/web/src/routes/x/+page.svelte", "<select></select> <!-- guard-ok: raw-controls fixture -->\n");
    git(["add", "-A"]);
    expect(commit("feat(app): add x").code).toBe(0);
  });
  test("red: a legacy $: statement", () => {
    put("apps/web/src/lib/Y.svelte", "<script>\n  $: x = 1;\n</script>\n");
    git(["add", "-A"]);
    expect(commit("feat(app): add y").err).toContain("[runes]");
    git(["reset", "-q"]);
    rmSync(join(repo, "apps/web/src/lib/Y.svelte"));
  });
  test("red: editing a migration that is in the last release tag", () => {
    put("packages/db/drizzle/0050_old.sql", "ALTER TABLE a ADD COLUMN c text;\n");
    git(["add", "-A"]);
    expect(commit("feat: add migration").code).toBe(0);
    git(["tag", "-a", "v0.1.0", "-m", "v0.1.0"]);
    put("packages/db/drizzle/0050_old.sql", "ALTER TABLE a ADD COLUMN c text; -- edited\n");
    git(["add", "-A"]);
    const r = commit("fix: edit it");
    expect(r.code).toBe(1);
    expect(r.err).toContain("[migration-immutable]");
    git(["checkout", "-q", "--", "."]);
    git(["reset", "-q", "--hard"]);
  });
});

test("the shims are executable and the helper exists", () => {
  for (const h of ["commit-msg", "pre-commit", "post-commit"]) {
    expect(existsSync(join(hooks, h))).toBe(true);
    expect(Bun.spawnSync(["test", "-x", join(hooks, h)]).exitCode).toBe(0);
  }
});
