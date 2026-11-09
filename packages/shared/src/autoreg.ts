import type { Equipment, OneRepMaxes } from "./domain";
import { oneRepMaxKg } from "./load";

// ---------------------------------------------------------------------------
// Load engine: RPE-aware e1RM, its inverse, loadable rounding, and the best
// estimate to suggest from — each traceable to where it came from. Pure.
// ---------------------------------------------------------------------------

/** Epley grows unreliable past this many reps (matches `estimate1rm`). */
export const E1RM_MAX_REPS = 12;

/** Reps in reserve: RPE 8 = 2 left. A missing RPE counts as 10 (to failure). */
const rir = (rpe: number | null | undefined) => (rpe == null ? 0 : Math.max(0, 10 - rpe));

/** Epley's multiplier with reps in reserve added; reps capped like `estimate1rm`. */
const factor = (reps: number, rpe: number | null | undefined) => 1 + (Math.min(reps, E1RM_MAX_REPS) + rir(rpe)) / 30;

/**
 * RPE-aware e1RM: `kg × (1 + (reps + (10 − rpe)) / 30)`, rounded to 0.1. A
 * missing RPE counts as 10, so it equals `estimate1rm` then. 0 when kg or
 * reps is not positive.
 */
export function e1rmAtRpe(kg: number, reps: number, rpe?: number | null): number {
  if (!(kg > 0) || !(reps > 0)) return 0;
  return Math.round(kg * factor(reps, rpe) * 10) / 10;
}

/** The load an e1RM gives for `reps` at `rpe` — the inverse of `e1rmAtRpe`, unrounded. */
export function loadFor(e1rm: number, reps: number, rpe?: number | null): number {
  if (!(e1rm > 0) || !(reps > 0)) return 0;
  return e1rm / factor(reps, rpe);
}

/** The smallest load jump an implement allows; null = it takes no load. */
export function loadStep(equipment: Equipment | null | undefined): number | null {
  switch (equipment) {
    case "bodyweight":
    case "band":
      return null;
    case "dumbbell":
    case "kettlebell":
      return 2;
    default:
      return 2.5;
  }
}

/**
 * A loadable weight at or under `kg`: down to 2.5 kg on barbells, machines
 * and cables, 2 kg on dumbbells and kettlebells. Null for bodyweight (and
 * bands), or when nothing loadable fits.
 */
export function roundLoad(kg: number, equipment: Equipment | null | undefined): number | null {
  const step = loadStep(equipment);
  if (step == null || !(kg > 0)) return null;
  // The epsilon keeps 102.5 / 2.5 = 40.999… from rounding a whole plate down.
  const out = Math.floor(kg / step + 1e-9) * step;
  return out > 0 ? Math.round(out * 100) / 100 : null;
}

// ---------------------------------------------------------------------------
// Best estimate: today → last 6 weeks → stored 1RM
// ---------------------------------------------------------------------------

/** History older than this many days doesn't count. */
export const E1RM_HISTORY_DAYS = 42;

export interface E1rmSet {
  exerciseId: string;
  kg: number | null | undefined;
  reps: number;
  rpe?: number | null;
}

export interface TodaySet extends E1rmSet {
  setNumber: number;
}

export interface HistorySet extends E1rmSet {
  /** ISO date (YYYY-MM-DD…) the set was logged. */
  date: string;
  /** A hold logged in seconds — never an e1RM. */
  timed?: boolean;
}

export type E1rmSource =
  | { kind: "today"; set: TodaySet }
  | { kind: "history"; set: HistorySet }
  | { kind: "stored" };

export interface BestE1rm {
  e1rm: number;
  source: E1rmSource;
  /** Where the number came from: "today's set 1: 100 × 5 @ 8.5", "Nov 2, 100 × 5 @ 8", "stored 1RM". */
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-02" → "Nov 2" — locale-free, so the label reads the same everywhere. */
export const shortDate = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** "100 × 5 @ 8"; no RPE → "100 × 5". */
export const fmtE1rmSet = (s: Pick<E1rmSet, "kg" | "reps" | "rpe">): string =>
  `${s.kg} × ${s.reps}${s.rpe != null ? ` @ ${s.rpe}` : ""}`;

/** ISO date `days` before `iso` (both YYYY-MM-DD, UTC arithmetic so no DST drift). */
function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function bestOf<S extends E1rmSet>(sets: S[]): { set: S; e1rm: number } | null {
  let out: { set: S; e1rm: number } | null = null;
  for (const s of sets) {
    const e = e1rmAtRpe(s.kg ?? 0, s.reps, s.rpe);
    if (e > 0 && (!out || e > out.e1rm)) out = { set: s, e1rm: e };
  }
  return out;
}

/**
 * The e1RM to suggest loads from, by priority: the best RPE-adjusted set
 * entered today; else the best in the last 6 weeks of logs (sets over 12 reps
 * and timed sets ignored); else the stored 1RM. Null = no basis to suggest.
 */
export function bestE1rm(
  exerciseId: string,
  ctx: { today?: TodaySet[]; history?: HistorySet[]; stored?: OneRepMaxes | null; now: string }
): BestE1rm | null {
  const today = bestOf((ctx.today ?? []).filter((s) => s.exerciseId === exerciseId));
  if (today) {
    return { e1rm: today.e1rm, source: { kind: "today", set: today.set }, label: `today's set ${today.set.setNumber}: ${fmtE1rmSet(today.set)}` };
  }
  const since = daysBefore(ctx.now, E1RM_HISTORY_DAYS);
  const recent = bestOf(
    (ctx.history ?? []).filter(
      (s) => s.exerciseId === exerciseId && !s.timed && s.reps <= E1RM_MAX_REPS && s.date.slice(0, 10) >= since && s.date.slice(0, 10) <= ctx.now.slice(0, 10)
    )
  );
  if (recent) {
    return {
      e1rm: recent.e1rm,
      source: { kind: "history", set: recent.set },
      label: `${shortDate(recent.set.date)}, ${fmtE1rmSet(recent.set)}`,
    };
  }
  const stored = oneRepMaxKg(ctx.stored, exerciseId);
  if (stored != null && stored > 0) return { e1rm: stored, source: { kind: "stored" }, label: "stored 1RM" };
  return null;
}
