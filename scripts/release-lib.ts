/** Pure helpers for scripts/release.ts — kept separate so they can be tested. */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Next version: an explicit "x.y.z", else the patch bump (0.1.x stays 0.1.x until you say otherwise). */
export function nextVersion(current: string, explicit?: string): string {
  const cur = SEMVER.exec(current);
  if (!cur) throw new Error(`current version "${current}" is not x.y.z`);
  if (explicit) {
    const want = SEMVER.exec(explicit.replace(/^v/, ""));
    if (!want) throw new Error(`"${explicit}" is not x.y.z`);
    const rank = (m: RegExpExecArray) => [1, 2, 3].map((i) => Number(m[i]));
    const [a, b] = [rank(want), rank(cur)];
    const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    if (newer <= 0) throw new Error(`${explicit} is not newer than ${current}`);
    return want.slice(1).join(".");
  }
  return `${cur[1]}.${cur[2]}.${Number(cur[3]) + 1}`;
}

/** Release notes from one-line commit subjects: features, then fixes; chores and docs left out. */
export function releaseNotes(version: string, subjects: string[]): string {
  const pick = (type: string) =>
    subjects.filter((s) => s.startsWith(`${type}:`)).map((s) => `- ${s.slice(type.length + 1).trim()}`);
  const feats = pick("feat");
  const fixes = pick("fix");
  const out = [`v${version}`];
  if (feats.length) out.push("", "Features", ...feats);
  if (fixes.length) out.push("", "Fixes", ...fixes);
  if (!feats.length && !fixes.length) out.push("", "Maintenance only.");
  return out.join("\n");
}

// ── CHANGELOG.md ────────────────────────────────────────────────────────────

export const DRAFT = "[draft]";
const UNRELEASED = /^## Unreleased\s*$/;
const SECTION_ORDER = ["New", "Improved", "Fixed"];

/** Lines of the `## Unreleased` body: [start, end) indexes into `lines`, start after the heading. */
function unreleasedRange(lines: string[]): [number, number] {
  const head = lines.findIndex((l) => UNRELEASED.test(l));
  if (head < 0) throw new Error("CHANGELOG.md has no `## Unreleased` section");
  let end = head + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  return [head + 1, end];
}

/** Sections (`### Kind` → bullet lines) of a body; bullets above any `###` go under "". */
function bodySections(body: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let kind = "";
  for (const line of body) {
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) {
      kind = h[1];
      if (!sections.has(kind)) sections.set(kind, []);
    } else if (line.trim()) {
      if (!sections.has(kind)) sections.set(kind, []);
      sections.get(kind)!.push(line);
    }
  }
  return sections;
}

function renderBody(sections: Map<string, string[]>): string[] {
  const rank = (k: string) => (k === "" ? -1 : SECTION_ORDER.includes(k) ? SECTION_ORDER.indexOf(k) : SECTION_ORDER.length);
  const kinds = [...sections.keys()].filter((k) => sections.get(k)!.length).sort((a, b) => rank(a) - rank(b));
  const out: string[] = [""];
  for (const k of kinds) {
    if (k) out.push(`### ${k}`);
    out.push(...sections.get(k)!, "");
  }
  return out;
}

/** Ticket numbers a subject names: `fix: clearer rest timer (FB-012)` → [12]. Same rule as the deploy step. */
export function ticketNumbers(subject: string): number[] {
  return [...new Set([...subject.matchAll(/\bFB-(\d{1,9})\b/g)].map((m) => Number(m[1])))];
}

const handle = (n: number) => `FB-${String(n).padStart(3, "0")}`;

/** A ticket's comment as one line: first paragraph, whitespace collapsed, at most 140 characters. */
function ticketLine(comment: string): string {
  const text = comment.trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ");
  const capped = text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

/**
 * One commit subject → draft text: type prefix dropped, first letter
 * capitalised. When the subject names tickets that `tickets` knows, the line
 * is worded from the tickets (the trainer's own words) and keeps the handles
 * and the commit text as a hint: `Rest timer is hard to read (FB-012) — commit: clearer rest timer`.
 */
function draftText(subject: string, type: string, tickets: ReadonlyMap<number, string>): string | null {
  const m = new RegExp(`^${type}(\\([^)]*\\))?!?:\\s*(.+)$`).exec(subject);
  if (!m) return null;
  const numbers = ticketNumbers(m[2]).filter((n) => tickets.has(n));
  if (numbers.length) {
    const words = numbers.map((n) => ticketLine(tickets.get(n)!)).join("; ");
    const commit = m[2].replace(/\s*\((?:FB-\d+(?:,\s*)?)+\)\s*$/, "").trim();
    return `${words} (${numbers.map(handle).join(", ")}) — commit: ${commit}`;
  }
  return m[2].charAt(0).toUpperCase() + m[2].slice(1);
}

/**
 * Fill `## Unreleased` with draft lines from feat/fix subjects (New / Fixed), each marked `[draft]`.
 * Earlier `[draft]` lines are replaced; hand-written lines (no `[draft]`) are kept as they are.
 * `tickets` (number → comment) words the lines of subjects that name a ticket.
 */
export function draftChangelog(changelog: string, subjects: string[], tickets: ReadonlyMap<number, string> = new Map()): string {
  const lines = changelog.split("\n");
  const [start, end] = unreleasedRange(lines);
  const sections = bodySections(lines.slice(start, end));
  for (const [k, items] of sections) sections.set(k, items.filter((l) => !l.includes(DRAFT)));
  const add = (kind: string, type: string) => {
    const drafts = subjects.map((s) => draftText(s, type, tickets)).filter((t): t is string => !!t);
    if (!drafts.length) return;
    sections.set(kind, [...(sections.get(kind) ?? []), ...drafts.map((t) => `- ${DRAFT} ${t}`)]);
  };
  add("New", "feat");
  add("Fixed", "fix");
  return [...lines.slice(0, start), ...renderBody(sections), ...lines.slice(end)].join("\n");
}

/** Why `## Unreleased` isn't ready to release, or null when it is. */
export function unreleasedProblem(changelog: string): string | null {
  const lines = changelog.split("\n");
  const [start, end] = unreleasedRange(lines);
  const body = lines.slice(start, end);
  if (!body.some((l) => /^\s*[-*] /.test(l))) {
    return "## Unreleased in CHANGELOG.md is empty — run `bun run changelog:draft`, edit it, and commit";
  }
  if (body.some((l) => l.includes(DRAFT))) {
    return "## Unreleased in CHANGELOG.md still has [draft] lines — rewrite them for trainers and drop the marker";
  }
  return null;
}

/** Rename `## Unreleased` to `## vX.Y.Z — date` and open a fresh empty Unreleased above it. */
export function stampChangelog(changelog: string, version: string, date: string): string {
  const problem = unreleasedProblem(changelog);
  if (problem) throw new Error(problem);
  const lines = changelog.split("\n");
  const head = lines.findIndex((l) => UNRELEASED.test(l));
  lines.splice(head, 1, "## Unreleased", "", `## v${version} — ${date}`);
  return lines.join("\n");
}
