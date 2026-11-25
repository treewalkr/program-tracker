import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { acquireLock, packageOf, runProof } from "./red-proof";

const root = mkdtempSync(join(tmpdir(), "pt-redproof-test-"));
const scratch = join(root, "scratch");
const repo = join(root, "repo");

const sh = (cmd: string[], cwd = repo) => {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  if (p.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${p.stderr.toString()}`);
  return p.stdout.toString().trim();
};
const put = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
/** Commit the working tree; returns the sha. */
const commit = (msg: string) => {
  sh(["git", "add", "-A"]);
  sh(["git", "-c", "user.name=t", "-c", "user.email=t@t.t", "commit", "-q", "-m", msg]);
  return sh(["git", "rev-parse", "HEAD"]);
};

const BUGGY = "export const add = (a: number, b: number) => a - b;\n";
const FIXED = "export const add = (a: number, b: number) => a + b;\n";
const TEST = `import { expect, test } from "bun:test";\nimport { add } from "./math";\ntest("adds", () => { expect(add(2, 3)).toBe(5); });\n`;

let base: string;
beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  sh(["git", "init", "-q", "-b", "main"]);
  put("apps/api/src/math.ts", BUGGY);
  put("apps/api/src/other.ts", "export const one = () => 1;\n");
  base = commit("chore: base");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const prove = (sha: string, type = "fix") => runProof({ repo, sha, type, scratch, lockTimeoutMs: 2000 });
const worktrees = () => sh(["git", "worktree", "list", "--porcelain"]).split("\n").filter((l) => l.startsWith("worktree ")).length;
const leftovers = () => (existsSync(scratch) ? readdirSync(scratch) : []);

describe("red proof runner", () => {
  test("green: a fix whose test fails on the parent and passes on the commit", async () => {
    put("apps/api/src/math.ts", FIXED);
    put("apps/api/src/math.test.ts", TEST);
    const sha = commit("fix(api): add adds");
    const r = await prove(sha);
    expect(r).toMatchObject({ ok: true, trailer: { red: 1, green: 0, files: ["apps/api/src/math.test.ts"], parent: base.slice(0, 8) } });
  });

  test("cleans up: no worktree or lock left behind", () => {
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  test("red: a fake whose test was already green on the parent", async () => {
    // math.ts already correct at HEAD; this commit adds a test of existing behaviour only
    put("apps/api/src/other.test.ts", `import { expect, test } from "bun:test";\nimport { one } from "./other";\ntest("one", () => { expect(one()).toBe(1); });\n`);
    put("apps/api/src/other.ts", "export const one = () => 1; // tidied\n");
    const r = await prove(commit("fix(api): tidy other"));
    expect(r).toMatchObject({ ok: false, kind: "not-red" });
    expect(worktrees()).toBe(1);
  });

  test("red: a fix whose test only fails to load (new export) is not a proof", async () => {
    put("apps/api/src/other.ts", "export const one = () => 1;\nexport const two = () => 2;\n");
    put("apps/api/src/two.test.ts", `import { expect, test } from "bun:test";\nimport { two } from "./other";\ntest("two", () => { expect(two()).toBe(2); });\n`);
    const sha = commit("fix(api): add two");
    expect(await prove(sha)).toMatchObject({ ok: false, kind: "not-red" });
    // the same commit as a feat: a load failure counts as red
    expect(await prove(sha, "feat")).toMatchObject({ ok: true });
  });

  test("red: no test in the commit", async () => {
    put("apps/api/src/other.ts", "export const one = () => 1;\nexport const two = () => 2; // x\n");
    expect(await prove(commit("fix(api): no test"))).toMatchObject({ ok: false, kind: "no-tests" });
  });

  test("error, not green: every test skipped", async () => {
    put("apps/api/src/math.test.ts", TEST.replace('test("adds"', 'test.skip("adds"'));
    put("apps/api/src/math.ts", FIXED + "// touched\n");
    const r = await prove(commit("fix(api): skip it"));
    expect(r).toMatchObject({ ok: false, kind: "infra" });
    expect(worktrees()).toBe(1);
  });

  test("red: still failing after the fix", async () => {
    put("apps/api/src/math.test.ts", TEST.replace("toBe(5)", "toBe(6)"));
    expect(await prove(commit("fix(api): wrong expectation"))).toMatchObject({ ok: false, kind: "not-green" });
  });
});

describe("proof lock", () => {
  test("a live holder blocks a second proof until the timeout", async () => {
    const lockDir = join(root, "lock-live");
    const release = await acquireLock(lockDir, 1000);
    await expect(acquireLock(lockDir, 400)).rejects.toThrow("still running");
    release();
    const again = await acquireLock(lockDir, 400);
    again();
  });
  test("a dead holder's lock is taken over", async () => {
    const lockDir = join(root, "lock-dead");
    mkdirSync(join(lockDir, "proof.lock"), { recursive: true });
    writeFileSync(join(lockDir, "proof.lock", "pid"), "999999");
    const release = await acquireLock(lockDir, 1000);
    release();
    expect(existsSync(join(lockDir, "proof.lock"))).toBe(false);
  });
});

test("packageOf: workspace package dir and a path inside it", () => {
  expect(packageOf("apps/api/src/a.test.ts")).toEqual({ dir: "apps/api", rel: "./src/a.test.ts" });
  expect(packageOf("scripts/guards/lib.test.ts")).toEqual({ dir: "", rel: "./scripts/guards/lib.test.ts" });
});
