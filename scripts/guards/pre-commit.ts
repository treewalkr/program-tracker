/**
 * pre-commit: staged-file rules. Reads only what is staged, so it stays fast.
 * Skipped while a merge is being concluded (the files were checked on their own branches).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git, lastReleaseTag, releasedMigrations, report, stagedChanges, stagedFiles } from "./git";
import { type Baseline, type Violation, checkForbiddenPaths, checkMigrations, checkRatchet, checkSvelteRunes } from "./lib";


if (git(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).ok) process.exit(0);

const changes = stagedChanges();
if (!changes.length) process.exit(0);

const wants = (p: string) => /^packages\/db\/drizzle\/[^/]+\.sql$/.test(p) || p.endsWith(".svelte") || /^apps\/web\/src\/.*\.ts$/.test(p);
const files = stagedFiles(changes, wants);
const live = files.filter((f) => f.status !== "D" && f.content !== undefined) as { path: string; content: string }[];

const tag = lastReleaseTag("HEAD");
const baseline: Baseline = JSON.parse(readFileSync(join(import.meta.dir, "baseline.json"), "utf8"));

const violations: Violation[] = [
  ...checkForbiddenPaths(files),
  ...checkMigrations(files, files.some((f) => f.path.startsWith("packages/db/drizzle/")) ? releasedMigrations(tag) : new Set()),
  ...live.flatMap((f) => checkSvelteRunes(f.path, f.content)),
  ...checkRatchet(live, baseline),
];

if (violations.length) {
  report("pre-commit refused this commit", violations);
  console.error("Fix the above and commit again. (Rules and escapes: scripts/guards/README.md)");
  process.exit(1);
}
