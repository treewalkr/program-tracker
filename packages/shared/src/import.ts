import { z } from "zod";
import type { CardioPrescription, PrescribedSet } from "./domain";
import { ImportNewTerm, filterNewTerms, type GlossaryTerm } from "./vocabulary";
import { withSetCount } from "./groups";

/**
 * Paste notes (docs/paste-import-plan.md): a trainer's plain-text program →
 * a reviewed draft. The LLM proposes an `ImportChunk` per chunk of lines; the
 * pure code here checks every value against the text, maps it onto the
 * program shapes, and groups weeks into blocks. Nothing is dropped silently —
 * whatever fails a check is flagged for the review.
 */

// ---------------------------------------------------------------------------
// LLM output — the only shape accepted from a chunk extraction
// ---------------------------------------------------------------------------

/** Optional fields: absent and null both mean "not in the text". */
const num = z.number().nullish();
const int = z.number().int().nullish();
const str = z.string().max(200).nullish();
const line = z.number().int().min(1);

export const ImportPrescription = z.object({
  /** Set count (a range's upper bound); null when the text gives none. */
  sets: z.number().int().nullable(),
  setsLow: int,
  /** Reps (a range's upper bound). */
  reps: int,
  repsLow: int,
  /** Different reps per set, e.g. a 10/8/6/5 pyramid. */
  repsList: z.array(z.number().int()).max(30).nullish(),
  /** Timed sets (upper bound when a range). */
  seconds: num,
  secondsLow: num,
  /** To failure (no rep target). */
  failure: z.boolean().nullish(),
  /** What `reps` counts. Absent = reps. */
  unit: z.enum(["reps", "rounds", "steps"]).nullish(),
});
export type ImportPrescription = z.infer<typeof ImportPrescription>;

/** One logged set from the text after " - " (history import, version 2). */
export const ImportActual = z.object({ reps: num, kg: num, seconds: num });
export type ImportActual = z.infer<typeof ImportActual>;

export const ImportExercise = z.object({
  line,
  /** The exercise name exactly as written ("SA Row", "BB standing bicpes"). */
  sourceName: z.string().min(1).max(200),
  /** Abbreviations expanded ("Single-Arm Row"). */
  name: z.string().min(1).max(200),
  /** Parenthesized technique tag: "Power", "PAILs/RAILs". */
  variation: str,
  /** Equipment note: "machine". */
  equipment: str,
  notes: z.string().max(500).nullish(),
  prescription: ImportPrescription.nullable(),
  actuals: z.array(ImportActual).max(30).nullish(),
  /** Superset letter ("A" for A1/A2 or the lines under one group header); null when alone. */
  group: z.string().max(3).nullish().catch(null),
});
export type ImportExercise = z.infer<typeof ImportExercise>;

export const ImportCardio = z.object({
  modality: z.string().min(1).max(80),
  durationMin: num,
  durationMinLow: num,
  hrZone: num,
  hrZoneLow: num,
  distanceKm: num,
  intensity: str,
  pace: str,
});
export type ImportCardio = z.infer<typeof ImportCardio>;

/** Blank or missing → "" (header-less notes); buildImportResult fills "Day N" / "Session N". */
const heading = (max: number) =>
  z.string().max(max).nullish().transform((v) => v?.trim() ?? "");

export const ImportSession = z.object({
  name: heading(160),
  kind: z.enum(["lifting", "cardio"]),
  /** Null when the notes have no session heading; buildImportResult anchors it. */
  line: line.nullish(),
  cardio: ImportCardio.nullish(),
  exercises: z.array(ImportExercise).max(60).default([]),
});
export type ImportSession = z.infer<typeof ImportSession>;

export const ImportDay = z.object({
  /** The day header as written ("Day 1 Back/Biceps"). */
  label: heading(160),
  /** Null when the notes have no day header; buildImportResult anchors it. */
  line: line.nullish(),
  sessions: z.array(ImportSession).max(20).default([]),
});
export type ImportDay = z.infer<typeof ImportDay>;

export const ImportWeek = z.object({
  /** "Week 11"; null when the text has no week headers. */
  label: z.string().max(80).nullable(),
  line: line.nullable(),
  /** A/B when the notes say the weeks alternate two routines ("Week A", "odd/even weeks"); absent otherwise. */
  rotation: z.enum(["A", "B"]).nullish(),
  days: z.array(ImportDay).max(20).default([]),
});
export type ImportWeek = z.infer<typeof ImportWeek>;

export const ImportChunk = z.object({
  weeks: z.array(ImportWeek).max(30).default([]),
  /** Lines deliberately left out, with why ("cardio heading", "chit-chat"). */
  skipped: z.array(z.object({ line, reason: z.string().max(200) })).max(500).default([]),
  /** Shorthand and technique words met in the lines that the prompt's vocabulary block lacks. */
  newTerms: z.array(ImportNewTerm).max(100).optional(),
});
export type ImportChunk = z.infer<typeof ImportChunk>;

