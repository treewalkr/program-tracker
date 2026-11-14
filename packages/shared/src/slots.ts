import type { WeekProgression } from "./domain";
import { progressionLabel } from "./progression";

// ---------------------------------------------------------------------------
// Slot diff between two draft versions (chat page change lists)
// ---------------------------------------------------------------------------

/** Minimal set shape the slot diff reads (fits AiProgramDraft and web AiDraftDto). */
export interface SlotDiffSet {
  reps: number;
  amrap?: boolean;
  /** Lower bound of a rep range (`reps` is the upper bound). */
  repsMin?: number | null;
  durationSeconds?: number | null;
  targetWeightKg?: number | null;
  targetRpe?: number | null;
  /** Lower bound of an RPE range (`targetRpe` is the upper bound). */
  targetRpeMin?: number | null;
  percent1rm?: number | null;
  targetRir?: number | null;
  tempo?: string | null;
  /** AMRAP: stop at this RPE. */
  stopRpe?: number | null;
  restSeconds?: number | null;
  /** "working" (default) or "backoff". */
  type?: string | null;
}
export interface SlotDiffExercise {
  exerciseId?: string | null;
  exerciseName?: string | null;
  prescribedSets: SlotDiffSet[];
}
/** Cardio prescription fields the diff compares (fits CardioPrescription). */
export interface SlotDiffCardio {
  modality: string;
  durationMin?: number | null;
  hrZone?: number | null;
  intensity?: string | null;
  distanceKm?: number | null;
  targetRpe?: number | null;
}
export interface SlotDiffSession {
  name: string;
  kind?: string | null;
  type?: string | null;
  cardio?: SlotDiffCardio | null;
  exercises: SlotDiffExercise[];
}
/** Block plan fields the diff compares (fits Phasing and web ProgramPhasingDto). */
export interface PlanLike {
  plannedWeeks: number;
  phase: string;
  nextPhase?: string | null;
  weeks?: {
    week: number;
    directive: string;
    target?: { metric: string; deltaPercent: number } | null;
    progression?: { kind: string; amount: number } | null;
    note?: string | null;
  }[];
}
/** One week's sessions (a program week, or one week of a draft). */
export interface SlotDiffWeek {
  sessions: SlotDiffSession[];
}
/** A draft: every week (numbered, A/B letter when alternating) and its block plan. */
export interface SlotDiffDraft {
  weeks: (SlotDiffWeek & { week: number; rotation?: string | null })[];
  phasing?: PlanLike | null;
}

/**
 * swap/rx/added/removed: one exercise slot.
 * session: a session's name/kind/type changed, or the whole session was added/removed.
 * cardio: a cardio prescription field changed.
 * plan: a block plan (phasing) change.
 */
export type SlotChangeKind = "swap" | "rx" | "added" | "removed" | "session" | "cardio" | "plan";

export interface SlotChange {
  /** 1-based session index (same in both drafts); 0 for "plan". */
  day: number;
  /** 1-based exercise index in the BEFORE draft; null for "added" and session/cardio/plan. */
  beforeSlot: number | null;
  /** 1-based exercise index in the AFTER draft; null for "removed" and session/cardio/plan. */
  afterSlot: number | null;
  kind: SlotChangeKind;
  /**
   * Exercise name after the change (before, for "removed"); the session name
   * for session/cardio; the plan area ("Phase", "W4 target") for plan.
   */
  exercise: string;
  /** swap: old name · rx: old prescription parts · added: null · removed: old prescription ·
   *  session/cardio: old values of the changed fields (null when the session/cardio was added) · plan: old value. */
  from: string | null;
  /** swap: new name · rx: new prescription parts · added: new prescription · removed: null ·
   *  session/cardio: new values of the changed fields · plan: new value. */
  to: string | null;
  /**
   * The week the change is in (by number) when the drafts have more than one
   * week; absent for one-week drafts. plan: the plan week, or null for
   * block-level changes.
   */
  week?: number | null;
}

const exKey = (e: SlotDiffExercise) => (e.exerciseId ?? e.exerciseName ?? "").toLowerCase();
const exName = (e: SlotDiffExercise) => e.exerciseName ?? e.exerciseId ?? "Unmapped exercise";

