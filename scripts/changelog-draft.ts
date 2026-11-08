/**
 * Draft `## Unreleased` in CHANGELOG.md from feat:/fix: commits since the last v* tag.
 *
 *   bun run changelog:draft
 *
 * Draft lines are marked `[draft]`; rewrite them for trainers (merge, drop, reword)
 * and remove the marker — `bun run release` refuses while any remain. Re-running
 * replaces the drafts and keeps every line you already rewrote.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { draftChangelog } from "./release-lib";

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const lastTag = (() => {
  try {
    return sh("git describe --tags --abbrev=0 --match 'v*'");
  } catch {
    return null;
  }
})();
const subjects = sh(`git log ${lastTag ? `${lastTag}..HEAD` : "HEAD"} --reverse --format=%s`).split("\n").filter(Boolean);

const before = readFileSync("CHANGELOG.md", "utf8");
writeFileSync("CHANGELOG.md", draftChangelog(before, subjects));

const drafted = subjects.filter((s) => /^(feat|fix)(\([^)]*\))?!?:/.test(s)).length;
console.log(`Drafted ${drafted} line(s) since ${lastTag ?? "the first commit"} into CHANGELOG.md › Unreleased.`);
console.log("Next: rewrite the [draft] lines for trainers, drop the marker, commit as `docs: changelog for vX.Y.Z`, then `bun run release`.");