// ---------------------------------------------------------------------------
// Text → numbered lines → chunks
// ---------------------------------------------------------------------------

export const IMPORT_MAX_CHARS = 20_000;

/** Lines of the paste, line endings normalized. Line N is `lines[N - 1]`. */
export function importLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** "L1: Week 11" — the form the LLM reads, global line numbers. */
export function numberedLines(lines: string[], from = 1, to = lines.length): string {
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`L${n}: ${lines[n - 1] ?? ""}`);
  return out.join("\n");
}

const hasContent = (s: string) => /[\p{L}\p{N}]/u.test(s);
export const WEEK_HEADER = /^\s*(week|wk|สัปดาห์)\s*\d+/i;

export interface ImportChunkRange {
  /** First and last line, 1-based, inclusive. */
  from: number;
  to: number;
}

const CHUNK_TARGET = 60;
const CHUNK_HARD_MAX = 90;

/**
 * Split at week headers; without any, at blank/separator lines into chunks of
 * about 60 lines. Chunks with no letters or digits are dropped.
 */
export function chunkLines(lines: string[]): ImportChunkRange[] {
  const ranges: ImportChunkRange[] = [];
  const headers = lines.flatMap((l, i) => (WEEK_HEADER.test(l) ? [i + 1] : []));
  if (headers.length > 0) {
    if (headers[0] > 1) ranges.push({ from: 1, to: headers[0] - 1 });
    headers.forEach((h, i) => ranges.push({ from: h, to: (headers[i + 1] ?? lines.length + 1) - 1 }));
  } else {
    let from = 1;
    for (let n = 1; n <= lines.length; n++) {
      const size = n - from + 1;
      const isBreak = !hasContent(lines[n - 1]);
      if ((size >= CHUNK_TARGET && isBreak) || size >= CHUNK_HARD_MAX) {
        ranges.push({ from, to: n });
        from = n + 1;
      }
    }
    if (from <= lines.length) ranges.push({ from, to: lines.length });
  }
  return ranges.filter((r) => lines.slice(r.from - 1, r.to).some(hasContent));
}

// ---------------------------------------------------------------------------
// Review result — what the API stores and the review screen renders
// ---------------------------------------------------------------------------

export type ImportFlagCode =
  | "not_found"
  | "in_name"
  | "used_twice"
  | "implausible"
  | "approximated"
  | "no_prescription"
  | "no_sets"
  | "no_reps"
  | "limit"
  | "split"
  | "group_sets";

export interface ImportFlag {
  /** warn = amber (check it); info = a note on how it was mapped. */
  level: "warn" | "info";
  code: ImportFlagCode;
  message: string;
  /** Stops "Use this" until resolved (the program limits). */
  blocking?: boolean;
  /** "actual": the flag is on a logged value — history import skips that exercise's numbers. */
  field?: "actual";
}

/** How an exercise was matched to the catalog (filled by the API, see importMatch.ts). */
export interface ImportMatch {
  kind: "alias" | "exact" | "fuzzy" | "new";
  /** Catalog exercise; absent for "new" (a custom exercise is created). */
  exerciseId?: string;
  exerciseName: string;
  /** Fuzzy only: the best catalog candidates, best first. */
  candidates?: { exerciseId: string; name: string; score: number }[];
}

export interface ReviewExercise extends ImportExercise {
  /** The prescription mapped onto the program's set shape. */
  sets: PrescribedSet[];
  /** Variation · equipment · notes · approximated wording. */
  note: string;
  flags: ImportFlag[];
  match?: ImportMatch;
}

export interface ReviewSession {
  name: string;
  kind: "lifting" | "cardio";
  line: number;
  /** The extraction as read (ranges intact) — `cardio` below is the mapped form. */
  source: ImportCardio | null;
  cardio: CardioPrescription | null;
  exercises: ReviewExercise[];
  flags: ImportFlag[];
}

export interface ReviewDay {
  label: string;
  line: number;
  sessions: ReviewSession[];
  flags: ImportFlag[];
}

export interface ReviewWeek {
  label: string | null;
  line: number | null;
  /** The notes' own A/B letter for the week (ImportWeek.rotation). */
  rotation?: "A" | "B";
  days: ReviewDay[];
  flags: ImportFlag[];
}

/** "Found A/B weeks": indexes into `weeks` of the latest A and the latest B week. */
export interface ImportAb {
  a: number;
  b: number;
  /** "notes": the notes say so (week letters); "pattern": W1 ≠ W2 and every week matches the one two before. */
  source: "notes" | "pattern";
}

export interface ImportBlock {
  /** Indexes into `weeks`, in order. The latest one is the template. */
  weeks: number[];
}