function range(values: number[], prefix: string, suffix: string): string | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `${prefix}${lo}${suffix}` : `${prefix}${lo}–${hi}${suffix}`;
}

const setVolume = (s: SlotDiffSet) =>
  s.durationSeconds != null
    ? `${s.durationSeconds}s`
    : `${s.repsMin != null && s.repsMin < s.reps ? `${s.repsMin}–${s.reps}` : s.reps}${s.amrap ? "+" : ""}`;

function volumeOf(sets: SlotDiffSet[]): string {
  const each = sets.map(setVolume);
  return new Set(each).size === 1 ? `${sets.length}×${each[0]}` : each.join("/");
}

export interface RxParts {
  volume: string;
  load: string | null;
  pct: string | null;
  rpe: string | null;
  rir: string | null;
  stop: string | null;
  tempo: string | null;
  rest: string | null;
}
const RX_KEYS = ["volume", "load", "pct", "rpe", "rir", "stop", "tempo", "rest"] as const;
/** What an absent part reads as in a change ("no load" → "100 kg"). */
const RX_NONE: Record<(typeof RX_KEYS)[number], string> = {
  volume: "no volume",
  load: "no load",
  pct: "no %1RM",
  rpe: "no rpe",
  rir: "no RIR",
  stop: "no stop RPE",
  tempo: "no tempo",
  rest: "no rest",
};

const hasRpeRange = (sets: SlotDiffSet[]) => sets.some((s) => s.targetRpeMin != null && s.targetRpe != null);
const rpeToken = (s: SlotDiffSet) =>
  s.targetRpe == null ? null : s.targetRpeMin != null && s.targetRpeMin < s.targetRpe ? `${s.targetRpeMin}–${s.targetRpe}` : `${s.targetRpe}`;

/** "RPE 7–8": a ramp of single RPEs across sets collapses to lo–hi; per-set ranges stay per set when they differ. */
function rpeOf(sets: SlotDiffSet[]): string | null {
  if (!hasRpeRange(sets)) return range(sets.map((s) => s.targetRpe).filter((v): v is number => v != null), "RPE ", "");
  const tokens = sets.map(rpeToken).filter((t): t is string => t != null);
  const unique = [...new Set(tokens)];
  return unique.length === 1 ? `RPE ${unique[0]}` : `RPE ${tokens.join("/")}`;
}

/**
 * Prescription split into comparable parts, e.g.
 * { volume: "3×4–5", load: "100 kg", pct: "75% 1RM", rpe: "RPE 7–8", rir: "RIR 2",
 *   stop: "stop @ RPE 9", tempo: "tempo 3-1-1-0", rest: "rest 180s" }.
 * volume: "<sets>×<reps|min–max|Ns>" when every set matches, else per-set joined
 * by "/"; back-off sets follow as "+ 1×8 back-off".
 */
export function rxParts(sets: SlotDiffSet[]): RxParts {
  const working = sets.filter((s) => s.type !== "backoff");
  const backoff = sets.filter((s) => s.type === "backoff");
  const volume = [working.length ? volumeOf(working) : null, backoff.length ? `${volumeOf(backoff)} back-off` : null]
    .filter(Boolean)
    .join(" + ");
  const nums = (pick: (s: SlotDiffSet) => number | null | undefined) =>
    sets.map(pick).filter((v): v is number => v != null);
  const tempos = [...new Set(sets.map((s) => s.tempo).filter((v): v is string => !!v))];
  return {
    volume,
    load: range(nums((s) => s.targetWeightKg), "", " kg"),
    pct: range(nums((s) => s.percent1rm), "", "% 1RM"),
    rpe: rpeOf(sets),
    rir: range(nums((s) => s.targetRir), "RIR ", ""),
    stop: range(nums((s) => s.stopRpe), "stop @ RPE ", ""),
    tempo: tempos.length ? `tempo ${tempos.join("/")}` : null,
    rest: range(nums((s) => s.restSeconds), "rest ", "s"),
  };
}

