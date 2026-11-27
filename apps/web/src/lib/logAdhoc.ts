import {
  applyForward,
  forwardWeeks,
  sessionKey,
  type ForwardResult,
  type Phasing,
  type PrescribedSet,
  type ProgramExercise,
  type ProgramSession,
  type ProgramWeek,
  type WeekEdit,
} from "@pt/shared";
import type { WeekTabDate } from "./programEdit";
import type { SheetRow } from "./logSheet";

// ---------------------------------------------------------------------------
// An exercise added on the floor, beyond the program session (FB-029).
//
// Its sets sit on the sheet under a client-side slot id (`adhoc:<uuid>`) so the
// row helpers group them like any card; the save sends them with no program
// slot (programExerciseId null), which is what the API stores as ad-hoc.
// Pure: the page only wires them.
// ---------------------------------------------------------------------------

/** Client-side slot id of an added exercise; it never reaches the API (see `wirePe`). */
export const ADHOC_PREFIX = "adhoc:";
export const isAdhocSlot = (programExerciseId: string): boolean => programExerciseId.startsWith(ADHOC_PREFIX);
/** The program slot as the API stores it: an added exercise has none. */
export const wirePe = (programExerciseId: string): string | null => (isAdhocSlot(programExerciseId) ? null : programExerciseId);
/** Nothing was prescribed for the set: an extra set, or any set of an added exercise. */
export const isUnplanned = (r: Pick<SheetRow, "extra" | "programExerciseId">): boolean => !!r.extra || isAdhocSlot(r.programExerciseId);

/** Drop a whole added exercise (every set) before it is saved. Programmed slots are never touched. */
export const withoutAdhoc = <R extends SheetRow>(rows: R[], programExerciseId: string): R[] =>
  isAdhocSlot(programExerciseId) ? rows.filter((r) => r.programExerciseId !== programExerciseId) : rows;

/** Switch "also add to program" on every set of an added exercise. */
export const withToProgram = <R extends SheetRow>(rows: R[], programExerciseId: string, on: boolean): R[] =>
  rows.map((r) => (r.programExerciseId === programExerciseId ? { ...r, toProgram: on } : r));

/** With no history: three sets of ten, no load. */
export const ADHOC_DEFAULT = { sets: 3, reps: 10 } as const;
const MAX_ADHOC_SETS = 20;

/** One set of the opening card: a load (kg, null = none) and a rep count. */
export interface AdhocSet {
  weightKg: number | null;
  reps: number;
}

interface HistoryLog {
  date: string;
  sets: { programExerciseId?: string | null; exerciseId: string; setNumber: number; type?: string; weightKg?: number | string | null; reps: number }[];
}

/**
 * The card an added exercise opens with: the member's last sets of it — the
 * newest log that has it, one program slot's worth (a log may hold it twice),
 * in set order — else the default. A hold logged in seconds keeps its number.
 */
export function adhocPrefill(logs: readonly HistoryLog[], exerciseId: string): AdhocSet[] {
  const newest = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const log of newest) {
    const mine = log.sets.filter((s) => s.exerciseId === exerciseId);
    if (mine.length === 0) continue;
    const first = mine[0].programExerciseId ?? null;
    const slot = mine.filter((s) => (s.programExerciseId ?? null) === first).sort((a, b) => a.setNumber - b.setNumber);
    return slot.slice(0, MAX_ADHOC_SETS).map((s) => ({ weightKg: s.weightKg != null ? Number(s.weightKg) : null, reps: s.reps }));
  }
  return Array.from({ length: ADHOC_DEFAULT.sets }, () => ({ weightKg: null, reps: ADHOC_DEFAULT.reps }));
}

/** A fresh client-side slot id. */
export const newAdhocSlot = (): string => `${ADHOC_PREFIX}${crypto.randomUUID()}`;

/**
 * The added exercise's rows, ready for the sheet's extra fields (rx, load…) to
 * be put on by the page. Sets are numbered from 1; cells hold the prefill.
 */
export function adhocRows(o: { slot: string; exerciseId: string; sets: readonly AdhocSet[] }): (SheetRow & { toProgram: boolean })[] {
  return o.sets.map((s, i) => ({
    key: `${o.slot}-${i + 1}`,
    exerciseId: o.exerciseId,
    slotExerciseId: o.exerciseId,
    programExerciseId: o.slot,
    setNumber: i + 1,
    type: "working",
    prescribedReps: null,
    weight: s.weightKg ?? "",
    reps: s.reps,
    rpe: "",
    toProgram: false,
  }));
}