export interface ImportResult {
  lineCount: number;
  weeks: ReviewWeek[];
  skipped: { line: number; reason: string }[];
  /** Non-blank lines no item references and the LLM did not skip. */
  unused: number[];
  /** Chunks that could not be read (provider error, invalid output). */
  unread: (ImportChunkRange & { error: string })[];
  blocks: ImportBlock[];
  /** Index into `blocks` — the latest one. */
  defaultBlock: number;
  /** Blocks alternate A, B, A, B — both are kept as notes, one is drafted. */
  alternating: boolean;
  /** A/B weeks found (FB-013): the weeks to draft as Week A and Week B. Absent/null = one template week (and on older imports). */
  ab?: ImportAb | null;
  /** Words the trainer may add to their glossary (filterNewTerms). Absent on imports before v1.1. */
  newTerms?: ImportNewTerm[];
}

/** ai_imports.status — settle only ever moves a pending row. */
export const IMPORT_STATUSES = ["pending", "done", "failed", "cancelled"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** exercise_aliases.source. */
export const ALIAS_SOURCES = ["import", "manual", "seed"] as const;
export type AliasSource = (typeof ALIAS_SOURCES)[number];

export type ImportChunkOutcome = ImportChunkRange & ({ ok: true; data: ImportChunk } | { ok: false; error: string });

// ---------------------------------------------------------------------------
// Number checks
// ---------------------------------------------------------------------------

interface NumToken {
  value: number;
  start: number;
  inName: boolean;
  /** After the first " - " that follows the name: the actuals side. */
  after: boolean;
}

function numberTokens(text: string, nameSpan: [number, number] | null): NumToken[] {
  const dash = text.indexOf(" - ", nameSpan?.[1] ?? 0);
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => {
    const start = m.index ?? 0;
    return {
      value: Number(m[0]),
      start,
      inName: nameSpan !== null && start >= nameSpan[0] && start < nameSpan[1],
      after: dash >= 0 && start > dash,
    };
  });
}

/** Where the name as written sits in its line, through any (tags) right after it. */
function nameSpan(text: string, sourceName: string): [number, number] | null {
  const at = text.toLowerCase().indexOf(sourceName.toLowerCase().trim());
  if (at < 0 || !sourceName.trim()) return null;
  let end = at + sourceName.trim().length;
  for (let m = /^\s*\([^)]*\)/.exec(text.slice(end)); m; m = /^\s*\([^)]*\)/.exec(text.slice(end))) end += m[0].length;
  return [at, end];
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

/**
 * Every value has to be found in its line. Prescription values each claim
 * their own occurrence (one "3" can't be both sets and reps) and never one
 * inside the exercise name; actuals only need to be present.
 */
class NumberCheck {
  private claimed = new Set<number>();
  readonly flags: ImportFlag[] = [];
  constructor(private tokens: NumToken[]) {}

  /** `alts`: other values in the text that also justify this one (1 min → 60 s). */
  claim(
    label: string,
    value: number,
    opts: { alts?: number[]; prefer?: "before" | "after"; consume?: boolean; field?: "actual" } = {},
  ): boolean {
    const wanted = [value, ...(opts.alts ?? [])];
    const matches = this.tokens
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => wanted.some((w) => Math.abs(t.value - w) < 1e-9));
    const free = matches
      .filter(({ t, i }) => !t.inName && !(opts.consume !== false && this.claimed.has(i)))
      .sort((a, b) => Number(a.t.after !== (opts.prefer === "after")) - Number(b.t.after !== (opts.prefer === "after")));
    if (free.length > 0) {
      if (opts.consume !== false) this.claimed.add(free[0].i);
      return true;
    }
    if (matches.some(({ t }) => !t.inName)) {
      this.flag("used_twice", `${label} ${fmt(value)}: that number is already used for another value`, opts.field);
    } else if (matches.length > 0) {
      this.flag("in_name", `${label} ${fmt(value)}: this number looks like part of the name`, opts.field);
    } else {
      this.flag("not_found", `${label} ${fmt(value)}: value not found in the text`, opts.field);
    }
    return false;
  }

  private flag(code: ImportFlagCode, message: string, field?: "actual") {
    if (!this.flags.some((f) => f.message === message)) this.flags.push({ level: "warn", code, message, ...(field ? { field } : {}) });
  }
}

const perMinute = (seconds: number) => (Number.isInteger(seconds / 60) ? [seconds / 60] : []);

function checkPrescription(p: ImportPrescription, check: NumberCheck) {
  for (const r of p.repsList ?? []) check.claim("Reps", r);
  if (p.reps != null) check.claim("Reps", p.reps);
  if (p.repsLow != null) check.claim("Reps", p.repsLow);
  if (p.seconds != null) check.claim("Time", p.seconds, { alts: perMinute(p.seconds) });
  if (p.secondsLow != null) check.claim("Time", p.secondsLow, { alts: perMinute(p.secondsLow) });
  if (p.sets != null) {
    // a pyramid's set count is the length of its list, not written anywhere
    const implied = (p.repsList?.length ?? 0) === p.sets;
    if (!implied) check.claim("Sets", p.sets);
  }
  if (p.setsLow != null) check.claim("Sets", p.setsLow);
}

