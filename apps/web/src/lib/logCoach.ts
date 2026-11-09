import {
  bestE1rm,
  e1rmAtRpe,
  estimate1rm,
  fmtE1rmSet,
  loadFor,
  loadStep,
  roundLoad,
  type Equipment,
  type E1rmHistorySet,
  type OneRepMaxes,
  type E1rmTodaySet,
} from "@pt/shared";
import { cellNumber, type Prescription, type SheetRow } from "./logSheet";

/**
 * The log sheet's coaching: a suggested load per set, live feedback per entered
 * set (e1RM, PR, RPE off target) and the sets that retarget after an
 * off-target one. Pure — recomputed from the rows on every edit; nothing here
 * is stored or sent.
 */

export interface CoachRow extends SheetRow {
  /** null = an extra set: nothing was prescribed. */
  rx: Prescription | null;
  timed: boolean;
}

export interface CoachCtx {
  equipmentOf: (exerciseId: string) => Equipment | null | undefined;
  /** Every logged set before today, timed holds marked (see `historySets`). */
  history: E1rmHistorySet[];
  stored: OneRepMaxes | null | undefined;
  /** Today, YYYY-MM-DD. */
  now: string;
}

export interface Suggestion {
  kg: number;
  /** "From today's set 1: 100 × 5 @ 8.5 · e1RM 120" */
  source: string;
  /** Retargeted from an off-target set today. */
  adjusted: boolean;
}

export interface RpeOff {
  actual: number;
  target: number;
  dir: "hot" | "easy";
}

export interface SetFeedback {
  /** RPE-aware e1RM; null without kg and reps. */
  e1rm: number | null;
  /** Plain-Epley e1RM beats every logged set of the exercise (block pulse's measure). */
  pr: boolean;
  rpeOff: RpeOff | null;
}

export interface SheetCoach {
  /** Row key → the load to suggest; only rows whose kg cell is blank. */
  suggest: Map<string, Suggestion>;
  /** Row key → feedback; only rows with something entered. */
  feedback: Map<string, SetFeedback>;
  /** programExerciseId → "Next sets adjusted to 67.5 (set 1 ran hot)". */
  adjusted: Map<string, string>;
}

/** RPE this far over target reads as hot, this far under as easy. */
export const RPE_HOT = 1;
export const RPE_EASY = 1.5;

/** Off target: ≥ 1 over or ≥ 1.5 under. Null when on target or either side is missing. */
export function rpeOff(actual: number | null | undefined, target: number | null | undefined): RpeOff | null {
  if (actual == null || target == null || !Number.isFinite(actual)) return null;
  if (actual - target >= RPE_HOT) return { actual, target, dir: "hot" };
  if (target - actual >= RPE_EASY) return { actual, target, dir: "easy" };
  return null;
}

/** A cell's positive number, else null. */
const pos = (v: SheetRow["weight"]): number | null => {
  const n = cellNumber(v);
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : null;
};

/** A set that happened today with a load: kg and reps entered, not skipped, not a hold. */
function todaySet(r: CoachRow): E1rmTodaySet | null {
  if (r.skipped || r.timed) return null;
  const kg = pos(r.weight);
  const reps = pos(r.reps);
  if (kg == null || reps == null || !Number.isInteger(reps)) return null;
  const rpe = cellNumber(r.rpe);
  return { exerciseId: r.exerciseId, setNumber: r.setNumber, kg, reps, rpe: rpe !== undefined && Number.isFinite(rpe) ? rpe : null };
}

/** The target RPE a set's feedback compares against; AMRAPs stop at theirs, so no "off". */
const targetRpe = (r: CoachRow): number | null => (r.rx && !r.rx.amrap ? r.rx.targetRpe ?? null : null);

/** Flatten logs into history sets; `isTimed` marks holds (logged in seconds). */
export function historySets(
  logs: { date: string; sets: { programExerciseId?: string | null; exerciseId: string; weightKg?: number | null; reps: number; rpe?: number | null }[] }[],
  isTimed: (s: { programExerciseId?: string | null; exerciseId: string }) => boolean
): E1rmHistorySet[] {
  return logs.flatMap((l) =>
    l.sets.map((s) => ({
      exerciseId: s.exerciseId,
      date: l.date.slice(0, 10),
      kg: s.weightKg != null ? Number(s.weightKg) : null,
      reps: s.reps,
      rpe: s.rpe != null ? Number(s.rpe) : null,
      timed: isTimed(s),
    }))
  );
}

/** Best plain-Epley e1RM per exercise over all of history — what a PR must beat. */
function historyBests(history: E1rmHistorySet[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of history) {
    if (s.timed || !s.kg) continue;
    const e = estimate1rm(s.kg, s.reps);
    if (e > (out.get(s.exerciseId) ?? 0)) out.set(s.exerciseId, e);
  }
  return out;
}

const fmtKg = (n: number) => String(Math.round(n * 10) / 10);
const setName = (r: Pick<CoachRow, "type" | "setNumber">) => `${r.type === "backoff" ? "back-off set" : "set"} ${r.setNumber}`;

/**
 * The sheet's coaching from its rows. A suggestion needs target reps and RPE
 * (a back-off without RPE keeps the plan's drop from its top set instead),
 * a loadable implement, and a blank kg cell — typed and filled-down loads are
 * never second-guessed.
 */
