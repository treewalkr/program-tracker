/**
 * Draft `## Unreleased` in CHANGELOG.md from feat:/fix: commits since the last v* tag.
 *
 *   bun run changelog:draft
 *
 * Draft lines are marked `[draft]`; rewrite them for trainers (merge, drop, reword)
 * and remove the marker — `bun run release` refuses while any remain. Re-running
 * replaces the drafts and keeps every line you already rewrote.
 *
 * A commit that names a ticket (`fix: … (FB-012)`) is drafted in the ticket's
 * own words, read from the live API with PT_API_URL and FEEDBACK_AGENT_TOKEN
 * (the environment or .env.agent). Without them, or if the API can't be
 * reached, it drafts from the commit text and says so.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { ticketComments } from "../apps/api/scripts/feedback-tickets";
import { draftChangelog, ticketNumbers } from "./release-lib";

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const lastTag = (() => {
  try {
    return sh("git describe --tags --abbrev=0 --match 'v*'");
  } catch {
    return null;
  }
})();
const subjects = sh(`git log ${lastTag ? `${lastTag}..HEAD` : "HEAD"} --reverse --format=%s`).split("\n").filter(Boolean);

/** number → comment of every ticket the subjects name; empty when they name none or the API is out of reach. */
async function ticketWording(): Promise<Map<number, string>> {
  const numbers = [...new Set(subjects.flatMap(ticketNumbers))];
  if (!numbers.length) return new Map();
  const read = await ticketComments(numbers);
  if (read instanceof Map) return read;
  console.log(`Ticket lines use the commit text: ${read.skipped}.`);
  return new Map();
}

const tickets = await ticketWording();
const before = readFileSync("CHANGELOG.md", "utf8");
writeFileSync("CHANGELOG.md", draftChangelog(before, subjects, tickets));

const drafted = subjects.filter((s) => /^(feat|fix)(\([^)]*\))?!?:/.test(s)).length;
console.log(`Drafted ${drafted} line(s) since ${lastTag ?? "the first commit"} into CHANGELOG.md › Unreleased${tickets.size ? `, ${tickets.size} worded from tickets` : ""}.`);
console.log("Next: rewrite the [draft] lines for trainers, drop the marker, commit as `docs: changelog for vX.Y.Z`, then `bun run release`.");