function checkActuals(actuals: ImportActual[], check: NumberCheck) {
  for (const a of actuals) {
    const opts = { prefer: "after", consume: false, field: "actual" } as const;
    if (a.reps != null) check.claim("Logged reps", a.reps, opts);
    if (a.kg != null) check.claim("Logged load", a.kg, opts);
    if (a.seconds != null) check.claim("Logged time", a.seconds, { ...opts, alts: perMinute(a.seconds) });
  }
}

// ---------------------------------------------------------------------------
// Plausibility
// ---------------------------------------------------------------------------

const unusual = (label: string, v: number): ImportFlag => ({
  level: "warn",
  code: "implausible",
  message: `${label} ${fmt(v)}: unusual value, check it`,
});

function plausibility(ex: ImportExercise): ImportFlag[] {
  const out: ImportFlag[] = [];
  const p = ex.prescription;
  const repsMax = p?.unit === "steps" || p?.unit === "rounds" ? 100 : 30;
  const within = (label: string, v: number | null | undefined, lo: number, hi: number) => {
    if (v != null && (v < lo || v > hi)) out.push(unusual(label, v));
  };
  if (p) {
    for (const r of [p.reps, p.repsLow, ...(p.repsList ?? [])]) within("Reps", r, 1, repsMax);
    within("Sets", p.sets, 1, 10);
    within("Sets", p.setsLow, 1, 10);
    within("Time", p.seconds, 1, 600);
    within("Time", p.secondsLow, 1, 600);
  }
  const logged = (label: string, v: number | null | undefined, lo: number, hi: number) => {
    if (v != null && (v < lo || v > hi)) out.push({ ...unusual(label, v), field: "actual" });
  };
  for (const a of ex.actuals ?? []) {
    logged("Logged reps", a.reps, 0, repsMax);
    logged("Logged load", a.kg, 0, 400);
    logged("Logged time", a.seconds, 1, 600);
  }
  return dedupe(out);
}

const dedupe = (flags: ImportFlag[]) => flags.filter((f, i) => flags.findIndex((g) => g.message === f.message) === i);

// ---------------------------------------------------------------------------
// Mapping onto PrescribedSet / CardioPrescription
// ---------------------------------------------------------------------------

export const IMPORT_LIMITS = { setsPerExercise: 20, exercisesPerSession: 20, daysPerWeek: 7, sessionsPerDay: 4 } as const;

const DEFAULT_TIMED_SECONDS = 30;

const range = (lo: number | null | undefined, hi: number, unit: string) => (lo != null && lo < hi ? `${fmt(lo)}–${fmt(hi)}${unit}` : `${fmt(hi)}${unit}`);

/** Sets for one exercise, plus the approximation notes and flags the mapping produced. */
/** Stretches, mobility and warm-up drills: no numbers is normal — everyone knows how long to hold them. */
export const isMobilityName = (name: string): boolean =>
  /\b(stretch\w*|mobility|mobilit\w*|foam roll\w*|warm[ -]?up|activation|cars|pails|rails|breathing|release|cool[ -]?down)\b/i.test(name);

const GROUP_WORD = /super\s?-?sets?|circuits?|giant\s?-?sets?|tri\s?-?sets?|ซุปเปอร์\s?เซ็?ต/i;
const TIMED_GROUP = /\b(?:emom|amrap|e\d+mom)\b|\d\s*(?:min|mins|minutes?|นาที)(?![a-z])/i;
const UNIT_COUNT = /(\d{1,2})\s*(?:sets?|rounds?)(?![a-z])|(\d{1,2})\s*(?:เซ็?ต|รอบ)/i;
const X_COUNT = /[x×]\s*(\d{1,2})(?!\s*[\d.])(?!\s*(?:reps?|kg|lbs?|s|sec|secs|seconds?|m|ครั้ง|วิ)(?![a-z]))/i;

/**
 * Set count from a group header the extraction put in an exercise's notes:
 * "Superset x 3 sets", "Supersets x 3sets", "Circuit – 3 rounds", "ซุปเปอร์เซ็ต 3 เซ็ต".
 * Null when there is no group word or the group is timed (EMOM, AMRAP, "10 min").
 */
export function groupSetCount(notes: string | null | undefined): number | null {
  if (!notes || !GROUP_WORD.test(notes) || TIMED_GROUP.test(notes)) return null;
  const m = notes.match(UNIT_COUNT) ?? notes.match(X_COUNT);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return n >= 1 && n <= IMPORT_LIMITS.setsPerExercise ? n : null;
}

/**
 * `groupSets`: the set count from the exercise's group header (groupSetCount).
 * It fills in only when the exercise gives no set count of its own.
 */
