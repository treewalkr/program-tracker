/**
 * The feedback auto-reply agent's hands: a thin CLI over /v1/agent/feedback
 * (Eden Treaty, typed from the API). The thinking is done by the coding agent
 * running the `answer-feedback` skill; this only reads and writes.
 *
 *   bun run feedback:agent inbox            tickets to answer, as Markdown; every image
 *                                           (ticket and public replies) saved to
 *                                           /tmp/pt-fb-agent/<handle>-<n>.<ext>
 *   bun run feedback:agent answer <id> --file answer.json
 *
 * answer.json: { "basis", "note", "verdict", "confidence", "citations": [], "reply"?, "fixPlan"?: [], "risk"?, "model"? }
 *
 * Config: PT_API_URL and FEEDBACK_AGENT_TOKEN, from the environment or the
 * repo's gitignored .env.agent (the environment wins).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { treaty } from "@elysiajs/eden";
import type { App } from "../src/app";
import { agentEnv } from "./agent-env";

const SHOTS_DIR = "/tmp/pt-fb-agent";

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
  options: { file: { type: "string" }, help: { type: "boolean", short: "h" } },
});
const [command, id] = positionals;
if (values.help || !command) {
  console.log("usage: feedback-agent inbox | answer <id> --file answer.json");
  process.exit(command ? 0 : 1);
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
  const { data, error } = await api({ id }).answer.post(body as Parameters<ReturnType<typeof api>["answer"]["post"]>[0]);
  if (error) {
    const hint = error.status === 409 ? " — re-run `inbox` and answer the current version (or skip it)" : "";
    fail(`answer: ${errorText(error)}${hint}`);
  }
  console.log(JSON.stringify(data));
} else {
  fail(`unknown command "${command}" (inbox | answer)`);
}
