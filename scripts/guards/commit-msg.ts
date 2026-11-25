/**
 * commit-msg: message rules, then the red proof for a `fix:` that needs one (the hook runs the
 * proof itself and writes the `Red-Proof:` trailer; a hand-typed one is replaced).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, report, run, stagedChanges } from "./git";
import { type Violation, checkMessage, proofStatus, proofTrailers, withProofTrailer } from "./lib";

const file = process.argv[2];
if (!file) {
  console.error("commit-msg: no message file given");
  process.exit(1);
}
const raw = readFileSync(file, "utf8");

/** Best effort: the process that ran this hook is `git commit`; an amend's parent is HEAD^, not HEAD. */
function isAmend(): boolean {
  const ps = run(["ps", "-o", "command=", "-p", String(process.ppid)]);
  return ps.ok && /\s--amend(\s|$)/.test(ps.out);
}

const hasHead = git(["rev-parse", "-q", "--verify", "HEAD"]).ok;
const parent = hasHead ? (isAmend() ? "HEAD^" : "HEAD") : null;
const files = stagedChanges(parent ?? "4b825dc642cb6eb9a060e54bf8d69288fbee4904").map((c) => c.path); // the empty tree for a first commit

const violations: Violation[] = checkMessage(raw);
const { status, violations: proofViolations } = proofStatus(raw, files);
violations.push(...proofViolations);
if (status !== "needs-proof" && proofTrailers(raw).proof) {
  violations.push({ rule: "red-proof-trailer", message: "this commit needs no red proof, so it must not carry a `Red-Proof:` trailer (the hook writes it for a `fix:` that needs one)" });
}

if (violations.length) {
  report("commit-msg refused this commit", violations);
  console.error("Rules: AGENTS.md › Commit Rules (scripts/guards/README.md lists what each guard refuses).");
  process.exit(1);
}

if (status === "needs-proof" && parent) {
  console.error("commit-msg: this fix: changes behaviour, so its tests must go red -> green. Proving it (a minute, once per commit)…");
  const proof = Bun.spawnSync(["bun", join(import.meta.dir, "red-proof.ts"), "--staged", "--parent", parent, "--type", "fix"], { stdout: "pipe", stderr: "inherit" });
  const trailer = proof.stdout.toString().trim();
  if (proof.exitCode !== 0 || !trailer.startsWith("Red-Proof:")) {
    const why = proof.exitCode === 2 ? "could not run the proof (see above)" : "the proof failed (see above)";
    console.error(`\ncommit-msg refused this commit: ${why}.\n  Add a test that fails before the fix and passes with it, or, if no test can exercise it, add a trailer:\n  Red-Proof-Exempt: <ui-only|copy|config|no-harness> <why>\n`);
    process.exit(1);
  }
  writeFileSync(file, withProofTrailer(raw, trailer));
  console.error(`commit-msg: ${trailer}`);
}