export function mapPrescription(
  p: ImportPrescription | null,
  name = "",
  groupSets: number | null = null,
): { sets: PrescribedSet[]; notes: string[]; flags: ImportFlag[] } {
  const notes: string[] = [];
  const flags: ImportFlag[] = [];
  const base = { type: "working" as const, amrap: false };
  const fromGroup = groupSets != null && (!p || (p.sets == null && !p.repsList?.length)) ? groupSets : null;
  if (fromGroup != null) flags.push({ level: "info", code: "group_sets", message: `${fromGroup} sets from the group header` });
  if (!p) {
    const count = fromGroup ?? 1;
    if (!isMobilityName(name)) {
      flags.push({ level: "warn", code: "no_prescription", message: `No sets/reps in the text — set to ${count} × ${DEFAULT_TIMED_SECONDS}s` });
    }
    const sets = Array.from({ length: count }, (_, i) => ({ ...base, setNumber: i + 1, reps: 0, durationSeconds: DEFAULT_TIMED_SECONDS }));
    return { sets, notes, flags };
  }
  if (fromGroup != null) p = { ...p, sets: fromGroup };

  if (p.setsLow != null && p.sets != null && p.setsLow < p.sets) {
    notes.push(range(p.setsLow, p.sets, " sets"));
    flags.push({ level: "info", code: "approximated", message: `${range(p.setsLow, p.sets, " sets")} → ${p.sets} sets` });
  }
  if (p.secondsLow != null && p.seconds != null && p.secondsLow < p.seconds) {
    notes.push(range(p.secondsLow, p.seconds, "s"));
    flags.push({ level: "info", code: "approximated", message: `${range(p.secondsLow, p.seconds, "s")} → ${fmt(p.seconds)}s` });
  }
  if (p.unit === "rounds" || p.unit === "steps") notes.push(p.unit);

  let reps: number[];
  if (p.repsList?.length) {
    reps = p.repsList;
  } else {
    let count = p.sets ?? 0;
    if (count < 1) {
      count = 1;
      flags.push({ level: "warn", code: "no_sets", message: "No set count in the text — using 1" });
    }
    reps = Array.from({ length: count }, () => p.reps ?? 0);
  }
  if (reps.length > IMPORT_LIMITS.setsPerExercise) {
    flags.push({ level: "warn", code: "limit", blocking: true, message: `${reps.length} sets — more than the ${IMPORT_LIMITS.setsPerExercise} an exercise can hold` });
    reps = reps.slice(0, IMPORT_LIMITS.setsPerExercise);
  }

  const timed = p.seconds != null && p.seconds > 0 ? Math.min(3600, Math.round(p.seconds)) : undefined;
  if (!p.failure && timed === undefined && reps.some((r) => !(r > 0))) {
    flags.push({ level: "warn", code: "no_reps", message: "No reps in the text — set to 10" });
  }
  const sets = reps.map((r, i): PrescribedSet => {
    const setNumber = i + 1;
    if (p.failure) return { ...base, setNumber, reps: 0, amrap: true };
    if (timed !== undefined) return { ...base, setNumber, reps: 0, durationSeconds: timed };
    const top = Math.min(100, r > 0 ? Math.round(r) : 10);
    const low = !p.repsList?.length && p.repsLow != null && p.repsLow > 0 && p.repsLow < top ? Math.round(p.repsLow) : undefined;
    return { ...base, setNumber, reps: top, ...(low !== undefined ? { repsMin: low } : {}) };
  });
  return { sets, notes, flags };
}

export function mapCardio(c: ImportCardio | null | undefined): { cardio: CardioPrescription; flags: ImportFlag[] } {
  const flags: ImportFlag[] = [];
  const words: string[] = [];
  if (c?.hrZoneLow != null && c.hrZone != null && c.hrZoneLow < c.hrZone) {
    words.push(`Zone ${range(c.hrZoneLow, c.hrZone, "")}`);
    flags.push({ level: "info", code: "approximated", message: `Zone ${range(c.hrZoneLow, c.hrZone, "")} → zone ${fmt(c.hrZone)}` });
  }
  if (c?.durationMinLow != null && c.durationMin != null && c.durationMinLow < c.durationMin) {
    words.push(range(c.durationMinLow, c.durationMin, " min"));
    flags.push({ level: "info", code: "approximated", message: `${range(c.durationMinLow, c.durationMin, " min")} → ${fmt(c.durationMin)} min` });
  }
  const intensity = [c?.intensity, c?.pace, ...words].filter(Boolean).join(" · ").slice(0, 60);
  const inRange = (v: number | null | undefined, lo: number, hi: number) => (v != null && v >= lo && v <= hi ? v : null);
  const zone = inRange(c?.hrZone, 1, 5);
  const minutes = inRange(c?.durationMin, 1, 300);
  const km = inRange(c?.distanceKm, 0.1, 300);
  return {
    cardio: {
      modality: c?.modality?.trim().slice(0, 80) || "Cardio",
      durationMin: minutes === null ? null : Math.round(minutes),
      hrZone: zone === null ? null : Math.round(zone),
      ...(intensity ? { intensity } : {}),
      ...(km !== null ? { distanceKm: km } : {}),
    },
    flags,
  };
}