/** "5×5 @RPE 7–8 · RIR 2 · 75% 1RM · 100 kg · tempo 3-1-1-0 · rest 180s" — one-line prescription label. */
export function rxLabel(sets: SlotDiffSet[]): string {
  const p = rxParts(sets);
  const tail = [p.stop, p.rir, p.pct, p.load, p.tempo, p.rest].filter(Boolean).map((t) => ` · ${t}`).join("");
  return `${p.volume}${p.rpe ? ` @${p.rpe}` : ""}${tail}`;
}

/** Only the parts that differ: ["rest 120s", "rest 150s"]; null when identical. */
function rxDelta(a: SlotDiffSet[], b: SlotDiffSet[]): [string, string] | null {
  const pa = rxParts(a);
  const pb = rxParts(b);
  const from: string[] = [];
  const to: string[] = [];
  for (const k of RX_KEYS) {
    if (pa[k] !== pb[k]) {
      from.push(pa[k] ?? RX_NONE[k]);
      to.push(pb[k] ?? RX_NONE[k]);
    } else if (k === "rpe" && pa.rpe && hasRpeRange(a) !== hasRpeRange(b)) {
      // Same text, different meaning: a ramp of single RPEs vs an RPE range on every set.
      from.push(`${pa.rpe} ${hasRpeRange(a) ? "range" : "ramp"}`);
      to.push(`${pb.rpe} ${hasRpeRange(b) ? "range" : "ramp"}`);
    }
  }
  return from.length ? [from.join(", "), to.join(", ")] : null;
}

/** Longest-common-subsequence pairs of equal keys: [beforeIndex, afterIndex][]. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** One step of an exercise alignment: [beforeIndex, afterIndex], either side null. */
export type AlignStep = [number | null, number | null];

/**
 * Exercise alignment of one session, in order. Exercises are aligned by
 * catalog id (else name) with an LCS; between two aligned anchors, unmatched
 * before/after exercises pair up in order (a swap), leftovers stand alone
 * (removed: [i, null], then added: [null, j]).
 */
export function alignExercises(A: SlotDiffExercise[], B: SlotDiffExercise[]): AlignStep[] {
  const pairs = lcsPairs(A.map(exKey), B.map(exKey));
  const anchors: [number, number][] = [[-1, -1], ...pairs, [A.length, B.length]];
  const out: AlignStep[] = [];
  for (let k = 0; k < anchors.length - 1; k++) {
    const [a0, b0] = anchors[k];
    const [a1, b1] = anchors[k + 1];
    const gapA: number[] = [];
    const gapB: number[] = [];
    for (let i = a0 + 1; i < a1; i++) gapA.push(i);
    for (let j = b0 + 1; j < b1; j++) gapB.push(j);
    const n = Math.min(gapA.length, gapB.length);
    for (let x = 0; x < n; x++) out.push([gapA[x], gapB[x]]);
    for (let x = n; x < gapA.length; x++) out.push([gapA[x], null]);
    for (let x = n; x < gapB.length; x++) out.push([null, gapB[x]]);
    if (k < pairs.length) out.push(pairs[k]);
  }
  return out;
}

/**
 * Exercise slot changes from `before` to `after`, per session, in after-order
 * (see alignExercises). Gap pairs are "swap"; aligned exercises whose name
 * changed are "swap" too, and whose volume, load, RPE or rest differ are "rx".
 * Sessions only in `after` are all "added"; sessions only in `before` are all
 * "removed". Session, cardio and plan changes are in diffDrafts.
 */
export function diffDraftSlots(before: SlotDiffWeek, after: SlotDiffWeek): SlotChange[] {
  const out: SlotChange[] = [];
  const days = Math.max(before.sessions.length, after.sessions.length);
  for (let d = 0; d < days; d++) {
    const A = before.sessions[d]?.exercises ?? [];
    const B = after.sessions[d]?.exercises ?? [];
    const day = d + 1;
    for (const [i, j] of alignExercises(A, B)) {
      if (i != null && j != null) {
        const ea = A[i];
        const eb = B[j];
        const matched = exKey(ea) === exKey(eb);
        if (!matched || exName(ea) !== exName(eb)) {
          out.push({ day, beforeSlot: i + 1, afterSlot: j + 1, kind: "swap", exercise: exName(eb), from: exName(ea), to: exName(eb) });
        }
        if (!matched) continue;
        const delta = rxDelta(ea.prescribedSets, eb.prescribedSets);
        if (delta) out.push({ day, beforeSlot: i + 1, afterSlot: j + 1, kind: "rx", exercise: exName(eb), from: delta[0], to: delta[1] });
      } else if (i != null) {
        const ea = A[i];
        out.push({ day, beforeSlot: i + 1, afterSlot: null, kind: "removed", exercise: exName(ea), from: rxLabel(ea.prescribedSets), to: null });
      } else if (j != null) {
        const eb = B[j];
        out.push({ day, beforeSlot: null, afterSlot: j + 1, kind: "added", exercise: exName(eb), from: null, to: rxLabel(eb.prescribedSets) });
      }
    }
  }
  return out;
}

