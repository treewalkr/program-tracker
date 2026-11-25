import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ProofResult } from "./red-proof";
import { GUARDS_SINCE, commitsToCheck, verify } from "./verify-range";

const root = mkdtempSync(join(tmpdir(), "pt-verify-test-"));
const repo = join(root, "repo");
let clock = 1_700_000_000;
const tick = () => `${(clock += 100)} +0000`;

const sh = (cmd: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...env } });
  if (p.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${p.stderr.toString()}`);
  return p.stdout.toString().trim();
};
const put = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (msg: string, file = "f.txt", date = tick()) => {
  put(file, `${msg}\n${date}`);
  sh(["git", "add", "-A"]);
  sh(["git", "-c", "user.name=t", "-c", "user.email=t@t.t", "commit", "-q", "-m", msg], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  return sh(["git", "rev-parse", "HEAD"]);
};

const shas: Record<string, string> = {};
let tagged: string;

beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  sh(["git", "init", "-q", "-b", "main"]);
  shas.old = commit("old style message that predates the guards");
  sh(["git", "branch", "side"]);
  shas.oldTip = commit("another old one");
  tagged = shas.oldTip;
  sh(["git", "tag", GUARDS_SINCE]);
  shas.good = commit("chore: a good one");
  shas.bad = commit("did a thing");
  shas.fixNoProof = commit("fix(api): no proof", "apps/api/src/a.ts");
  shas.fixExempt = commit("fix(api): copy only\n\nRed-Proof-Exempt: copy wording", "apps/api/src/b.ts");
  shas.fixFake = commit("fix(api): hand typed\n\nRed-Proof: apps/api/src/c.test.ts 1 fail -> 0 fail @ deadbeef", "apps/api/src/c.ts");
  shas.fixReal = commit("fix(api): proven\n\nRed-Proof: apps/api/src/d.test.ts 1 fail -> 0 fail @ cafebabe", "apps/api/src/d.ts");
  // a side branch started before the tag with an old-dated commit, merged after it
  sh(["git", "checkout", "-q", "side"]);
  shas.side = commit("an old branch commit, not reachable from the tag", "side.txt", `${1_699_000_000} +0000`);
  sh(["git", "checkout", "-q", "main"]);
  sh(["git", "-c", "user.name=t", "-c", "user.email=t@t.t", "merge", "-q", "--no-ff", "side", "-m", "Merge branch 'side'"], { GIT_AUTHOR_DATE: tick(), GIT_COMMITTER_DATE: tick() });
  shas.merge = sh(["git", "rev-parse", "HEAD"]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const proveByTrailer = async (sha: string): Promise<ProofResult> =>
  sha === shas.fixReal ? { ok: true, trailer: { files: ["apps/api/src/d.test.ts"], red: 1, green: 0, parent: "cafebabe" } } : { ok: false, kind: "not-red", message: "the tests are not red before the fix" };

describe("commitsToCheck", () => {
  test("skips what the floor tag covers, merges, and old-dated commits; oldest first", () => {
    const got = commitsToCheck(repo, tagged, "HEAD", GUARDS_SINCE);
    expect(got).toEqual([shas.good, shas.bad, shas.fixNoProof, shas.fixExempt, shas.fixFake, shas.fixReal]);
  });
  test("a missing, zero or unknown base checks only the head", () => {
    expect(commitsToCheck(repo, "0".repeat(40), shas.fixReal, GUARDS_SINCE)).toEqual([shas.fixReal]);
    expect(commitsToCheck(repo, undefined, shas.fixReal, GUARDS_SINCE)).toEqual([shas.fixReal]);
    expect(commitsToCheck(repo, "f".repeat(40), shas.fixReal, GUARDS_SINCE)).toEqual([shas.fixReal]);
  });
  test("head on the floor, or a merge as head: nothing to check", () => {
    expect(commitsToCheck(repo, undefined, tagged, GUARDS_SINCE)).toEqual([]);
    expect(commitsToCheck(repo, undefined, shas.merge, GUARDS_SINCE)).toEqual([]);
  });
  test("a whole-history range never reaches before the tag", () => {
    expect(commitsToCheck(repo, shas.old, "HEAD", GUARDS_SINCE)).not.toContain(shas.oldTip);
  });
});

describe("verify", () => {
  test("red and green findings per commit", async () => {
    const found = await verify({ repo, base: tagged, head: "HEAD", prove: proveByTrailer });
    const by = Object.fromEntries(found.map((f) => [f.sha, f]));
    expect(by[shas.good].violations).toEqual([]);
    expect(by[shas.bad].violations.map((x) => x.rule)).toEqual(["format"]);
    expect(by[shas.fixNoProof].violations.map((x) => x.rule)).toEqual(["red-proof"]);
    expect(by[shas.fixExempt].violations).toEqual([]);
    expect(by[shas.fixExempt].exempt).toEqual({ reason: "copy", text: "wording" });
    expect(by[shas.fixFake].violations.map((x) => x.rule)).toEqual(["red-proof"]);
    expect(by[shas.fixFake].violations[0].message).toContain("does not reproduce");
    expect(by[shas.fixReal].violations).toEqual([]);
    expect(by[shas.fixReal].proof).toContain("Red-Proof:");
  });
});

describe("verify-range CLI", () => {
  const cli = (args: string[]) => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "verify-range.ts"), ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    return { code: p.exitCode, out: p.stdout.toString() };
  };
  test("enforcing with the tag: a bad commit fails the run", () => {
    const r = cli([`${tagged}..${shas.bad}`]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[format]");
  });
  test("a range of only good commits passes", () => {
    const r = cli([tagged, shas.good]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("1 commit(s) checked");
  });
  test("--warn reports but never fails", () => {
    expect(cli([tagged, shas.bad, "--warn"]).code).toBe(0);
  });
  test("without the guards-v1 tag it only warns", () => {
    sh(["git", "tag", "-d", GUARDS_SINCE]);
    const r = cli(["0".repeat(40), shas.bad]);
    sh(["git", "tag", GUARDS_SINCE, tagged]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("warn-only");
    expect(r.out).toContain("[format]");
  });
});