function cardioFlags(c: ImportCardio | null | undefined, text: string): ImportFlag[] {
  if (!c) return [];
  const check = new NumberCheck(numberTokens(text, null));
  const out: ImportFlag[] = [];
  const val = (label: string, v: number | null | undefined, lo: number, hi: number, alts: number[] = []) => {
    if (v == null) return;
    check.claim(label, v, { alts });
    if (v < lo || v > hi) out.push(unusual(label, v));
  };
  // hours in the text justify minutes (1 h → 60 min)
  const perHour = (m: number | null | undefined) => (m != null && Number.isInteger(m / 60) ? [m / 60] : []);
  val("Minutes", c.durationMin, 1, 300, perHour(c.durationMin));
  val("Minutes", c.durationMinLow, 1, 300, perHour(c.durationMinLow));
  val("Zone", c.hrZone, 1, 5);
  val("Zone", c.hrZoneLow, 1, 5);
  val("Distance", c.distanceKm, 0, 300);
  return dedupe([...check.flags, ...out]);
}

function reviewExercise(ex: ImportExercise, lines: string[]): ReviewExercise {
  const text = lines[ex.line - 1] ?? "";
  const check = new NumberCheck(numberTokens(text, nameSpan(text, ex.sourceName)));
  if (ex.prescription) checkPrescription(ex.prescription, check);
  checkActuals(ex.actuals ?? [], check);
  const mapped = mapPrescription(ex.prescription, `${ex.sourceName} ${ex.name} ${ex.variation ?? ""}`, groupSetCount(ex.notes));
  const note = [ex.variation, ex.equipment, ex.notes, ...mapped.notes]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
    .join(" · ")
    .slice(0, 1000);
  return {
    ...ex,
    sets: mapped.sets,
    note,
    flags: dedupe([...check.flags, ...plausibility(ex), ...mapped.flags]),
  };
}

type LocatedSession = Omit<ImportSession, "line"> & { line: number };
type LocatedDay = Omit<ImportDay, "line" | "sessions"> & { line: number; sessions: LocatedSession[] };
type LocatedWeek = Omit<ImportWeek, "days"> & { days: LocatedDay[] };

/** Header-less notes leave days and sessions without a line: anchor them to their first exercise, else the chunk start. */
function locate(c: ImportChunk, from: number): LocatedWeek[] {
  return c.weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => {
      const sessions = d.sessions.map((s) => ({ ...s, line: s.line ?? s.exercises[0]?.line ?? d.line ?? from }));
      return { ...d, line: d.line ?? sessions[0]?.line ?? from, sessions };
    }),
  }));
}

function reviewSession(s: LocatedSession, lines: string[]): ReviewSession {
  const flags: ImportFlag[] = [];
  if (s.kind === "cardio") {
    const mapped = mapCardio(s.cardio);
    return {
      name: s.name,
      kind: "cardio",
      line: s.line,
      source: s.cardio ?? null,
      cardio: mapped.cardio,
      exercises: [],
      flags: dedupe([...cardioFlags(s.cardio, lines[s.line - 1] ?? ""), ...mapped.flags]),
    };
  }
  if (s.exercises.length > IMPORT_LIMITS.exercisesPerSession) {
    flags.push({
      level: "warn",
      code: "limit",
      blocking: true,
      message: `${s.exercises.length} exercises — more than the ${IMPORT_LIMITS.exercisesPerSession} a session can hold`,
    });
  }
  return {
    name: s.name,
    kind: "lifting",
    line: s.line,
    source: null,
    cardio: null,
    exercises: groupExercises(s.exercises.map((e) => reviewExercise(e, lines)), lines),
    flags,
  };
}

/** The group-header part of an exercise's notes ("Superset x 3 sets"), lowercased; null when none or timed. */
function groupHeaderKey(notes: string | null | undefined): string | null {
  if (!notes || !GROUP_WORD.test(notes) || TIMED_GROUP.test(notes)) return null;
  const part = notes.split(/\s*(?:[·;\n]|,\s)\s*/).find((x) => GROUP_WORD.test(x));
  return part ? part.trim().toLowerCase().replace(/\s+/g, " ") : null;
}

const PREFIX = /^\s*(?:[-*•]\s*)?([A-Za-z])\s?\d{1,2}(?:\s*[.):\-]\s*|\s+)(?=\S)/;

/**
 * Supersets: adjacent exercises sharing a list prefix letter (A1, A2), the
 * model's group letter, or the same group header in their notes become one
 * group — re-lettered A, B… by appearance, members' set counts brought up to
 * the largest. A note that is only the header is dropped (the group shows it).
 */
