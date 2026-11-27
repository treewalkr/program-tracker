/**
 * Guard rules: pure functions from input to Violation[], no I/O. The hook entry points
 * (commit-msg.ts, pre-commit.ts, pre-push.ts, claude.ts) and CI (verify-range.ts) gather the
 * input and call these, so a rule is written once and tested once (lib.test.ts, one red and
 * one green fixture each). Rules mirror AGENTS.md; see scripts/guards/README.md.
 */
import { LAST_GRANDFATHERED, LAST_WITHOUT_RLS, LINT_HELP, RLS_HELP, migrationNumber, tablesMissingRls, unsafeChanges } from "../../packages/db/src/migration-lint";

export interface Violation {
  rule: string;
  message: string;
}
const v = (rule: string, message: string): Violation => ({ rule, message });

/** `// guard-ok: <rule> <why>` on a line switches that rule off for the line. */
export const hasEscape = (line: string, rule: string): boolean => new RegExp(String.raw`guard-ok:\s*${rule}\b`).test(line);

// ── commit message ──────────────────────────────────────────────────────────

export const COMMIT_TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "perf", "ci", "build", "revert"] as const;
export const COMMIT_SCOPES = ["domain", "api", "server", "app", "web", "portal", "shared", "db"] as const;
export const EXEMPT_REASONS = ["ui-only", "copy", "config", "no-harness"] as const;
export const MAX_SUBJECT = 100;
const BAD_FIRST_WORDS = new Set(["added", "adds", "adding", "fixes", "fixed", "fixing"]);
const SUBJECT = new RegExp(String.raw`^(${COMMIT_TYPES.join("|")})(?:\((${COMMIT_SCOPES.join("|")})\))?(!)?: (\S.*)$`);

/** Message as git stores it: comment lines dropped, trailing blank lines trimmed. */
export function cleanMessage(raw: string): string {
  return raw
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .replace(/\s+$/, "");
}

export const subjectOf = (raw: string): string => cleanMessage(raw).split("\n")[0] ?? "";

/** The conventional type of a subject (`fix(app)!: x` → `fix`), or null. */
export function commitType(subject: string): string | null {
  return SUBJECT.exec(subject)?.[1] ?? null;
}

export const isMergeSubject = (subject: string): boolean => /^Merge /.test(subject);

/**
 * Message rules. `final` is for history that is about to be pushed (CI): a `fixup!` or
 * `squash!` commit is fine while working, but must be folded in before it lands.
 */
