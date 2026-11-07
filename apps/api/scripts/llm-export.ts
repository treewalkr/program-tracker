/**
 * Export the LLM log as datasets (pseudonymized: client names → Client-<hash6>, no emails).
 *
 *   sft      OpenAI chat JSONL {"messages":[system,user,assistant]} — accepted outputs
 *   dpo      {"input":{messages},"preferred_output":[…],"non_preferred_output":[…]}
 *   eval     {context, prompt_version, expected, label, reason_tags} — replay cases
 *   fewshot  {situation, accepted_output, why} — retrieval into live prompts
 *
 * Usage: bun run llm:export --format sft [--purpose block_generate,revision]
 *        [--since 2026-10-01] [--min-label gold|silver] [--include-mock] [--out llm-export]
 * Writes <out>/<format>.jsonl (default <repo>/llm-export, gitignored). Run locally
 * with DATABASE_URL pointing at the database to export.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { LLM_PURPOSES, type LlmPurpose } from "@pt/shared";
import { exportRecords, type ExportFormat } from "../src/lib/llm-dataset";

const FORMATS: ExportFormat[] = ["sft", "dpo", "eval", "fewshot"];

const { values } = parseArgs({
  options: {
    format: { type: "string", default: "sft" },
    purpose: { type: "string" },
    since: { type: "string" },
    "min-label": { type: "string", default: "silver" },
    "include-mock": { type: "boolean", default: false },
    out: { type: "string", default: resolve(import.meta.dir, "../../../llm-export") },
  },
});

const fail = (msg: string): never => {
  console.error(`llm-export: ${msg}`);
  process.exit(1);
};

const format = values.format as ExportFormat;
if (!FORMATS.includes(format)) fail(`--format must be one of ${FORMATS.join(", ")}`);
const purposes = values.purpose?.split(",").map((s) => s.trim()).filter(Boolean) as LlmPurpose[] | undefined;
for (const p of purposes ?? []) if (!LLM_PURPOSES.includes(p)) fail(`unknown purpose "${p}" (${LLM_PURPOSES.join(", ")})`);
const since = values.since ? new Date(values.since) : undefined;
if (since && Number.isNaN(since.getTime())) fail(`--since is not a date: ${values.since}`);
const minLabel = values["min-label"];
if (minLabel !== "gold" && minLabel !== "silver") fail("--min-label must be gold or silver");

const records = await exportRecords(format, {
  purposes,
  since,
  minLabel: minLabel as "gold" | "silver",
  includeMock: values["include-mock"],
});

const out = resolve(values.out!);
await mkdir(out, { recursive: true });
const file = join(out, `${format}.jsonl`);
await writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
console.log(`✓ ${records.length} ${format} record(s) → ${file}`);
process.exit(0);
