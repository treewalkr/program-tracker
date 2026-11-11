/**
 * After a deploy is live, close the feedback tickets its commits name:
 * `fix: clearer rest timer (FB-012)` → FB-012 goes to done in the version now
 * live, and its reporter is told to reload.
 *
 *   PT_API_URL=https://pt.pinroj.com FEEDBACK_AGENT_TOKEN=… bun run apps/api/scripts/feedback-shipped.ts
 *
 * Runs as CI's last deploy step. Without FEEDBACK_AGENT_TOKEN it prints a
 * notice and exits 0, so a repo without the secret still deploys. Covers the
 * commits since the release tag before HEAD; the API closes each ticket at most
 * once per commit, so overlapping runs are harmless.
 */
import { treaty } from "@elysiajs/eden";
import type { App } from "../src/app";
import { LOG_FORMAT, shipRange, shippedCommits } from "./feedback-shipped-lib";

const git = (...args: string[]): string | null => {
  const r = Bun.spawnSync(["git", ...args], { stderr: "pipe" });
  return r.success ? r.stdout.toString().trim() : null;
};

const url = (process.env.PT_API_URL ?? "https://pt.pinroj.com").replace(/\/+$/, "");
const token = process.env.FEEDBACK_AGENT_TOKEN;
if (!token) {
  console.log("feedback-shipped: FEEDBACK_AGENT_TOKEN is not set — skipping (add it as a GitHub secret to close tickets on deploy).");
  process.exit(0);
}

const range = shipRange(git("describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD^"));
const log = git("log", range, "--reverse", `--format=${LOG_FORMAT}`);
if (log === null) {
  console.error(`feedback-shipped: git log ${range} failed (is the checkout shallow? use fetch-depth: 0)`);
  process.exit(1);
}
const commits = shippedCommits(log);
if (!commits.length) {
  console.log(`feedback-shipped: no FB-xxx references in ${range}.`);
  process.exit(0);
}

const api = treaty<App>(url, { headers: { authorization: `Bearer ${token}` } }).v1.agent.feedback;
const { data, error } = await api.shipped.post({ commits }).catch((e: unknown) => {
  console.error(`feedback-shipped: ${url} unreachable — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
if (error) {
  const v = error.value as { error?: string } | string | null;
  console.error(`feedback-shipped: ${String(error.status)} ${typeof v === "string" ? v : (v?.error ?? JSON.stringify(v))}`);
  process.exit(1);
}

const short = (sha: string) => sha.slice(0, 7);
console.log(`feedback-shipped: ${range} · ${commits.length} commit(s) · live v${data.version}`);
for (const c of data.closed) console.log(`  closed  ${c.handle}  (${short(c.sha)})`);
for (const d of data.closedDuplicates) console.log(`  closed  ${d.duplicate}  (duplicate of ${d.handle})`);
for (const s of data.skipped) console.log(`  skipped ${s.handle}  (${short(s.sha)}) ${s.reason}`);
for (const u of data.unknown) console.log(`  unknown ${u.handle}  (${short(u.sha)})`);