export function checkMessage(raw: string, opts: { final?: boolean } = {}): Violation[] {
  const msg = cleanMessage(raw);
  const subject = msg.split("\n")[0] ?? "";
  if (isMergeSubject(subject)) return [];
  if (/^(fixup|squash|amend)! /.test(subject)) {
    return opts.final ? [v("fixup", "a fixup!/squash! commit must be squashed before it lands")] : [];
  }
  const out: Violation[] = [];
  const m = SUBJECT.exec(subject);
  if (!m) {
    out.push(v("format", `subject must be \`type(scope)!?: subject\` — types ${COMMIT_TYPES.join(", ")}; scope one of ${COMMIT_SCOPES.join(", ")} or none; got "${subject}"`));
  } else {
    const first = m[4].split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
    if (BAD_FIRST_WORDS.has(first)) out.push(v("imperative", `subject must be imperative ("add", "fix"), not "${first}"`));
  }
  if (subject.length > MAX_SUBJECT) out.push(v("subject-length", `subject is ${subject.length} characters; keep it to ${MAX_SUBJECT} (move detail to the body)`));
  if (/^co-authored-by:/im.test(msg)) out.push(v("co-authored-by", "no Co-Authored-By trailer (AGENTS.md › Message rules)"));
  if (/generated with \[?claude/i.test(msg)) out.push(v("generated-by", 'no "Generated with Claude Code" line'));
  out.push(...checkFeedbackHandle(subject));
  return out;
}

/** `(FB-012)` or `(FB-012, FB-013)` at the end of the subject, three digits; nowhere else in it. */
export function checkFeedbackHandle(subject: string): Violation[] {
  const all = subject.match(/\bFB-\d+\b/g) ?? [];
  if (!all.length) return [];
  const tail = /\s\((FB-\d{3}(?:, FB-\d{3})*)\)$/.exec(subject);
  if (tail && tail[1].split(", ").length === all.length) return [];
  return [v("fb-handle", "a feedback handle goes last in the subject as `(FB-012)` — three digits, in parentheses, e.g. `fix: clearer rest timer (FB-012)`")];
}

// ── red proof ───────────────────────────────────────────────────────────────

const isTestFile = (f: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
const isUiFile = (f: string) => /\.(svelte|css)$/.test(f);
const inSource = (f: string) => /^(apps|packages)\/[^/]+\/src\//.test(f);

/** The changed files whose behaviour a `fix:` must prove: source under apps/ or packages/, not UI-only, not tests. */
export const proofScope = (files: string[]): string[] => files.filter((f) => inSource(f) && !isUiFile(f) && !isTestFile(f));

/** A `fix:` that changes non-UI source needs a red proof (or an exemption). */
export const needsRedProof = (type: string | null, files: string[]): boolean => type === "fix" && proofScope(files).length > 0;

/** Test files a commit adds or changes, and the fixtures/helpers beside them that the proof copies along. */
export function proofFiles(changed: { status: string; path: string }[]): { tests: string[]; support: string[] } {
  const live = changed.filter((c) => c.status !== "D");
  return {
    tests: live.filter((c) => isTestFile(c.path)).map((c) => c.path),
    support: live.filter((c) => !isTestFile(c.path) && /(^|\/)(__fixtures__|testing)\//.test(c.path)).map((c) => c.path),
  };
}

export interface ProofTrailer {
  files: string[];
  red: number;
  green: number;
  parent: string;
}

export const formatProofTrailer = (p: ProofTrailer): string => `Red-Proof: ${p.files.join(",")} ${p.red} fail -> ${p.green} fail @ ${p.parent}`;

export function parseProofTrailer(line: string): ProofTrailer | null {
  const m = /^Red-Proof:\s+(\S+) (\d+) fail -> (\d+) fail @ ([0-9a-f]{7,40})\s*$/.exec(line);
  return m ? { files: m[1].split(","), red: Number(m[2]), green: Number(m[3]), parent: m[4] } : null;
}

export interface ProofTrailers {
  proof: string | null;
  exempt: { reason: string; text: string } | null;
}

export function proofTrailers(raw: string): ProofTrailers {
  const lines = cleanMessage(raw).split("\n");
  const proof = lines.find((l) => /^Red-Proof:/.test(l)) ?? null;
  const ex = lines.map((l) => /^Red-Proof-Exempt:\s*(\S*)\s*(.*)$/.exec(l)).find(Boolean);
  return { proof, exempt: ex ? { reason: ex[1], text: ex[2] } : null };
}

/** Message with every Red-Proof / Red-Proof-Exempt-free trailer line replaced by `trailer` (a hand-typed one never counts). */
export function withProofTrailer(raw: string, trailer: string): string {
  const kept = cleanMessage(raw)
    .split("\n")
    .filter((l) => !/^Red-Proof:/.test(l));
  return `${kept.join("\n").replace(/\s+$/, "")}\n\n${trailer}\n`;
}

export type ProofStatus = "not-needed" | "exempt" | "needs-proof";

/**
 * Where a commit stands on the red-proof rule. `exempt` and the reason check are the only
 * violations here: `needs-proof` is the runner's job (commit-msg runs it; CI re-runs it).
 */
export function proofStatus(raw: string, files: string[]): { status: ProofStatus; violations: Violation[] } {
  const type = commitType(subjectOf(raw));
  const { exempt } = proofTrailers(raw);
  const needs = needsRedProof(type, files);
  if (exempt) {
    const known = (EXEMPT_REASONS as readonly string[]).includes(exempt.reason);
    if (!known) return { status: needs ? "needs-proof" : "not-needed", violations: [v("exempt-reason", `Red-Proof-Exempt reason "${exempt.reason}" is not one of ${EXEMPT_REASONS.join(", ")}`)] };
    if (exempt.reason === "ui-only" && proofScope(files).length) {
      return { status: "needs-proof", violations: [v("exempt-reason", `ui-only is not true: ${proofScope(files).slice(0, 3).join(", ")} is not .svelte/.css`)] };
    }
    return { status: "exempt", violations: [] };
  }
  return { status: needs ? "needs-proof" : "not-needed", violations: [] };
}

export interface TestRun {
  exit: number;
  pass: number;
  fail: number;
  skip: number;
  /** `(fail) name` lines: tests that ran and failed. */
  failedTests: number;
  /** `# Unhandled error between tests`: a load or syntax error, no test ran. */
  loadErrors: number;
}

/** Counts from `bun test` output. */
export function parseBunTest(output: string, exit: number): TestRun {
  const n = (label: string) => Number(new RegExp(String.raw`^\s*(\d+) ${label}\s*$`, "m").exec(output)?.[1] ?? 0);
  return {
    exit,
    pass: n("pass"),
    fail: n("fail"),
    skip: n("skip") + n("todo"),
    failedTests: (output.match(/^\(fail\) /gm) ?? []).length,
    loadErrors: (output.match(/^# Unhandled error between tests/gm) ?? []).length,
  };
}

export interface ProofVerdict {
  ok: boolean;
  /** `infra` = couldn't tell (database down); `not-red` / `not-green` = the claim is false. */
  kind?: "infra" | "not-red" | "not-green";
  message?: string;
}

/**
 * Red: the tests, on the parent's source, fail by assertion (for `fix`; a load error alone
 * proves nothing was exercised, so it only counts for other types). Green: same tests on the
 * commit's source, none fail. A run where everything skipped says nothing either way.
 */
export function judgeProof(type: string, red: TestRun, green: TestRun): ProofVerdict {
  const allSkipped = (r: TestRun) => r.pass === 0 && r.fail === 0 && r.skip > 0;
  if (allSkipped(red) || allSkipped(green)) {
    return { ok: false, kind: "infra", message: "every test skipped (is Postgres up? run `bun run db:up`) — no proof either way" };
  }
  const redCount = type === "fix" ? red.failedTests : Math.max(red.failedTests, red.loadErrors);
  if (red.exit === 0 || redCount === 0) {
    const why = type === "fix" && red.loadErrors && !red.failedTests ? "they only failed to load (missing module/export) — a fix's test must exercise behaviour that already existed" : "they passed on the parent's source";
    return { ok: false, kind: "not-red", message: `the tests are not red before the fix: ${why}` };
  }
  if (green.exit !== 0 || green.fail > 0 || green.loadErrors > 0) {
    return { ok: false, kind: "not-green", message: `the tests do not pass on the commit (${green.fail} fail, ${green.loadErrors} load error)` };
  }
  if (green.pass === 0) return { ok: false, kind: "infra", message: "no test ran on the commit" };
  return { ok: true };
}

// ── staged files (pre-commit) ───────────────────────────────────────────────

export interface StagedFile {
  path: string;
  status: "A" | "M" | "D";
  /** Staged content; absent for deletions. */
  content?: string;
}

export function checkForbiddenPaths(files: StagedFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    if (f.status === "D") continue;
    const name = f.path.split("/").pop()!;
    if (name === "COMMITS.md") out.push(v("forbidden-path", `${f.path}: COMMITS.md is generated locally and never committed`));
    else if (/^\.env(\..*)?$/.test(name) && name !== ".env.example") out.push(v("forbidden-path", `${f.path}: env files hold secrets and are never committed`));
    else if (name.endsWith(".dump")) out.push(v("forbidden-path", `${f.path}: database dumps are never committed`));
    else if (!f.path.includes("/") && name.endsWith(".sql")) out.push(v("forbidden-path", `${f.path}: root-level .sql files (ad-hoc dumps) are never committed`));
  }
  return out;
}

const MIGRATION = /^packages\/db\/drizzle\/([^/]+\.sql)$/;

/** New or changed migrations pass the expand-only and RLS lints; a released one is never edited. */
export function checkMigrations(files: StagedFile[], released: ReadonlySet<string>): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    const m = MIGRATION.exec(f.path);
    if (!m) continue;
    if (f.status !== "A" && released.has(f.path)) {
      out.push(v("migration-immutable", `${f.path} is already released; never edit or remove it — add a new migration instead`));
      continue;
    }
    if (f.status === "D" || f.content === undefined) continue;
    const n = migrationNumber(m[1]);
    if (n === null) continue;
    if (n > LAST_GRANDFATHERED) {
      const unsafe = unsafeChanges(f.content);
      if (unsafe.length) out.push(v("migration-expand-only", `${f.path} is not expand-only (${unsafe.join(", ")}).\n${LINT_HELP}`));
    }
    if (n > LAST_WITHOUT_RLS) {
      const bare = tablesMissingRls(f.content);
      if (bare.length) out.push(v("migration-rls", `${f.path} creates ${bare.join(", ")} without RLS.\n${RLS_HELP}`));
    }
  }
  return out;
}

/** Svelte 5 runes only: no `$:` statements, no svelte/store, no `export let` props. */
export function checkSvelteRunes(path: string, content: string): Violation[] {
  if (!path.endsWith(".svelte")) return [];
  const out: Violation[] = [];
  content.split("\n").forEach((line, i) => {
    if (hasEscape(line, "runes")) return;
    const at = `${path}:${i + 1}`;
    if (/^\s*\$:\s/.test(line)) out.push(v("runes", `${at}: \`$:\` is legacy reactivity — use $derived / $effect`));
    if (/\bfrom\s+['"]svelte\/store['"]/.test(line)) out.push(v("runes", `${at}: svelte/store is legacy — use $state in a .svelte.ts module`));
    if (/^\s*export\s+let\s/.test(line)) out.push(v("runes", `${at}: \`export let\` is legacy props — use \`let { x } = $props()\``));
  });
  return out;
}

const ROUTES = /^apps\/web\/src\/routes\/.*\.svelte$/;
const WEB_SOURCE = /^apps\/web\/src\/.*\.(ts|svelte)$/;
export const EDEN_CLIENT = "apps/web/src/lib/api/treaty.ts";

export const RATCHET_HELP: Record<string, string> = {
  "raw-select": "a native <select>: use a Select component from src/lib/ui/ (AGENTS.md › Select Design)",
  "raw-textarea": "a raw <textarea>: use InputNote from src/lib/ui/",
  "raw-input": 'class="input" markup: use an Input component from src/lib/ui/',
  "raw-btn": 'class="btn" markup: use the Button component from src/lib/ui/',
  "raw-panel": 'class="panel" markup: use the Panel component from src/lib/ui/',
  "raw-fetch": "a hand-written fetch(): call the API through the Eden Treaty client (src/lib/api/treaty.ts)",
  "n-plus-one": "an API call per item of a list: add or reuse a list endpoint that returns the whole set in one call (AGENTS.md › No N+1 from the web)",
};

const API_CALL = /(?<![.\w$])(?:api|\w+Api)\.[A-Za-z]\w*\(/g;
const N_PLUS_ONE_OK = /guard-ok:\s*n\+1\b/;
/** Page code only: the route files, and the reads they delegate to (src/lib/pageLoads.ts). */
const N_PLUS_ONE_FILES = /^apps\/web\/src\/(routes\/.*\.svelte|lib\/pageLoads\.ts)$/;

/** The index just past the bracket that closes the one at `open`; the end of the text if it never closes. */
function closeOf(text: string, open: number): number {
  const pair: Record<string, string> = { "(": ")", "{": "}" };
  const [o, c] = [text[open], pair[text[open]]];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === o) depth++;
    else if (text[i] === c && --depth === 0) return i + 1;
  }
  return text.length;
}

/**
 * Lines (1-based) with an API call inside something that runs once per item: an async `.map` /
 * `.flatMap` / `.forEach` callback, a `.map` / `.flatMap` straight inside `Promise.all(…)`, or a
 * `for (… of|in …)` body. `// guard-ok: n+1 <why>` on the call's line or the loop's line clears it.
 */
export function nPlusOneLines(content: string): number[] {
  const lineAt = (i: number) => content.slice(0, i).split("\n").length;
  const lines = content.split("\n");
  const found = new Set<number>();
  const scan = (from: number, to: number, openerLine: number) => {
    for (const call of content.slice(from, to).matchAll(API_CALL)) {
      const line = lineAt(from + call.index);
      if (!N_PLUS_ONE_OK.test(lines[line - 1]) && !N_PLUS_ONE_OK.test(lines[openerLine - 1])) found.add(line);
    }
  };
  for (const m of content.matchAll(/\.(?:map|flatMap|forEach)\(/g)) {
    const open = m.index + m[0].length - 1;
    const asyncCb = /^\(\s*async\b/.test(content.slice(open, open + 40));
    const inPromiseAll = /Promise\.(?:all|allSettled)\(\s*[\w.$?!]*$/.test(content.slice(Math.max(0, m.index - 60), m.index));
    if (asyncCb || inPromiseAll) scan(open, closeOf(content, open), lineAt(m.index));
  }
  for (const m of content.matchAll(/\bfor\s+(?:await\s*)?\(/g)) {
    const open = m.index + m[0].length - 1;
    if (!/\b(?:of|in)\b/.test(content.slice(open, closeOf(content, open)))) continue;
    let body = closeOf(content, open);
    while (/\s/.test(content[body] ?? "")) body++;
    const end = content[body] === "{" ? closeOf(content, body) : Math.max(content.indexOf(";", body), content.indexOf("\n", body));
    scan(body, end < 0 ? content.length : end, lineAt(m.index));
  }
  return [...found].sort((a, b) => a - b);
}

/** Hand-rolled controls and fetch calls in one file, by rule. Zero-count rules are left out. */
export function countRatchets(path: string, content: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (rule: string, n = 1) => {
    if (n) counts[rule] = (counts[rule] ?? 0) + n;
  };
  if (N_PLUS_ONE_FILES.test(path)) add("n-plus-one", nPlusOneLines(content).length);
  const isRoute = ROUTES.test(path);
  const isWeb = WEB_SOURCE.test(path) && !isTestFile(path) && path !== EDEN_CLIENT;
  if (!isRoute && !isWeb) return counts;
  for (const line of content.split("\n")) {
    if (isRoute && !hasEscape(line, "raw-controls")) {
      add("raw-select", (line.match(/<select\b/g) ?? []).length);
      add("raw-textarea", (line.match(/<textarea\b/g) ?? []).length);
      for (const attr of line.matchAll(/\bclass="([^"]*)"/g)) {
        for (const token of attr[1].split(/\s+/)) {
          if (token === "input") add("raw-input");
          else if (token === "btn") add("raw-btn");
          else if (token === "panel") add("raw-panel");
        }
      }
    }
    if (isWeb && !hasEscape(line, "eden")) add("raw-fetch", (line.match(/(?<![.\w$])fetch\(/g) ?? []).length);
  }
  return counts;
}

/** rule → path → count, the committed `baseline.json`. */
export type Baseline = Record<string, Record<string, number>>;

/** Counts may fall (fix them as you pass) but never rise above what's committed. */
export function checkRatchet(files: { path: string; content: string }[], baseline: Baseline): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    for (const [rule, count] of Object.entries(countRatchets(f.path, f.content))) {
      const allowed = baseline[rule]?.[f.path] ?? 0;
      if (count > allowed) {
        out.push(v(rule, `${f.path}: ${count} (baseline ${allowed}) — ${RATCHET_HELP[rule]}. Or mark a justified line \`// guard-ok: ${rule === "raw-fetch" ? "eden" : rule === "n-plus-one" ? "n+1" : "raw-controls"} <why>\`.`));
      }
    }
  }
  return out;
}

/** The baseline for a set of files: what a clean checkout holds today. */
export function computeBaseline(files: { path: string; content: string }[]): Baseline {
  const out: Baseline = {};
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const [rule, count] of Object.entries(countRatchets(f.path, f.content))) (out[rule] ??= {})[f.path] = count;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

// ── push (pre-push) ─────────────────────────────────────────────────────────

/** Paths whose change in a release needs a prod dump first (AGENTS.md › Push or release). */
export const touchesData = (paths: string[]): boolean => paths.some((p) => /^packages\/db\/(drizzle\/|seed\/|library\/exercise-library\.json$)/.test(p));

export interface DumpFile {
  name: string;
  size: number;
  mtimeMs: number;
}

export const DUMP_DIR = "/tmp/program-tracker/db";

export function checkReleaseDump(p: { dataChanged: boolean; dumps: DumpFile[]; sinceMs: number; version: string }): Violation[] {
  if (!p.dataChanged) return [];
  const ok = p.dumps.some((d) => /^pre-v.*\.dump$/.test(d.name) && d.size > 0 && d.mtimeMs >= p.sinceMs);
  if (ok) return [];
  return [
    v(
      "release-dump",
      `this push ships database changes (packages/db drizzle/ or seed), and ${DUMP_DIR}/ has no non-empty pre-v*.dump newer than the last release tag.\nBack up prod first:\n  mkdir -p ${DUMP_DIR} && set -a && source .env.production && set +a && pg_dump "$DATABASE_URL" -Fc -f ${DUMP_DIR}/pre-v${p.version}-$(date +%Y%m%d-%H%M).dump`,
    ),
  ];
}

/** A `chore: release vX.Y.Z` HEAD must carry its tag and a changelog with no `[draft]` lines left. */
export function checkReleaseShape(p: { subject: string; headSha: string; tagCommit: string | null; changelog: string }): Violation[] {
  const m = /^chore: release v(\d+\.\d+\.\d+)$/.exec(p.subject);
  if (!m) return [];
  const out: Violation[] = [];
  if (p.tagCommit !== p.headSha) out.push(v("release-tag", `release commit v${m[1]} has no tag v${m[1]} on it — \`bun run release\` makes the commit and the tag together`));
  if (p.changelog.includes("[draft]")) out.push(v("release-draft", "CHANGELOG.md still has [draft] lines"));
  return out;
}

export const VERSION_TAG = /^v\d+\.\d+\.\d+$/;

// ── Claude hooks ────────────────────────────────────────────────────────────

/** Shell-ish tokens of one command: quotes grouped, no expansion. */
export function tokenize(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < cmd.length) {
      cur += cmd[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/** Command split at unquoted `;`, `&&`, `||`, `|`, `&` and newlines, each segment tokenized. */
export function segments(cmd: string): string[][] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === "\\" && i + 1 < cmd.length) {
      cur += c + cmd[++i];
    } else if (c === "&" && (cmd[i - 1] === ">" || cmd[i + 1] === ">")) {
      cur += c; // 2>&1, &>file: a redirect, not a command separator
    } else if (c === ";" || c === "|" || c === "&" || c === "\n") {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map(tokenize).filter((t) => t.length);
}

interface GitCall {
  sub: string;
  args: string[];
  /** `-c key=value` options before the subcommand */
  configs: string[];
}

/** `git [-C dir] [-c k=v] <sub> args…` → its parts, or null if the segment isn't git. */
function parseGit(tokens: string[]): GitCall | null {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++; // env prefix
  if (tokens[i] !== "git" && !tokens[i]?.endsWith("/git")) return null;
  i++;
  const configs: string[] = [];
  while (i < tokens.length && tokens[i].startsWith("-")) {
    if (tokens[i] === "-c" && tokens[i + 1] !== undefined) {
      configs.push(tokens[i + 1]);
      i += 2;
    } else if (tokens[i] === "-C" || tokens[i] === "--git-dir" || tokens[i] === "--work-tree") i += 2;
    else i++;
  }
  return i < tokens.length ? { sub: tokens[i], args: tokens.slice(i + 1), configs } : null;
}

/** Short options that take a value, so what follows is never a flag cluster. */
const COMMIT_VALUE_OPTS = new Set(["m", "F", "C", "c", "S", "u", "t", "s"]);

/** True when `git commit` args carry `-n` (alone or in a cluster like `-an`) — skipping hooks. */
export function commitSkipsHooks(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--no-verify") return true;
    if (a.startsWith("--")) {
      if (["--message", "--file", "--reuse-message", "--reedit-message", "--author", "--date"].includes(a)) i++;
      continue;
    }
    if (!a.startsWith("-") || a === "-") continue;
    const letters = a.slice(1);
    for (let k = 0; k < letters.length; k++) {
      if (letters[k] === "n") return true;
      if (COMMIT_VALUE_OPTS.has(letters[k])) {
        if (k === letters.length - 1) i++; // value is the next token
        break;
      }
    }
  }
  return false;
}

export interface BashContext {
  /** hook input carried an `agent_id`: the call comes from a subagent */
  subagent: boolean;
  branch: string | null;
  dirty: boolean;
}

const ENV_FILE = /(^|\/)\.env(\.(?!example$)[\w.-]+)?$/;
const READERS = new Set(["cat", "head", "tail", "less", "more", "bat", "source", ".", "cp", "tee", "grep", "rg", "sed", "awk"]);

/** What the Claude Bash hook refuses. Returns the reasons, empty to allow. */
export function checkBashCommand(command: string, ctx: BashContext, depth = 0): Violation[] {
  const out: Violation[] = [];
  for (const tokens of segments(command)) {
    // nested shell: bash -c "git commit --no-verify"
    const shell = tokens.findIndex((t) => /^(ba|z|da|k)?sh$/.test(t.split("/").pop() ?? ""));
    if (depth < 3 && shell >= 0 && shell <= 1) {
      const c = tokens.indexOf("-c", shell);
      if (c >= 0 && tokens[c + 1]) out.push(...checkBashCommand(tokens[c + 1], ctx, depth + 1));
    }
    if (tokens[0] === "eval" && depth < 3) out.push(...checkBashCommand(tokens.slice(1).join(" "), ctx, depth + 1));

    const git = parseGit(tokens);
    if (git) {
      const hooksPath = [...git.configs, ...(git.sub === "config" ? git.args : [])].some((t) => /^core\.hookspath/i.test(t));
      if (hooksPath) out.push(v("claude-hooks-path", "git hooks are the floor: never change core.hooksPath"));
      const hooked = ["commit", "push", "merge", "am", "cherry-pick", "rebase", "revert"].includes(git.sub);
      if (git.sub === "commit" ? commitSkipsHooks(git.args) : hooked && git.args.includes("--no-verify")) {
        out.push(v("claude-no-verify", `\`git ${git.sub}\` with --no-verify / -n skips the guards; fix what they report instead`));
      }
      if (git.sub === "push") {
        const force = git.args.some((a) => a === "-f" || a.startsWith("--force") || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a));
        const positional = git.args.filter((a) => !a.startsWith("-"));
        const toMain = positional.slice(1).some((a) => /(^|[:+])(main|master)$/.test(a)) || positional.length < 2;
        if (force && toMain) out.push(v("claude-force-push", "never force-push main (or an unnamed branch that may be main)"));
        if (ctx.subagent) out.push(v("claude-subagent-push", "subagents never push: the main thread does (AGENTS.md › Never delegate)"));
      }
      if (git.sub === "reset" && git.args.includes("--hard") && ctx.dirty && (ctx.branch === "main" || ctx.branch === null)) {
        out.push(v("claude-reset-hard", "`git reset --hard` on main with uncommitted changes would lose them"));
      }
    }
    if (ctx.subagent) {
      const runner = /^(bun|bunx|npm|pnpm)$/.test(tokens[0].split("/").pop()!);
      if (runner && (tokens.some((t, i) => t === "release" && tokens[i - 1] === "run") || tokens.some((t) => /(^|\/)release\.ts$/.test(t)))) out.push(v("claude-subagent-release", "subagents never cut a release (AGENTS.md › Never delegate)"));
      if (tokens.some((t) => t === "pg_dump" || t.endsWith("/pg_dump"))) out.push(v("claude-subagent-pg-dump", "subagents never dump the prod database (AGENTS.md › Never delegate)"));
      const reader = tokens.find((t) => READERS.has(t));
      if (reader && tokens.some((t) => ENV_FILE.test(t))) out.push(v("claude-subagent-env", "subagents never read .env files (AGENTS.md › Never delegate)"));
    }
  }
  return out;
}

/** Edit/Write targets the Claude hook refuses. `released` is the migration paths in the last tag. */
export function checkClaudePath(relPath: string, released: ReadonlySet<string>): Violation[] {
  const name = relPath.split("/").pop() ?? "";
  if (name === "COMMITS.md") return [v("claude-path", "COMMITS.md is generated by the post-commit hook; never edit it")];
  if (ENV_FILE.test(relPath)) return [v("claude-path", `${relPath}: env files hold secrets; never edit them`)];
  if (released.has(relPath)) return [v("claude-path", `${relPath} is a released migration; add a new one instead`)];
  return [];
}

/** PostToolUse feedback for an edited .svelte file: the runes and raw-control rules, one message. */
export function svelteFeedback(path: string, content: string, baseline: Baseline): string | null {
  const found = [...checkSvelteRunes(path, content), ...checkRatchet([{ path, content }], baseline)];
  return found.length ? `Guards: ${path} breaks a repo rule —\n${found.map((x) => `- ${x.message}`).join("\n")}` : null;
}