// ---- session, cardio and plan changes ----

const CARDIO_FIELDS: { key: keyof SlotDiffCardio; label: (v: string | number) => string; none: string }[] = [
  { key: "modality", label: (v) => `${v}`, none: "no modality" },
  { key: "durationMin", label: (v) => `${v} min`, none: "no duration" },
  { key: "hrZone", label: (v) => `Z${v}`, none: "no zone" },
  { key: "intensity", label: (v) => `${v}`, none: "no intensity" },
  { key: "distanceKm", label: (v) => `${v} km`, none: "no distance" },
  { key: "targetRpe", label: (v) => `RPE ${v}`, none: "no RPE" },
];

/** "Bike · 30 min · Z3 · RPE 4" — one-line cardio label. */
export function cardioLabel(c: SlotDiffCardio): string {
  return CARDIO_FIELDS.filter((f) => c[f.key] != null && c[f.key] !== "")
    .map((f) => f.label(c[f.key] as string | number))
    .join(" · ");
}

/** Only the cardio fields that differ, as ["Z3, RPE 4", "Z4, RPE 3"]; null when identical. */
function cardioDelta(a: SlotDiffCardio, b: SlotDiffCardio): [string, string] | null {
  const from: string[] = [];
  const to: string[] = [];
  for (const f of CARDIO_FIELDS) {
    const x = a[f.key] ?? null;
    const y = b[f.key] ?? null;
    if (x === y) continue;
    from.push(x == null || x === "" ? f.none : f.label(x));
    to.push(y == null || y === "" ? f.none : f.label(y));
  }
  return from.length ? [from.join(", "), to.join(", ")] : null;
}

/** Session-level changes on one day: name/kind/type, cardio prescription, or the whole session added/removed. */
function sessionChanges(day: number, a: SlotDiffSession | undefined, b: SlotDiffSession | undefined): SlotChange[] {
  const base = { day, beforeSlot: null, afterSlot: null };
  if (!a && b) return [{ ...base, kind: "session", exercise: b.name, from: null, to: `added · ${b.name}` }];
  if (a && !b) return [{ ...base, kind: "session", exercise: a.name, from: a.name, to: "removed" }];
  if (!a || !b) return [];
  const out: SlotChange[] = [];
  const from: string[] = [];
  const to: string[] = [];
  const field = (x: string | null | undefined, y: string | null | undefined, none: string) => {
    if ((x ?? "") === (y ?? "")) return;
    from.push(x || none);
    to.push(y || none);
  };
  field(a.name, b.name, "no name");
  field(a.kind ?? "lifting", b.kind ?? "lifting", "lifting");
  field(a.type, b.type, "no type");
  if (from.length) out.push({ ...base, kind: "session", exercise: b.name, from: from.join(", "), to: to.join(", ") });
  const ca = a.cardio ?? null;
  const cb = b.cardio ?? null;
  if (ca && cb) {
    const delta = cardioDelta(ca, cb);
    if (delta) out.push({ ...base, kind: "cardio", exercise: b.name, from: delta[0], to: delta[1] });
  } else if (ca || cb) {
    out.push({ ...base, kind: "cardio", exercise: b.name, from: ca ? cardioLabel(ca) : null, to: cb ? cardioLabel(cb) : "no cardio" });
  }
  return out;
}

export type PlanWeekLike = NonNullable<PlanLike["weeks"]>[number];