function groupExercises(list: ReviewExercise[], lines: string[]): ReviewExercise[] {
  const keys = list.map((e) => {
    const prefix = (lines[e.line - 1] ?? "").match(PREFIX)?.[1];
    if (prefix) return `p:${prefix.toUpperCase()}`;
    const letter = e.group?.trim().match(/^[A-Za-z]/)?.[0];
    if (letter) return `m:${letter.toUpperCase()}`;
    const header = groupHeaderKey(e.notes);
    return header ? `h:${header}` : null;
  });
  const out: ReviewExercise[] = [];
  let next = 0;
  for (let i = 0; i < list.length; ) {
    let j = i + 1;
    while (keys[i] != null && j < list.length && keys[j] === keys[i]) j++;
    const run = list.slice(i, j);
    if (run.length < 2 || next >= 26) {
      out.push(...run.map(({ group: _g, ...e }) => e));
    } else {
      const letter = String.fromCharCode(65 + next++);
      const rounds = Math.max(...run.map((e) => e.sets.length));
      for (const e of run) {
        const header = e.notes?.trim();
        const note = header && groupHeaderKey(header) === header.toLowerCase().replace(/\s+/g, " ")
          ? e.note.split(" · ").filter((x) => x !== header).join(" · ")
          : e.note;
        const sets = e.sets.length > 0 && e.sets.length < rounds ? withSetCount(e.sets, rounds) : e.sets;
        out.push({ ...e, group: letter, sets, note });
      }
    }
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block grouping
// ---------------------------------------------------------------------------

/** Lowercase, (tags) removed, punctuation removed, spaces collapsed. */
export function normalizeExerciseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
}

export const BLOCK_SIMILARITY = 0.6;

export function weekExerciseNames(w: { days: { sessions: { exercises: { sourceName: string }[] }[] }[] }): Set<string> {
  return new Set(w.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises.map((e) => normalizeExerciseName(e.sourceName)))));
}

/** Consecutive weeks with Jaccard ≥ 0.6 on their exercise names share a block. */
export function groupBlocks(weeks: { days: { sessions: { exercises: { sourceName: string }[] }[] }[] }[]): {
  blocks: ImportBlock[];
  alternating: boolean;
} {
  const names = weeks.map(weekExerciseNames);
  const blocks: ImportBlock[] = [];
  names.forEach((set, i) => {
    const last = blocks.at(-1);
    if (last && jaccard(names[last.weeks.at(-1)!], set) >= BLOCK_SIMILARITY) last.weeks.push(i);
    else blocks.push({ weeks: [i] });
  });
  const latest = (b: ImportBlock) => names[b.weeks.at(-1)!];
  const alternating =
    blocks.length >= 3 && blocks.slice(2).every((b, i) => jaccard(latest(b), latest(blocks[i])) >= BLOCK_SIMILARITY);
  return { blocks, alternating };
}

/**
 * A/B weeks (FB-013). The notes' own letters win: the latest A week and the
 * latest B week. Else the pattern: three or more weeks where week 1's and
 * week 2's exercises differ and every later week matches the week two before
 * (W3 ≈ W1, W4 ≈ W2…); odd weeks are A. null when neither holds.
 */
export function detectAb(
  weeks: { rotation?: "A" | "B" | null; days: { sessions: { exercises: { sourceName: string }[] }[] }[] }[]
): ImportAb | null {
  const lastOf = (letter: "A" | "B") => weeks.findLastIndex((w) => w.rotation === letter);
  const [ta, tb] = [lastOf("A"), lastOf("B")];
  if (ta >= 0 && tb >= 0) return { a: ta, b: tb, source: "notes" };
  if (weeks.length < 3) return null;
  const names = weeks.map(weekExerciseNames);
  if (names.some((n) => n.size === 0)) return null;
  if (jaccard(names[0], names[1]) >= BLOCK_SIMILARITY) return null;
  for (let i = 2; i < names.length; i++) if (jaccard(names[i], names[i - 2]) < BLOCK_SIMILARITY) return null;
  const last = weeks.length - 1;
  return last % 2 === 0 ? { a: last, b: last - 1, source: "pattern" } : { a: last - 1, b: last, source: "pattern" };
}

// ---------------------------------------------------------------------------
// Chunks → result
// ---------------------------------------------------------------------------

function mergeWeeks(chunks: LocatedWeek[][]): LocatedWeek[] {
  const out: LocatedWeek[] = [];
  for (const weeks of chunks) {
    for (const w of weeks) {
      const last = out.at(-1);
      // header-less text read in several chunks is still one week
      if (last && last.label === null && w.label === null && w.line === null) last.days.push(...structuredClone(w.days));
      else out.push(structuredClone(w));
    }
  }
  return out;
}

const dayNumber = (label: string): number | null => {
  const m = /^\s*day\s*(\d+)/i.exec(label);
  return m ? Number(m[1]) : null;
};

/**
 * Notes that number their days again ("Day 1 … Day 4", then "Day 1 … Day 3")
 * without a week header hold several weeks or phases: split there, so no
 * week runs past seven days. Each split is said in an info flag.
 */
