/**
 * CI: re-check the commits a push or PR adds, since git hooks can be skipped.
 *
 *   bun scripts/guards/verify-range.ts <base> <head> [--warn]
 *
 * Checks every non-merge commit in base..head: the message rules, the red-proof rule, and, for a
 * commit carrying a `Red-Proof:` trailer, re-runs the proof so a hand-typed or `--no-verify`
 * trailer that doesn't reproduce fails. Exemptions are listed in the log and the job summary.
 *
 * Never checks history from before the guards: commits reachable from the tag GUARDS_SINCE, or
 * dated at or before it, are skipped. Without that tag it only warns (exit 0). A missing, empty
 * or all-zero <base> (a new branch, a force-push, the first push) checks just <head>.
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { commitChanges, git, gitOut, toplevel } from "./git";
import { type Violation, checkMessage, parseProofTrailer, proofStatus, proofTrailers } from "./lib";
import type { ProofResult } from "./red-proof";

/** The tag the guards were merged at; nothing at or before it is ever checked. */
export const GUARDS_SINCE = "guards-v1";

export interface Finding {
  sha: string;
  subject: string;
  violations: Violation[];
  exempt?: { reason: string; text: string };
  proof?: string;
}

export interface VerifyOptions {
  repo: string;
  base: string | null | undefined;
  head: string;
  /** Re-run a commit's proof; default shells out to red-proof.ts. */
  prove?: (sha: string) => Promise<ProofResult>;
  floorTag?: string;
}

/** Commits to check, oldest first: base..head (or just head), no merges, nothing the floor tag covers. */
export function commitsToCheck(repo: string, base: string | null | undefined, head: string, floorTag: string): string[] {
  const opts = { cwd: repo };
  const floorSha = gitOut(["rev-parse", "-q", "--verify", `refs/tags/${floorTag}^{commit}`], opts);
  const floorTime = floorSha ? Number(gitOut(["log", "-1", "--format=%ct", floorSha], opts)) : 0;
  const haveBase = !!base && !/^0+$/.test(base) && git(["cat-file", "-e", `${base}^{commit}`], opts).ok;
  // head alone: `-1` after `--no-merges` would walk back past a merge, so the result is pinned to head below
  const range = haveBase ? [`${base}..${head}`] : ["-1", head];
  const headSha = gitOut(["rev-parse", `${head}^{commit}`], opts);
  const out = git(["rev-list", "--no-merges", "--reverse", "--format=%H %ct", ...range, ...(floorSha ? ["--not", floorSha] : [])], opts).out;
  return out
    .split("\n")
    .filter((l) => /^[0-9a-f]{40} \d+$/.test(l))
    .map((l) => l.split(" "))
    .filter(([sha, ct]) => Number(ct) > floorTime && (haveBase || sha === headSha))
    .map(([sha]) => sha);
}

export async function verify(o: VerifyOptions): Promise<Finding[]> {
  const opts = { cwd: o.repo };
  const prove = o.prove ?? defaultProve(o.repo);
  const findings: Finding[] = [];
  for (const sha of commitsToCheck(o.repo, o.base, o.head, o.floorTag ?? GUARDS_SINCE)) {
    const message = git(["log", "-1", "--format=%B", sha], opts).out;
    const files = commitChanges(sha, opts).map((c) => c.path);
    const subject = message.split("\n")[0];
    const violations: Violation[] = checkMessage(message, { final: true });
    const { status, violations: pv } = proofStatus(message, files);
    violations.push(...pv);
    const { proof, exempt } = proofTrailers(message);
    const finding: Finding = { sha, subject, violations };
    if (exempt && !pv.length) finding.exempt = exempt;
    if (proof) {
      if (!parseProofTrailer(proof)) violations.push({ rule: "red-proof", message: `malformed Red-Proof trailer: ${proof}` });
      else {
        const r = await prove(sha);
        if (!r.ok) violations.push({ rule: "red-proof", message: `the Red-Proof trailer does not reproduce: ${r.message}` });
        else finding.proof = proof;
      }
    } else if (status === "needs-proof" && !pv.length) {
      violations.push({ rule: "red-proof", message: "a fix: that changes behaviour needs a Red-Proof trailer (commit with the hooks on: `bun install` sets them up) or `Red-Proof-Exempt: <ui-only|copy|config|no-harness> <why>`" });
    }
    findings.push(finding);
  }
  return findings;
}

