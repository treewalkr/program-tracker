/**
 * The feedback auto-reply agent's hands: a thin CLI over /v1/agent/feedback
 * (Eden Treaty, typed from the API). The thinking is done by the coding agent
 * running the `answer-feedback` skill; this only reads and writes.
 *
 *   bun run feedback:agent inbox            tickets to answer, as Markdown; every image
 *                                           (ticket and public replies) saved to
 *                                           /tmp/pt-fb-agent/<handle>-<n>.<ext>
 *   bun run feedback:agent answer <id> --file answer.json [--transcript run.jsonl | --no-transcript]
 *                                           uploads the run's transcript with the answer: the
 *                                           watcher's current run (run.json) unless given
 *   bun run feedback:agent open             every open ticket in brief, to spot duplicates
 *   bun run feedback:agent duplicate <id> --of FB-012
 *                                           mark ticket <id> a duplicate of open FB-012:
 *                                           it closes when FB-012 does
 *   bun run feedback:agent lessons [--limit 20]
 *                                           recent 👎 answers with the reporter's comment, and
 *                                           drafts the owner rewrote — read before answering
 *   bun run feedback:agent dataset [--since 2026-11-01T00:00:00Z]
 *                                           every AI answer with its ticket, thread, meta,
 *                                           rating and run, as JSONL
 *
 * answer.json: { "basis", "note", "verdict", "confidence", "citations": [], "reply"?, "fixPlan"?: [], "risk"?, "ready"?, "model"? }
 *
 * Config: PT_API_URL and FEEDBACK_AGENT_TOKEN, from the environment or the
 * repo's gitignored .env.agent (the environment wins).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { treaty } from "@elysiajs/eden";
import type { App } from "../src/app";
import { answerRatingText, feedbackHandle, parseFeedbackHandle } from "@pt/shared";
import { agentEnv } from "./agent-env";
import { capTranscript } from "../src/lib/agent-transcript";
import { parseRunPointer } from "./feedback-watch-lib";

const SHOTS_DIR = "/tmp/pt-fb-agent";
const RUN_FILE = join(SHOTS_DIR, "run.json");
const SKILL_FILE = resolve(import.meta.dir, "../../../.claude/skills/answer-feedback/SKILL.md");

function loadAgentEnv(): { url: string; token: string } {
  const env = agentEnv();
  if (!env) fail("set PT_API_URL and FEEDBACK_AGENT_TOKEN (in .env.agent at the repo root, or the environment)");
  return env;
}

function fail(message: string): never {
  console.error(`feedback-agent: ${message}`);
  process.exit(1);
}

const errorText = (error: { status: unknown; value: unknown }) => {
  const v = error.value as { error?: string } | string | null;
  return `${String(error.status)} ${typeof v === "string" ? v : (v?.error ?? JSON.stringify(v))}`;
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string" },
    of: { type: "string" },
    transcript: { type: "string" },
    "no-transcript": { type: "boolean" },
    limit: { type: "string" },
    since: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});
const [command, id] = positionals;
if (values.help || !command) {
  console.log(
    "usage: feedback-agent inbox | answer <id> --file answer.json [--transcript f | --no-transcript] | open | duplicate <id> --of FB-012 | lessons [--limit n] | dataset [--since iso]",
  );
  process.exit(command ? 0 : 1);
}

/**
 * The agent run behind this answer, for the API's log: the transcript (the
 * watcher's current run unless --transcript names one; none with
 * --no-transcript or outside a watcher run), trimmed to the API's cap with
 * the agent token scrubbed, how long the run has taken, and which version of
 * the skill ran. Never fails the answer.
 */
async function agentRun(token: string) {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
  const skill = existsSync(SKILL_FILE) ? await readFile(SKILL_FILE, "utf8") : null;
  const run: { transcript?: string; durationMs?: number; promptVersion: string } = {
    promptVersion: skill ? `answer-feedback:${sha(skill)}` : "answer-feedback",
  };
  if (values["no-transcript"]) return run;
  const pointer = values.transcript ? null : parseRunPointer(existsSync(RUN_FILE) ? await readFile(RUN_FILE, "utf8") : null);
  const path = values.transcript ? resolve(values.transcript) : pointer?.transcript;
  if (!path || !existsSync(path)) return run;
  try {
    const raw = (await readFile(path, "utf8")).replaceAll(token, "[redacted]");
    if (raw.trim()) run.transcript = capTranscript(raw).text;
  } catch (err) {
    console.error(`feedback-agent: transcript ${path} not sent: ${(err as Error).message}`);
  }
  if (pointer) run.durationMs = Math.max(0, Date.now() - pointer.startedAt);
  return run;
}

const env = loadAgentEnv();
const api = treaty<App>(env.url, { headers: { authorization: `Bearer ${env.token}` } }).v1.agent.feedback;