// ---------------------------------------------------------------------------
// "Also add to program": the logged sets become the exercise's targets in the
// session's later weeks.
// ---------------------------------------------------------------------------

/** A logged set of an added exercise, as the save sent it. */
export interface LoggedAdhocSet {
  type: "working" | "backoff";
  weightKg?: number;
  reps: number;
  rpe?: number;
}

/** The program exercise those sets become: role Aux, targets from what was logged; null when no set has reps. */
export function adhocProgramExercise(o: { exerciseId: string; exerciseName: string; sets: readonly LoggedAdhocSet[] }): ProgramExercise | null {
  const prescribedSets: PrescribedSet[] = o.sets
    .filter((s) => s.reps >= 1)
    .map((s, i) => ({
      setNumber: i + 1,
      type: s.type,
      reps: Math.min(100, s.reps),
      amrap: false,
      ...(s.weightKg != null && s.weightKg > 0 ? { targetWeightKg: s.weightKg } : {}),
      ...(s.rpe != null && s.rpe >= 1 && s.rpe <= 10 ? { targetRpe: s.rpe } : {}),
    }));
  if (prescribedSets.length === 0) return null;
  return {
    id: crypto.randomUUID(),
    exerciseId: o.exerciseId,
    exerciseName: o.exerciseName,
    role: "accessory",
    order: 0,
    prescribedSets,
  };
}

/** The same session in a week (kind + seq), if the week has it. */
const sessionIn = (w: ProgramWeek, key: string): ProgramSession | undefined => w.sessions.find((s) => sessionKey(s) === key);

export interface AdhocAddResult extends ForwardResult {
  /** Weeks that got the exercise. */
  changed: number[];
  /** Weeks left alone because the session already holds the exercise. */
  already: number[];
}

/**
 * Add the exercise to `session` in every remaining week after the logged one:
 * placed last in the session, same A/B rotation only, never a finished week
 * (`nowWeek` = the client's current week). A week whose session already has the
 * exercise is left alone. Pure — the caller saves `weeks` when `changed` is non-empty.
 */
export function addAdhocToProgram(
  weeks: ProgramWeek[],
  o: {
    /** The week that was logged. */
    from: number;
    session: Pick<ProgramSession, "kind" | "seq" | "name">;
    exercise: ProgramExercise;
    nowWeek: number | null;
    phasing?: Pick<Phasing, "weeks"> | null;
  }
): AdhocAddResult {
  const key = sessionKey(o.session);
  const candidates = forwardWeeks(weeks, o.from, o.nowWeek);
  const already = candidates.filter((n) => {
    const s = sessionIn(weeks.find((w) => w.week === n)!, key);
    return !!s?.exercises.some((e) => e.exerciseId === o.exercise.exerciseId);
  });
  const targets = candidates.filter((n) => !already.includes(n));
  const edit: WeekEdit = { kind: "addExercise", key, sessionName: o.session.name, exercise: o.exercise };
  const r = applyForward(weeks, o.from, [edit], {
    targets,
    // an add never removes or swaps, so there is nothing a log could protect
    sessionHasLogs: () => false,
    exerciseHasLogs: () => false,
    phasing: o.phasing ?? null,
  });
  return { ...r, already };
}

/** "weeks 3–6", "week 4", "weeks 3, 5" — the weeks an add reached. */
export function weeksText(weeks: readonly number[]): string {
  const w = [...weeks].sort((a, b) => a - b);
  if (w.length === 1) return `week ${w[0]}`;
  const run = w.every((n, i) => i === 0 || n === w[i - 1] + 1);
  return run ? `weeks ${w[0]}–${w[w.length - 1]}` : `weeks ${w.join(", ")}`;
}

/**
 * The client's week for "later weeks": the current one; before the start W1;
 * past the end nothing is later; a draft has none (null). The program page reads it the same way.
 */
export function clientNowWeek(dates: readonly Pick<WeekTabDate, "week" | "state">[] | null): number | null {
  if (!dates) return null;
  const now = dates.find((d) => d.state === "now");
  if (now) return now.week;
  return dates.every((d) => d.state === "past") ? dates.length + 1 : 1;
}