export function coachSheet(rows: CoachRow[], ctx: CoachCtx): SheetCoach {
  const suggest = new Map<string, Suggestion>();
  const feedback = new Map<string, SetFeedback>();
  const adjusted = new Map<string, string>();
  const bests = historyBests(ctx.history);

  const today: E1rmTodaySet[] = [];
  const entered = new Map<string, E1rmTodaySet>();
  for (const r of rows) {
    const t = todaySet(r);
    if (t) {
      today.push(t);
      entered.set(r.key, t);
    }
  }

  // ---- Feedback on what's entered ----
  const prBar = new Map(bests);
  for (const r of rows) {
    if (r.skipped) continue;
    const t = entered.get(r.key);
    const rpe = cellNumber(r.rpe);
    const off = pos(r.reps) != null ? rpeOff(rpe, targetRpe(r)) : null;
    if (!t && !off) continue;
    let pr = false;
    if (t) {
      const plain = estimate1rm(t.kg!, t.reps);
      const bar = prBar.get(r.exerciseId) ?? 0;
      // No history → nothing to beat; a first session isn't a PR.
      pr = bests.has(r.exerciseId) && plain > bar;
      if (plain > bar) prBar.set(r.exerciseId, plain);
    }
    feedback.set(r.key, { e1rm: t ? e1rmAtRpe(t.kg!, t.reps, t.rpe) : null, pr, rpeOff: off });
  }

  // The last entered set of each exercise, when it ran off target: later sets retarget from it.
  const lastOff = new Map<string, { row: CoachRow; set: E1rmTodaySet; off: RpeOff }>();
  for (const r of rows) {
    const t = entered.get(r.key);
    if (!t) continue;
    const off = feedback.get(r.key)?.rpeOff ?? null;
    if (off) lastOff.set(r.exerciseId, { row: r, set: t, off });
    else lastOff.delete(r.exerciseId);
  }

  // ---- Suggestions for the sets still to do ----
  for (const r of rows) {
    if (r.skipped || r.timed || !r.rx || r.rx.amrap || r.rx.durationSeconds != null) continue;
    if (cellNumber(r.weight) !== undefined) continue;
    const eq = ctx.equipmentOf(r.exerciseId);
    if (loadStep(eq) == null) continue;
    const reps = r.rx.repsMin ?? r.rx.reps;
    if (!(reps > 0)) continue;
    const rpe = r.rx.targetRpe;

    if (rpe != null) {
      const off = lastOff.get(r.exerciseId);
      const base = off
        ? { e1rm: e1rmAtRpe(off.set.kg!, off.set.reps, off.set.rpe), label: `today's ${setName(off.row)}: ${fmtE1rmSet(off.set)}` }
        : bestE1rm(r.exerciseId, { today, history: ctx.history, stored: ctx.stored, now: ctx.now });
      if (!base) continue;
      const kg = roundLoad(loadFor(base.e1rm, reps, rpe), eq);
      if (kg == null) continue;
      suggest.set(r.key, { kg, source: `From ${base.label} · e1RM ${fmtKg(base.e1rm)}`, adjusted: !!off });
      continue;
    }

    if (r.type === "backoff") {
      const s = backoffFromTop(r, rows, entered, eq);
      if (s) suggest.set(r.key, s);
    }
  }

  // ---- The line under each card whose sets moved ----
  for (const r of rows) {
    const s = suggest.get(r.key);
    if (!s?.adjusted || adjusted.has(r.programExerciseId)) continue;
    const off = lastOff.get(r.exerciseId)!;
    adjusted.set(r.programExerciseId, `Next sets adjusted to ${fmtKg(s.kg)} (${setName(off.row)} ran ${off.off.dir})`);
  }

  return { suggest, feedback, adjusted };
}

/**
 * A back-off with no target RPE keeps the plan's drop: planned back-off kg ÷
 * planned top-set kg, applied to the heaviest top set entered today.
 */
function backoffFromTop(r: CoachRow, rows: CoachRow[], entered: Map<string, E1rmTodaySet>, eq: Equipment | null | undefined): Suggestion | null {
  const planned = r.rx?.targetWeightKg;
  if (!planned) return null;
  const isTop = (x: CoachRow) => x.type !== "backoff" && !x.extra && x.exerciseId === r.exerciseId;
  // The top set of the same card, else of the same lift elsewhere on the sheet.
  const same = rows.filter((x) => isTop(x) && x.programExerciseId === r.programExerciseId);
  const tops = same.length ? same : rows.filter(isTop);
  const planTop = Math.max(0, ...tops.map((x) => x.rx?.targetWeightKg ?? 0));
  const done = tops.map((x) => entered.get(x.key)).filter((t): t is E1rmTodaySet => !!t);
  if (!planTop || !done.length) return null;
  const top = done.reduce((a, b) => (b.kg! > a.kg! ? b : a));
  const ratio = planned / planTop;
  const kg = roundLoad(top.kg! * ratio, eq);
  if (kg == null) return null;
  return { kg, source: `${Math.round(ratio * 100)}% of today's top set (${top.kg} kg), as planned`, adjusted: false };
}

/** Show the "→ 102.5" chip: the plan has a kg and the suggestion is at least one load step away. */
export function chipFor(r: CoachRow, s: Suggestion | undefined, equipment: Equipment | null | undefined): number | null {
  const planned = r.rx?.targetWeightKg;
  const step = loadStep(equipment);
  if (!s || planned == null || step == null) return null;
  return Math.abs(s.kg - planned) >= step - 1e-9 ? s.kg : null;
}