export function splitRestartedDays(weeks: LocatedWeek[]): (LocatedWeek & { restartedAt?: number })[] {
  return weeks.flatMap((w) => {
    const parts: LocatedDay[][] = [[]];
    let prev: number | null = null;
    for (const d of w.days) {
      const n = dayNumber(d.label);
      if (n !== null && prev !== null && n <= prev && parts.at(-1)!.length > 0) parts.push([]);
      parts.at(-1)!.push(d);
      if (n !== null) prev = n;
    }
    if (parts.length === 1) return [w];
    return parts.map((days, i) => ({
      label: w.label ? `${w.label} (part ${i + 1})` : `Part ${i + 1}`,
      line: i === 0 ? w.line : days[0].line,
      days,
      ...(i > 0 ? { restartedAt: days[0].line } : {}),
    }));
  });
}

export function buildImportResult(
  text: string,
  outcomes: ImportChunkOutcome[],
  /** The trainer's effective glossary — terms already in it aren't offered as new. */
  glossary: Pick<GlossaryTerm, "term">[] = [],
): ImportResult {
  const lines = importLines(text);
  const ok = outcomes.flatMap((o) => (o.ok ? [o.data] : []));
  const unread = outcomes.flatMap((o) => (o.ok ? [] : [{ from: o.from, to: o.to, error: o.error }]));
  const weeks: ReviewWeek[] = splitRestartedDays(mergeWeeks(outcomes.flatMap((o) => (o.ok ? [locate(o.data, o.from)] : [])))).map((w) => {
    const flags: ImportFlag[] = [];
    if (w.restartedAt !== undefined) {
      flags.push({ level: "info", code: "split", message: `Day numbers start again at line ${w.restartedAt} — read as a new part` });
    }
    if (w.days.length > IMPORT_LIMITS.daysPerWeek) {
      flags.push({ level: "warn", code: "limit", blocking: true, message: `${w.days.length} days — more than ${IMPORT_LIMITS.daysPerWeek} in a week` });
    }
    return {
      label: w.label,
      line: w.line,
      ...(w.rotation ? { rotation: w.rotation } : {}),
      flags,
      days: w.days.map((d, di) => ({
        label: d.label || `Day ${di + 1}`,
        line: d.line,
        flags:
          d.sessions.length > IMPORT_LIMITS.sessionsPerDay
            ? [{ level: "warn", code: "limit", blocking: true, message: `${d.sessions.length} sessions — more than ${IMPORT_LIMITS.sessionsPerDay} in a day` }]
            : [],
        sessions: d.sessions.map((s, si) => reviewSession({ ...s, name: s.name || `Session ${si + 1}` }, lines)),
      })),
    };
  });

  const skipped = ok.flatMap((c) => c.skipped);
  const referenced = new Set<number>(skipped.map((s) => s.line));
  for (const w of weeks) {
    if (w.line !== null) referenced.add(w.line);
    for (const d of w.days) {
      referenced.add(d.line);
      for (const s of d.sessions) {
        referenced.add(s.line);
        for (const e of s.exercises) referenced.add(e.line);
      }
    }
  }
  const inUnread = (n: number) => unread.some((u) => n >= u.from && n <= u.to);
  const unused = lines.flatMap((l, i) => (hasContent(l) && !referenced.has(i + 1) && !inUnread(i + 1) ? [i + 1] : []));

  const { blocks, alternating } = groupBlocks(weeks);
  return {
    lineCount: lines.length,
    weeks,
    skipped,
    unused,
    unread,
    blocks,
    defaultBlock: Math.max(0, blocks.length - 1),
    alternating,
    ab: detectAb(weeks),
    newTerms: filterNewTerms(ok.flatMap((c) => c.newTerms ?? []), lines, glossary),
  };
}

// ---------------------------------------------------------------------------
// Block labels (review screen, history program names)
// ---------------------------------------------------------------------------

/** The week a block drafts from: its latest. */
export const templateWeekIndex = (r: ImportResult, block: number): number => r.blocks[block]?.weeks.at(-1) ?? 0;

/** The lifting session names of a week, in order, unique. */
export const liftingNames = (w: ReviewWeek | undefined): string[] =>
  [...new Set((w?.days ?? []).flatMap((d) => d.sessions.filter((s) => s.kind === "lifting").map((s) => s.name.trim())))].filter(Boolean);

/** "Week 11 (Back/Biceps · Chest/Triceps · Lower)"; "Week 3 – Week 5 (…)" for several. */
export function blockLabel(r: ImportResult, block: number): string {
  const weeks = r.blocks[block]?.weeks ?? [];
  const labels = weeks.map((i) => r.weeks[i]?.label).filter((l): l is string => !!l);
  const head =
    labels.length === 0 ? "Your notes" : labels.length === 1 ? labels[0] : `${labels[0]} – ${labels.at(-1)}`;
  const names = liftingNames(r.weeks[templateWeekIndex(r, block)]);
  return names.length ? `${head} (${names.join(" · ")})` : head;
}