if (command === "inbox") {
  const { data, error } = await api.inbox.get();
  if (error) fail(`inbox: ${errorText(error)}`);
  if (!data.length) {
    console.log("Inbox empty.");
    process.exit(0);
  }
  await mkdir(SHOTS_DIR, { recursive: true });
  const out: string[] = [`# Feedback inbox — ${data.length} ticket${data.length === 1 ? "" : "s"}`, ""];
  for (const t of data) {
    const images: string[] = [];
    let markdown = t.markdown;
    for (const a of t.attachments) {
      const res = await api({ id: t.id }).attachments({ attachmentId: a.id }).get();
      if (res.error) fail(`${t.handle} image ${a.file}: ${errorText(res.error)}`);
      const path = join(SHOTS_DIR, a.file);
      await writeFile(path, new Uint8Array(res.data as unknown as ArrayBuffer));
      // the Markdown names each image `attachment:<id>`; point it at the file instead
      markdown = markdown.replaceAll(`attachment:${a.id}`, path);
      const what = a.kind === "upload" ? "image" : `${a.kind} screenshot`;
      images.push(`- ${path} — ${what}, on the ${a.entry}`);
    }
    out.push(
      "---",
      "",
      `id: ${t.id}`,
      `basis: ${t.basis}`,
      `reporter build: ${t.build}`,
      images.length ? `images (open every one):\n${images.join("\n")}` : "images: none",
      "",
      markdown,
      "",
    );
  }
  console.log(out.join("\n"));
} else if (command === "answer") {
  if (!id) fail("answer needs a ticket id");
  if (!values.file) fail("answer needs --file answer.json");
  let body: unknown;
  try {
    body = JSON.parse(await readFile(resolve(values.file), "utf8"));
  } catch (err) {
    fail(`could not read ${values.file}: ${(err as Error).message}`);
  }
  const run = await agentRun(env.token);
  const payload = { ...(body as object), run } as Parameters<ReturnType<typeof api>["answer"]["post"]>[0];
  const { data, error } = await api({ id }).answer.post(payload);
  if (error) {
    const hint = error.status === 409 ? " — re-run `inbox` and answer the current version (or skip it)" : "";
    fail(`answer: ${errorText(error)}${hint}`);
  }
  console.log(JSON.stringify(data));
} else if (command === "open") {
  const { data, error } = await api.open.get();
  if (error) fail(`open: ${errorText(error)}`);
  if (!data.length) {
    console.log("No open tickets.");
    process.exit(0);
  }
  const lines = [`# Open tickets — ${data.length}`, ""];
  for (const t of data) {
    const dup = t.duplicateOf ? ` · duplicate of ${feedbackHandle(t.duplicateOf)}` : "";
    lines.push(`- **${t.handle}** (${t.status}${dup}) ${t.route ? `\`${t.route}\` ` : ""}id ${t.id}`);
    lines.push(`  > ${t.comment.trim().split("\n").join("\n  > ")}`);
  }
  console.log(lines.join("\n"));
} else if (command === "duplicate") {
  if (!id) fail("duplicate needs a ticket id");
  const of = parseFeedbackHandle(values.of ?? "");
  if (!of) fail("duplicate needs --of FB-<number>");
  const { data, error } = await api({ id }).duplicate.post({ of });
  if (error) fail(`duplicate: ${errorText(error)}`);
  console.log(JSON.stringify(data));
} else if (command === "lessons") {
  const limit = values.limit ? Number(values.limit) : undefined;
  const { data, error } = await api.lessons.get({ query: { limit } });
  if (error) fail(`lessons: ${errorText(error)}`);
  if (!data.length) {
    console.log("No lessons yet: no AI answer was rated 👎 or rewritten by the owner.");
    process.exit(0);
  }
  // Eden revives ISO strings into Dates.
  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  const quote = (s: string) => `> ${s.trim().split("\n").join("\n> ")}`;
  const out = [
    `# Lessons — ${data.length} answer${data.length === 1 ? "" : "s"} that missed, newest first`,
    "",
    "Read each: what the trainer asked, what the AI said, and what was wrong with it. Don't repeat these mistakes.",
    "",
  ];
  for (const r of data) {
    out.push(`## ${r.handle} · ${r.answer.verdict.replace(/_/g, " ")} · ${r.answer.confidence} confidence · ${day(r.answer.at)}`, "");
    out.push("**Trainer asked:**", quote(r.ticket.comment), "");
    for (const t of r.thread) out.push(`**${t.who}:**`, quote(t.body), "");
    // An owner-edited answer is stored as sent; the agent's own words are the original.
    out.push(`**AI answered${r.answer.visibility === "draft" ? " (draft)" : ""}:**`, quote(r.ownerEdit?.original ?? r.answer.body), "");
    if (r.rating) out.push(`**Trainer rated it:** ${answerRatingText(r.rating)}`, "");
    if (r.ownerEdit?.sent) out.push("**Owner rewrote it before sending:**", quote(r.ownerEdit.sent), "");
    if (r.followUp) out.push(`**Next reply (${r.followUp.who === "ai" ? "AI" : r.followUp.who}):**`, quote(r.followUp.body), "");
  }
  console.log(out.join("\n"));
} else if (command === "dataset") {
  if (values.since && Number.isNaN(Date.parse(values.since))) fail("--since needs an ISO date-time");
  const since = values.since ? new Date(values.since).toISOString() : undefined;
  const { data, error } = await api.dataset.get({ query: { since } });
  if (error) fail(`dataset: ${errorText(error)}`);
  for (const r of data) console.log(JSON.stringify(r));
} else {
  fail(`unknown command "${command}" (inbox | answer | open | duplicate | lessons | dataset)`);
}
