import { z } from "zod";
import type { CardioPrescription, PrescribedSet } from "./domain";

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

export const ImportSession = z.object({
  name: z.string().min(1).max(160),
  kind: z.enum(["lifting", "cardio"]),
  line,
  cardio: ImportCardio.nullish(),
  exercises: z.array(ImportExercise).max(60).default([]),
});
export type ImportSession = z.infer<typeof ImportSession>;

export const ImportDay = z.object({
  /** The day header as written ("Day 1 Back/Biceps"). */
  label: z.string().min(1).max(160),
  line,
  sessions: z.array(ImportSession).max(20).default([]),
});
export type ImportDay = z.infer<typeof ImportDay>;

export const ImportWeek = z.object({
  /** "Week 11"; null when the text has no week headers. */
  label: z.string().max(80).nullable(),
  line: line.nullable(),
  days: z.array(ImportDay).max(20).default([]),
});
export type ImportWeek = z.infer<typeof ImportWeek>;

export const ImportChunk = z.object({
  weeks: z.array(ImportWeek).max(30).default([]),
  /** Lines deliberately left out, with why ("cardio heading", "chit-chat"). */
  skipped: z.array(z.object({ line, reason: z.string().max(200) })).max(500).default([]),
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
  | "limit";

export interface ImportFlag {
  /** warn = amber (check it); info = a note on how it was mapped. */
  level: "warn" | "info";
  code: ImportFlagCode;
  message: string;
  /** Stops "Use this" until resolved (the program limits). */
  blocking?: boolean;
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
  days: ReviewDay[];
  flags: ImportFlag[];
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
}

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
  claim(label: string, value: number, opts: { alts?: number[]; prefer?: "before" | "after"; consume?: boolean } = {}): boolean {
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
      this.flag("used_twice", `${label} ${fmt(value)}: that number is already used for another value`);
    } else if (matches.length > 0) {
      this.flag("in_name", `${label} ${fmt(value)}: this number looks like part of the name`);
    } else {
      this.flag("not_found", `${label} ${fmt(value)}: value not found in the text`);
    }
    return false;
  }

  private flag(code: ImportFlagCode, message: string) {
    if (!this.flags.some((f) => f.message === message)) this.flags.push({ level: "warn", code, message });
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
    if (a.reps != null) check.claim("Logged reps", a.reps, { prefer: "after", consume: false });
    if (a.kg != null) check.claim("Logged load", a.kg, { prefer: "after", consume: false });
    if (a.seconds != null) check.claim("Logged time", a.seconds, { alts: perMinute(a.seconds), prefer: "after", consume: false });
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
  for (const a of ex.actuals ?? []) {
    within("Logged reps", a.reps, 0, repsMax);
    within("Logged load", a.kg, 0, 400);
    within("Logged time", a.seconds, 1, 600);
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
export function mapPrescription(p: ImportPrescription | null): { sets: PrescribedSet[]; notes: string[]; flags: ImportFlag[] } {
  const notes: string[] = [];
  const flags: ImportFlag[] = [];
  const base = { type: "working" as const, amrap: false };
  if (!p) {
    flags.push({ level: "warn", code: "no_prescription", message: `No sets/reps in the text — set to 1 × ${DEFAULT_TIMED_SECONDS}s` });
    return { sets: [{ ...base, setNumber: 1, reps: 0, durationSeconds: DEFAULT_TIMED_SECONDS }], notes, flags };
  }

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
  const mapped = mapPrescription(ex.prescription);
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

function reviewSession(s: ImportSession, lines: string[]): ReviewSession {
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
    exercises: s.exercises.map((e) => reviewExercise(e, lines)),
    flags,
  };
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

// ---------------------------------------------------------------------------
// Chunks → result
// ---------------------------------------------------------------------------

function mergeWeeks(chunks: ImportChunk[]): ImportWeek[] {
  const out: ImportWeek[] = [];
  for (const c of chunks) {
    for (const w of c.weeks) {
      const last = out.at(-1);
      // header-less text read in several chunks is still one week
      if (last && last.label === null && w.label === null && w.line === null) last.days.push(...structuredClone(w.days));
      else out.push(structuredClone(w));
    }
  }
  return out;
}

export function buildImportResult(text: string, outcomes: ImportChunkOutcome[]): ImportResult {
  const lines = importLines(text);
  const ok = outcomes.flatMap((o) => (o.ok ? [o.data] : []));
  const unread = outcomes.flatMap((o) => (o.ok ? [] : [{ from: o.from, to: o.to, error: o.error }]));
  const weeks: ReviewWeek[] = mergeWeeks(ok).map((w) => {
    const flags: ImportFlag[] = [];
    if (w.days.length > IMPORT_LIMITS.daysPerWeek) {
      flags.push({ level: "warn", code: "limit", blocking: true, message: `${w.days.length} days — more than ${IMPORT_LIMITS.daysPerWeek} in a week` });
    }
    return {
      label: w.label,
      line: w.line,
      flags,
      days: w.days.map((d) => ({
        label: d.label,
        line: d.line,
        flags:
          d.sessions.length > IMPORT_LIMITS.sessionsPerDay
            ? [{ level: "warn", code: "limit", blocking: true, message: `${d.sessions.length} sessions — more than ${IMPORT_LIMITS.sessionsPerDay} in a day` }]
            : [],
        sessions: d.sessions.map((s) => reviewSession(s, lines)),
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
  };
}