/** "+5% volume", "-40% volume", "+2.5% load"; "" without a target. */
export function weekTargetLabel(w: PlanWeekLike): string {
  if (!w.target) return "";
  const metric = ({ overall_volume: "volume", rep_volume: "rep volume", intensity: "load" } as Record<string, string>)[w.target.metric] ?? w.target.metric;
  const sign = w.target.deltaPercent > 0 ? "+" : "";
  return `${sign}${w.target.deltaPercent}% ${metric}`;
}

export interface PlanChange {
  /** 1-based week, or null for phase-level changes. */
  week: number | null;
  where: string;
  from: string | null;
  to: string;
}

/** Block plan edits from `a` to `b` (phase names, length, weeks added/removed, directive, target, note). */
export function planChanges(a: PlanLike | null | undefined, b: PlanLike | null | undefined): PlanChange[] {
  const out: PlanChange[] = [];
  if (!a && !b) return out;
  if (!a && b) return [{ week: null, where: "Block plan", from: null, to: `added · ${b.weeks?.length ?? b.plannedWeeks} weeks` }];
  if (a && !b) return [{ week: null, where: "Block plan", from: `${a.weeks?.length ?? a.plannedWeeks} weeks`, to: "removed" }];
  const x = a!;
  const y = b!;
  if (x.phase !== y.phase) out.push({ week: null, where: "Phase", from: x.phase, to: y.phase });
  if ((x.nextPhase ?? "") !== (y.nextPhase ?? "")) out.push({ week: null, where: "Next block", from: x.nextPhase || "—", to: y.nextPhase || "—" });
  const xw = x.weeks ?? [];
  const yw = y.weeks ?? [];
  // Added/removed weeks already say the length changed.
  if (xw.length === yw.length && x.plannedWeeks !== y.plannedWeeks) {
    out.push({ week: null, where: "Planned weeks", from: `${x.plannedWeeks}`, to: `${y.plannedWeeks}` });
  }
  const n = Math.max(xw.length, yw.length);
  for (let i = 0; i < n; i++) {
    const p = xw[i];
    const q = yw[i];
    const week = i + 1;
    if (!p && q) {
      out.push({ week, where: `W${week}`, from: null, to: `added · ${q.directive}${q.target ? ` · ${weekTargetLabel(q)}` : ""}` });
      continue;
    }
    if (p && !q) {
      out.push({ week, where: `W${week}`, from: `${p.directive}${p.target ? ` · ${weekTargetLabel(p)}` : ""}`, to: "removed" });
      continue;
    }
    if (p.directive !== q.directive) out.push({ week, where: `W${week}`, from: p.directive, to: q.directive });
    if (weekTargetLabel(p) !== weekTargetLabel(q)) {
      out.push({ week, where: `W${week} target`, from: weekTargetLabel(p) || "no target", to: weekTargetLabel(q) || "no target" });
    }
    const prog = (w: PlanWeekLike) => (w.progression ? progressionLabel(w.progression as WeekProgression) : "no progression");
    if (prog(p) !== prog(q)) out.push({ week, where: `W${week} progression`, from: prog(p), to: prog(q) });
    if ((p.note ?? "") !== (q.note ?? "")) out.push({ week, where: `W${week} note`, from: null, to: "edited" });
  }
  return out;
}

/** Session and slot changes of one week, per session in day order (no week tag, no plan). */
export function diffWeekSessions(before: SlotDiffWeek, after: SlotDiffWeek): SlotChange[] {
  const slots = diffDraftSlots(before, after);
  const out: SlotChange[] = [];
  const days = Math.max(before.sessions.length, after.sessions.length);
  for (let d = 0; d < days; d++) {
    out.push(...sessionChanges(d + 1, before.sessions[d], after.sessions[d]));
    out.push(...slots.filter((c) => c.day === d + 1));
  }
  return out;
}

/**
 * Every change from `before` to `after`: week by week (matched by number), per
 * session in day order its session/cardio changes then its exercise slot
 * changes, then block plan changes (kind "plan", day 0). Changes carry their
 * `week` when either draft has more than one week.
 */
