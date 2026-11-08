/**
 * Paste-import evaluation (docs/paste-import-plan.md §6) — run by hand against
 * a real provider on every prompt change; never in CI.
 *
 * For each fixture in packages/shared/fixtures/import (<name>.txt with
 * <name>.expected.json; week11-12 is scored against its hand-written
 * extraction) it reads the text exactly as POST /v1/ai/imports does — chunks
 * in parallel through callLlm, purpose program_import, so the calls land in
 * llm_calls — then reports number-check failures, coverage, set accuracy
 * against the expectation, latency, and the new words each fixture offers
 * (against the global glossary — the eval has no trainer).
 *
 * Usage: bun run eval:import [--provider deepseek] [--model deepseek-flash]
 *        [--effort max] [--only week11-12,table]
 * Needs the provider's API key and DATABASE_URL (calls are logged).
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PROVIDER_ID, WEEK11_12_EXTRACTION, buildImportResult } from "@pt/shared";
import { providerRuntime, resolveEffort } from "../src/ai/runtime";
import { extractChunks } from "../src/lib/imports";
import { loadGlossary } from "../src/lib/vocabulary";
import { expectedFromExtraction, scoreResult, type Expected } from "../src/lib/import-eval";

const { values } = parseArgs({
  options: {
    provider: { type: "string", default: DEFAULT_PROVIDER_ID },
    model: { type: "string" },
    effort: { type: "string" },
    only: { type: "string" },
  },
});

const DIR = new URL("../../../packages/shared/fixtures/import/", import.meta.url).pathname;
const only = values.only?.split(",").map((s) => s.trim()).filter(Boolean);
const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .map((f) => basename(f, ".txt"))
  .filter((n) => !only || only.includes(n))
  .sort();

const rt = providerRuntime(values.provider!, values.model);
const effort = resolveEffort(rt, values.effort);
console.log(`eval:import — ${rt.providerId} · ${rt.model} · effort ${effort ?? rt.defaultEffort ?? "—"} · ${names.length} fixtures\n`);

const expectedFor = (name: string): Expected =>
  name === "week11-12"
    ? expectedFromExtraction(WEEK11_12_EXTRACTION)
    : (JSON.parse(readFileSync(join(DIR, `${name}.expected.json`), "utf8")) as Expected);

// no trainer: the global glossary seed, as in the prompt
const glossary = await loadGlossary(null);
const rows: Record<string, string | number>[] = [];
const newTerms: string[] = [];
const totals = { correct: 0, expected: 0, sessionsCorrect: 0, sessionsExpected: 0, numberFlags: 0 };
for (const name of names) {
  const text = readFileSync(join(DIR, `${name}.txt`), "utf8");
  const started = performance.now();
  const outcomes = await extractChunks(
    { id: crypto.randomUUID(), trainerId: null, clientId: null, text },
    rt,
    effort,
    new AbortController().signal,
    glossary,
  );
  const ms = Math.round(performance.now() - started);
  if (!outcomes) {
    rows.push({ fixture: name, error: "aborted" });
    continue;
  }
  const result = buildImportResult(text, outcomes, glossary);
  const s = scoreResult(result, expectedFor(name));
  const words = (result.newTerms ?? []).map((t) => (t.meaning ? `${t.term} (${t.meaning})` : t.term));
  newTerms.push(`  ${name}: ${words.length ? words.join(", ") : "—"}`);
  rows.push({
    fixture: name,
    sets: `${s.correct}/${s.expected}`,
    sessions: s.sessionsExpected ? `${s.sessionsCorrect}/${s.sessionsExpected} (${s.sessionsRead} read)` : "—",
    "number flags": s.numberFlags,
    unusual: s.implausible,
    "unused lines": s.unused,
    "unread lines": s.unreadLines,
    seconds: (ms / 1000).toFixed(1),
  });
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += s[k];
  for (const m of s.misses) console.log(`  ${name} ${m}`);
  for (const o of outcomes) if (!o.ok) console.log(`  ${name} lines ${o.from}–${o.to} unread: ${o.error.slice(0, 160)}`);
}
console.log();
console.table(rows);
console.log("new words:");
for (const l of newTerms) console.log(l);
console.log(
  `total — sets ${totals.correct}/${totals.expected} · sessions ${totals.sessionsCorrect}/${totals.sessionsExpected} · number flags ${totals.numberFlags}`,
);
process.exit(0);
