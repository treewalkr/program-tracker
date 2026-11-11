/**
 * The fix agent's guard rails, pure so they can be tested: which tickets a
 * run takes, the branch and worktree each gets, and the checks a branch must
 * pass before it is pushed and a PR opened. The script (feedback-fix.ts)
 * only wires these to git, gh and the API.
 */
import { join } from "node:path";
import { feedbackHandle, feedbackHandlesIn } from "@pt/shared";

/** Tickets per run unless --max says otherwise, and the most it may say. */
export const FIX_MAX_DEFAULT = 2;
export const FIX_MAX_CAP = 5;
/** Commits a fix branch may carry: a fix is small, or it isn't low risk. */
export const FIX_MAX_COMMITS = 10;

/** `--max` → 1..FIX_MAX_CAP; junk or absent → the default. */
export function clampMax(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return FIX_MAX_DEFAULT;
  return Math.min(n, FIX_MAX_CAP);
}

/** `fix/fb-012` — the only kind of branch `open` will push. */
export const fixBranch = (number: number): string => `fix/${feedbackHandle(number).toLowerCase()}`;

/** A sibling of the main checkout: `<parent>/pt-fix-fb-012`. */
export const fixWorktreePath = (repoRoot: string, number: number): string =>
  join(repoRoot, "..", `pt-fix-${feedbackHandle(number).toLowerCase()}`);

/** `gh pr view --json state`; UNKNOWN when gh couldn't tell (no auth, deleted repo, …). */
export type PrState = "OPEN" | "MERGED" | "CLOSED" | "UNKNOWN";

export interface FixTicket {
  id: string;
  number: number;
  handle: string;
  fixPr: string | null;
}

/**
 * Which candidates this run takes, oldest first, at most `max`. A ticket
 * whose recorded PR is open or merged (waiting to deploy) is skipped, and so
 * is one whose PR state is unknown — better a missed run than a second PR.
 * A closed, unmerged PR means the owner turned it down: try again.
 */
export function pickTickets<T extends FixTicket>(
  tickets: T[],
  prStates: Map<string, PrState>,
  max: number,
): { take: T[]; skip: { handle: string; reason: string }[] } {
  const take: T[] = [];
  const skip: { handle: string; reason: string }[] = [];
  for (const t of tickets) {
    const state = t.fixPr ? (prStates.get(t.fixPr) ?? "UNKNOWN") : null;
    if (state && state !== "CLOSED") {
      skip.push({ handle: t.handle, reason: `PR ${state.toLowerCase()}: ${t.fixPr}` });
    } else if (take.length >= max) {
      skip.push({ handle: t.handle, reason: `over --max ${max}` });
    } else take.push(t);
  }
  return { take, skip };
}

const COMMIT_TYPE = /^(fix|feat|refactor|test|chore|docs): \S/;

/**
 * Why this branch may not be pushed, or null when it may. It must be the
 * ticket's own `fix/fb-nnn` branch, clean, with 1–FIX_MAX_COMMITS commits on
 * top of origin/main, each typed (`fix: …`) and naming the ticket
 * `(FB-nnn)` so the deploy closes it.
 */
export function checkBranch(b: { number: number; branch: string; subjects: string[]; dirty: boolean }): string | null {
  const want = fixBranch(b.number);
  if (b.branch === "main" || b.branch === "HEAD") return `on ${b.branch} — fixes go on ${want}`;
  if (b.branch !== want) return `branch is ${b.branch}, expected ${want}`;
  if (b.dirty) return "the worktree has uncommitted changes — commit or drop them";
  if (b.subjects.length === 0) return "no commits on top of origin/main";
  if (b.subjects.length > FIX_MAX_COMMITS) return `${b.subjects.length} commits — more than ${FIX_MAX_COMMITS} isn't a low-risk fix`;
  const handle = feedbackHandle(b.number);
  for (const s of b.subjects) {
    if (!COMMIT_TYPE.test(s)) return `"${s}" needs a type prefix (fix: …)`;
    if (!feedbackHandlesIn(s).includes(b.number) || !s.includes(`(${handle})`)) return `"${s}" must end with (${handle})`;
  }
  return null;
}

/** The PR: titled by the first commit, the body says where it came from and what merging does. */
export function prText(t: { handle: string; subjects: string[]; plan: string[] }): { title: string; body: string } {
  const title = t.subjects[0];
  const body = [
    `Fixes ${t.handle}, opened by the feedback fix agent (\`/fix-feedback\`) from the auto-reply agent's low-risk plan.`,
    "",
    ...(t.plan.length ? ["**Plan**", "", ...t.plan.map((s, i) => `${i + 1}. ${s}`), ""] : []),
    "**Commits**",
    "",
    ...t.subjects.map((s) => `- ${s}`),
    "",
    `Review before merging — the agent never merges. Once merged and deployed, CI closes ${t.handle} from the commit.`,
    "",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ].join("\n");
  return { title, body };
}

/** `gh pr create` arguments: a draft PR into main from the fix branch. */
export const ghCreateArgs = (branch: string, title: string, bodyFile: string): string[] => [
  "pr",
  "create",
  "--draft",
  "--base",
  "main",
  "--head",
  branch,
  "--title",
  title,
  "--body-file",
  bodyFile,
];

/** The push: this branch to its own name on origin — never main, never --force. */
export const pushArgs = (branch: string): string[] => ["push", "--set-upstream", "origin", `HEAD:refs/heads/${branch}`];

/** The fix plan's steps from the ticket Markdown (`  - Fix plan:` then `    1. …`). */
export function planFromMarkdown(md: string): string[] {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => l.trim() === "- Fix plan:");
  if (at < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\s+\d+\.\s+(.*)$/.exec(l);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}