export function diffDrafts(before: SlotDiffDraft, after: SlotDiffDraft): SlotChange[] {
  const out: SlotChange[] = [];
  const tag = before.weeks.length > 1 || after.weeks.length > 1;
  const numbers = [...new Set([...before.weeks, ...after.weeks].map((w) => w.week))].sort((a, b) => a - b);
  for (const n of numbers) {
    const empty = { sessions: [] };
    const changes = diffWeekSessions(before.weeks.find((w) => w.week === n) ?? empty, after.weeks.find((w) => w.week === n) ?? empty);
    out.push(...(tag ? changes.map((c) => ({ ...c, week: n })) : changes));
  }
  for (const p of planChanges(before.phasing ?? null, after.phasing ?? null)) {
    out.push({ day: 0, week: p.week, beforeSlot: null, afterSlot: null, kind: "plan", exercise: p.where, from: p.from, to: p.to });
  }
  return out;
}

/** A change with every week it appears in (same day, slots, kind and values). */
export type WeeksChange = SlotChange & { weeks: number[] };

/**
 * Fold the same change made in several weeks into one row listing those
 * weeks ("swap Squat → Front Squat in W1, W3"), in first-seen order. Plan
 * changes and one-week changes stay as they are (weeks = [] when untagged).
 */
export function mergeWeekChanges(changes: readonly SlotChange[]): WeeksChange[] {
  const out: WeeksChange[] = [];
  const at = new Map<string, WeeksChange>();
  for (const c of changes) {
    if (c.kind === "plan" || c.week == null) {
      out.push({ ...c, weeks: c.kind === "plan" || c.week == null ? [] : [c.week] });
      continue;
    }
    const key = JSON.stringify([c.day, c.beforeSlot, c.afterSlot, c.kind, c.exercise, c.from, c.to]);
    const seen = at.get(key);
    if (seen) seen.weeks.push(c.week);
    else {
      const row = { ...c, weeks: [c.week] };
      at.set(key, row);
      out.push(row);
    }
  }
  return out;
}

/** Minimal proposal shape for matching (see ChatProposal in ai.ts). */
export interface ProposalChangeRef {
  /** Week whose slots day/slot address (absent = the first week). */
  week?: number | null;
  day: number;
  slot: number | null;
  kind: "swap" | "edit" | "add" | "remove";
}

/** The draft's weeks as the proposal sees them: number and A/B letter. */
export type ProposalWeeks = readonly { week: number; rotation?: string | null }[];

/**
 * Changes the proposal did not ask for. A proposal change at (week, day,
 * slot) covers every swap/rx/removed change at that day + beforeSlot in every
 * week with that week's letter (every week when the draft doesn't alternate);
 * each "add" covers one "added" change on its day per such week; an "edit"
 * with slot null (a cardio session edit) covers that day's cardio change.
 * Session and plan changes are never covered. Without `weeks` the draft is
 * one week.
 */
export function unproposedChanges(
  changes: SlotChange[],
  proposal: { changes: ProposalChangeRef[] },
  weeks: ProposalWeeks = []
): SlotChange[] {
  const first = weeks[0]?.week ?? 1;
  const reach = (week: number | null | undefined): number[] => {
    if (weeks.length === 0) return [first];
    const letter = weeks.find((w) => w.week === (week ?? first))?.rotation ?? null;
    return weeks.filter((w) => (w.rotation ?? null) === letter).map((w) => w.week);
  };
  const covered = new Set<string>();
  const addsLeft = new Map<string, number>();
  const cardioDays = new Set<string>();
  for (const p of proposal.changes) {
    for (const w of reach(p.week)) {
      if (p.slot != null) covered.add(`${w}:${p.day}:${p.slot}`);
      if (p.kind === "add") addsLeft.set(`${w}:${p.day}`, (addsLeft.get(`${w}:${p.day}`) ?? 0) + 1);
      if (p.kind === "edit" && p.slot == null) cardioDays.add(`${w}:${p.day}`);
    }
  }
  return changes.filter((c) => {
    if (c.kind === "session" || c.kind === "plan") return true;
    const at = `${weeks.length === 0 ? first : (c.week ?? first)}:${c.day}`;
    if (c.kind === "cardio") return !cardioDays.has(at);
    if (c.kind === "added") {
      const left = addsLeft.get(at) ?? 0;
      if (left > 0) {
        addsLeft.set(at, left - 1);
        return false;
      }
      return true;
    }
    return !covered.has(`${at}:${c.beforeSlot}`);
  });
}