function defaultProve(repo: string): (sha: string) => Promise<ProofResult> {
  return async (sha) => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "red-proof.ts"), sha], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    process.stderr.write(p.stderr.toString());
    if (p.exitCode === 0) return { ok: true, trailer: parseProofTrailer(p.stdout.toString().trim())! };
    return { ok: false, kind: p.exitCode === 2 ? "infra" : "not-red", message: p.stderr.toString().trim().split("\n").pop() ?? "the proof failed" };
  };
}

/** How many `guard-ok:` escapes the tree at `head` carries (apps/packages/scripts, minus the guards' own files). */
export function countEscapes(repo: string, head: string): number {
  const r = git(["grep", "-c", "-F", "guard-ok:", head, "--", "apps", "packages", "scripts", ":(exclude)scripts/guards"], { cwd: repo });
  return r.out
    .split("\n")
    .map((l) => Number(l.split(":").pop()))
    .filter((n) => n > 0)
    .reduce((a, b) => a + b, 0);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const warnFlag = args.includes("--warn");
  const [first, second] = args.filter((a) => !a.startsWith("--"));
  const ranged = first?.includes("..") ? first.split("..") : null;
  const base = ranged ? ranged[0] : first;
  const head = (ranged ? ranged[1] : second) || "HEAD";
  const repo = toplevel() ?? process.cwd();
  const floor = gitOut(["rev-parse", "-q", "--verify", `refs/tags/${GUARDS_SINCE}^{commit}`], { cwd: repo });
  const warnOnly = warnFlag || !floor;
  const gha = !!process.env.GITHUB_ACTIONS;

  if (!floor) console.log(`verify-range: tag ${GUARDS_SINCE} not found — warn-only mode (nothing blocks until it exists).`);
  const findings = await verify({ repo, base, head });
  const bad = findings.filter((f) => f.violations.length);
  const exempt = findings.filter((f) => f.exempt);

  console.log(`verify-range: ${findings.length} commit(s) checked (${base ? `${base.slice(0, 8)}..` : ""}${head.slice(0, 8)}), ${bad.length} with problems, ${exempt.length} red-proof exemption(s)`);
  for (const f of findings) {
    const mark = f.violations.length ? (warnOnly ? "!" : "✗") : "✓";
    console.log(`  ${mark} ${f.sha.slice(0, 8)} ${f.subject}${f.proof ? `\n      ${f.proof}` : ""}`);
    for (const x of f.violations) {
      console.log(`      [${x.rule}] ${x.message.replace(/\n/g, "\n      ")}`);
      if (gha) console.log(`::${warnOnly ? "warning" : "error"} title=guards ${f.sha.slice(0, 8)}::[${x.rule}] ${x.message.split("\n")[0]}`);
    }
  }
  const escapes = countEscapes(repo, head);
  for (const f of exempt) console.log(`  exempt ${f.sha.slice(0, 8)} Red-Proof-Exempt: ${f.exempt!.reason} ${f.exempt!.text}`);
  console.log(`  guard-ok escapes in the tree: ${escapes}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### Guards`, "", `${findings.length} commit(s) checked, ${bad.length} with problems${warnOnly ? " (warn-only)" : ""}.`, ""];
    if (exempt.length) lines.push("Red-proof exemptions:", ...exempt.map((f) => `- \`${f.sha.slice(0, 8)}\` ${f.subject} — **${f.exempt!.reason}** ${f.exempt!.text}`), "");
    lines.push(`\`guard-ok:\` escapes in the tree: ${escapes}`, "");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  }
  process.exit(bad.length && !warnOnly ? 1 : 0);
}
