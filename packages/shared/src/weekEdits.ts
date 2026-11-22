import { blockOf, mainWork, MAX_MAIN_EXERCISES, MAX_PREP_EXERCISES, movementPrep, moveToBlock, orderByBlock, SESSION_BLOCK_NAMES, type SessionBlock } from "./blocks";
import { normalizeGroups } from "./groups";
import {
  MAX_SESSIONS_PER_WEEKDAY,
  sessionKey,
  type Phasing,
  type ProgramExercise,
  type ProgramSession,
  type ProgramWeek,
} from "./domain";
import { progressExercise } from "./progression";

// ---------------------------------------------------------------------------
// Forward edits (FB-017): a structural edit made on one week also goes to the
// later weeks the client hasn't finished. Pure.
//
// Across weeks a session is identified by its key (kind + seq), an exercise by
// its catalog exerciseId plus its occurrence among same-id exercises in the
// session (the second "Bench" is occurrence 1). Only structure travels (a
// session block counts as structure): sets, reps, loads, rest, notes, order,
// grouping and cardio values stay per week.
// ---------------------------------------------------------------------------

/** Where an exercise sits across weeks: session key, catalog id, occurrence. */
export interface ExerciseRef {
  key: string;
  exerciseId: string;
  occurrence: number;
}

export type WeekEdit =
  | { kind: "addSession"; key: string; session: ProgramSession }
  | { kind: "removeSession"; key: string; name: string }
  | { kind: "renameSession"; key: string; name: string; from: string }
  | { kind: "addExercise"; key: string; sessionName: string; exercise: ProgramExercise }
  | { kind: "removeExercise"; ref: ExerciseRef; name: string }
  | { kind: "swapExercise"; ref: ExerciseRef; from: string; exerciseId: string; exerciseName: string }
  /** Moved to the other session block ("Band pull-apart → prep"). */
  | { kind: "blockExercise"; ref: ExerciseRef; name: string; to: SessionBlock };

/** "Band pull-apart → movement prep" — a block change as one line. */
export const blockEditText = (name: string, to: SessionBlock): string => `${name} → ${SESSION_BLOCK_NAMES[to].toLowerCase()}`;

/** Room for one more exercise in `block` of session `s`. */
const hasRoom = (s: ProgramSession, block: SessionBlock) =>
  block === "prep" ? movementPrep(s.exercises).length < MAX_PREP_EXERCISES : mainWork(s.exercises).length < MAX_MAIN_EXERCISES;

const byOrder = (a: ProgramExercise, b: ProgramExercise) => a.order - b.order;

/** Occurrence of exercise `e` among same-catalog-id exercises in `s` (in order). */
function occurrenceOf(s: ProgramSession, e: ProgramExercise): number {
  const same = [...s.exercises].sort(byOrder).filter((x) => x.exerciseId === e.exerciseId);
  return Math.max(0, same.findIndex((x) => x.id === e.id));
}

/** The exercise in `s` at `ref` (catalog id + occurrence), if any. */
function exerciseAt(s: ProgramSession, ref: Pick<ExerciseRef, "exerciseId" | "occurrence">): ProgramExercise | undefined {
  return [...s.exercises].sort(byOrder).filter((x) => x.exerciseId === ref.exerciseId)[ref.occurrence];
}

const nameOf = (e: Pick<ProgramExercise, "exerciseName" | "exerciseId">) => e.exerciseName ?? e.exerciseId;

/**
 * The structural edits between one week before and after an edit. Sessions are
 * matched by id within the week (a session whose key changed counts as removed
 * and added); exercises by their program-exercise id: a kept id with a new
 * catalog exercise is a swap, one in the other block a block move (listed
 * first, so it still finds the exercise by its old catalog id).
 */
export function weekStructureDiff(before: ProgramWeek, after: ProgramWeek): WeekEdit[] {
  const edits: WeekEdit[] = [];
  const afterById = new Map(after.sessions.map((s) => [s.id, s]));
  const beforeById = new Map(before.sessions.map((s) => [s.id, s]));
  for (const b of before.sessions) {
    const a = afterById.get(b.id);
    if (!a || sessionKey(a) !== sessionKey(b)) {
      edits.push({ kind: "removeSession", key: sessionKey(b), name: b.name });
      continue;
    }
    const key = sessionKey(b);
    if (a.name !== b.name) edits.push({ kind: "renameSession", key, name: a.name, from: b.name });
    if (a.kind !== "exercises") continue;
    const aEx = new Map(a.exercises.map((e) => [e.id, e]));
    const bEx = new Set(b.exercises.map((e) => e.id));
    for (const e of [...b.exercises].sort(byOrder)) {
      const now = aEx.get(e.id);
      const ref = { key, exerciseId: e.exerciseId, occurrence: occurrenceOf(b, e) };
      if (now && blockOf(now) !== blockOf(e)) edits.push({ kind: "blockExercise", ref, name: nameOf(now), to: blockOf(now) });
      if (!now) edits.push({ kind: "removeExercise", ref, name: nameOf(e) });
      else if (now.exerciseId !== e.exerciseId) {
        edits.push({ kind: "swapExercise", ref, from: nameOf(e), exerciseId: now.exerciseId, exerciseName: nameOf(now) });
      }
    }
    for (const e of [...a.exercises].sort(byOrder)) {
      if (!bEx.has(e.id)) edits.push({ kind: "addExercise", key, sessionName: a.name, exercise: e });
    }
  }
  for (const a of after.sessions) {
    const b = beforeById.get(a.id);
    if (!b || sessionKey(a) !== sessionKey(b)) edits.push({ kind: "addSession", key: sessionKey(a), session: a });
  }
  return edits;
}

/**
 * Later weeks an edit on week `from` goes to: in an A/B block only weeks with
 * the same letter; never a week the client has finished (only weeks ≥
 * `nowWeek`). A draft has no current week (null): every later week.
 */
export function forwardWeeks(
  weeks: readonly Pick<ProgramWeek, "week" | "rotation">[],
  from: number,
  nowWeek: number | null
): number[] {
  const letter = weeks.find((w) => w.week === from)?.rotation;
  return weeks
    .filter((w) => w.week > from && (!letter || w.rotation === letter) && (nowWeek == null || w.week >= nowWeek))
    .map((w) => w.week)
    .sort((a, b) => a - b);
}

/** logged: has logs · exists: the week already has that session · missing: no such
 *  session/exercise there · full: at the session/exercise limit · empty: removing would empty the session. */
export type ForwardSkipReason = "logged" | "exists" | "missing" | "full" | "empty";

export interface ForwardOptions {
  /** Weeks to update (from `forwardWeeks`). */
  targets: readonly number[];
  /** True when the session in that week has logs: it is never removed. */
  sessionHasLogs: (week: number, sessionId: string) => boolean;
  /** True when the exercise in that week has logged sets: it is never removed or swapped. */
  exerciseHasLogs: (week: number, sessionId: string, exercise: ProgramExercise) => boolean;
  /** The block's rules: an added exercise's sets progress week by week like `progressBlock`. */
  phasing?: Pick<Phasing, "weeks"> | null;
}

export interface ForwardResult {
  weeks: ProgramWeek[];
  /** Weeks some edit changed. */
  changed: number[];
  /** Target weeks an edit left alone, and why. */
  skipped: { week: number; reason: ForwardSkipReason; edit: WeekEdit }[];
}

/** Rewrite within-day order to 0..n-1 for every weekday, keeping the relative order. */
function compact(sessions: ProgramSession[]): ProgramSession[] {
  const next = new Map<number, number>();
  const orderOf = new Map<string, number>();
  for (const s of [...sessions].sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.order - b.order)) {
    const d = s.weekday ?? 0;
    orderOf.set(s.id, next.get(d) ?? 0);
    next.set(d, (next.get(d) ?? 0) + 1);
  }
  return sessions.map((s) => ({ ...s, order: orderOf.get(s.id)! }));
}

const freshExercise = (e: ProgramExercise): ProgramExercise => {
  const { group: _g, ...rest } = e;
  return { ...rest, id: crypto.randomUUID(), prescribedSets: e.prescribedSets.map((s) => ({ ...s })) };
};

/**
 * An exercise's sets in each target week, chained from week `from` with the
 * block's rules, the same way `progressBlock` derives a week: each week applies
 * its own rule to the last non-deload week before it on the chain; a deload week
 * without a rule repeats that week's sets.
 */
function chainSets(e: ProgramExercise, targets: readonly number[], phasing: ForwardOptions["phasing"]): Map<number, ProgramExercise> {
  const out = new Map<number, ProgramExercise>();
  let base = e;
  for (const n of targets) {
    const plan = phasing?.weeks?.find((p) => p.week === n);
    const deload = plan?.directive === "deload";
    const next = progressExercise(base, plan?.progression);
    out.set(n, next);
    if (!deload) base = next;
  }
  return out;
}

/**
 * Apply `edits` (made on week `from`) to each target week. Adds get fresh ids;
 * an added session whose key the target already has is skipped. Removes and
 * swaps skip a target where that session or exercise has logs. Added exercises
 * (also those inside an added session) follow the block's progression.
 */
export function applyForward(weeks: ProgramWeek[], from: number, edits: readonly WeekEdit[], opts: ForwardOptions): ForwardResult {
  const targets = [...new Set(opts.targets)].filter((t) => t !== from).sort((a, b) => a - b);
  const skipped: ForwardResult["skipped"] = [];
  const changed = new Set<number>();
  if (targets.length === 0 || edits.length === 0) return { weeks, changed: [], skipped };
  let out = weeks.map((w) => ({ ...w, sessions: w.sessions.map((s) => ({ ...s, exercises: [...s.exercises] })) }));
  const week = (n: number) => out.find((w) => w.week === n);
  const skip = (n: number, reason: ForwardSkipReason, edit: WeekEdit) => skipped.push({ week: n, reason, edit });

  for (const edit of edits) {
    if (edit.kind === "addSession") {
      const chains = edit.session.exercises.map((e) => chainSets(e, targets, opts.phasing));
      for (const n of targets) {
        const w = week(n)!;
        if (w.sessions.some((s) => sessionKey(s) === edit.key)) {
          skip(n, "exists", edit);
          continue;
        }
        if (w.sessions.length >= 14) {
          skip(n, "full", edit);
          continue;
        }
        const day = edit.session.weekday ?? null;
        const onDay = w.sessions.filter((s) => (s.weekday ?? null) === day).length;
        const weekday = day != null && onDay >= MAX_SESSIONS_PER_WEEKDAY ? null : day;
        const order = w.sessions.filter((s) => (s.weekday ?? null) === weekday).length;
        const s: ProgramSession = {
          ...edit.session,
          id: crypto.randomUUID(),
          weekday,
          order,
          cardio: edit.session.cardio ? structuredClone(edit.session.cardio) : edit.session.cardio,
          // A whole new session keeps its own supersets.
          exercises: edit.session.exercises.map((e, i) => ({ ...freshExercise(chains[i].get(n)!), ...(e.group ? { group: e.group } : {}) })),
        };
        w.sessions = [...w.sessions, s];
        changed.add(n);
      }
      continue;
    }
    if (edit.kind === "addExercise") {
      const chain = chainSets(edit.exercise, targets, opts.phasing);
      for (const n of targets) {
        const s = week(n)!.sessions.find((x) => sessionKey(x) === edit.key);
        if (!s) {
          skip(n, "missing", edit);
          continue;
        }
        if (!hasRoom(s, blockOf(edit.exercise))) {
          skip(n, "full", edit);
          continue;
        }
        // Lands at the end of its block: prep stays before main.
        s.exercises = orderByBlock([...s.exercises.sort(byOrder), { ...freshExercise(chain.get(n)!), order: s.exercises.length }]);
        changed.add(n);
      }
      continue;
    }
    for (const n of targets) {
      const w = week(n)!;
      const key = edit.kind === "removeExercise" || edit.kind === "swapExercise" || edit.kind === "blockExercise" ? edit.ref.key : edit.key;
      const s = w.sessions.find((x) => sessionKey(x) === key);
      if (!s) {
        skip(n, "missing", edit);
        continue;
      }
      if (edit.kind === "renameSession") {
        if (s.name === edit.name) continue;
        s.name = edit.name;
      } else if (edit.kind === "removeSession") {
        if (opts.sessionHasLogs(n, s.id)) {
          skip(n, "logged", edit);
          continue;
        }
        w.sessions = compact(w.sessions.filter((x) => x.id !== s.id));
      } else {
        const e = exerciseAt(s, edit.ref);
        if (!e) {
          skip(n, "missing", edit);
          continue;
        }
        if (opts.exerciseHasLogs(n, s.id, e)) {
          skip(n, "logged", edit);
          continue;
        }
        if (edit.kind === "blockExercise") {
          if (blockOf(e) === edit.to) continue;
          if (!hasRoom(s, edit.to)) {
            skip(n, "full", edit);
            continue;
          }
          // Prep may not take the session's last main exercise.
          if (edit.to === "prep" && mainWork(s.exercises).length <= 1) {
            skip(n, "empty", edit);
            continue;
          }
          const sorted = [...s.exercises].sort(byOrder);
          s.exercises = normalizeGroups(moveToBlock(sorted, sorted.indexOf(e), edit.to));
        } else if (edit.kind === "removeExercise") {
          if (s.exercises.length <= 1 || (blockOf(e) === "main" && mainWork(s.exercises).length <= 1 && movementPrep(s.exercises).some((x) => x.block === "prep"))) {
            skip(n, "empty", edit);
            continue;
          }
          s.exercises = s.exercises.filter((x) => x.id !== e.id).sort(byOrder).map((x, i) => ({ ...x, order: i }));
        } else {
          s.exercises = s.exercises.map((x) => (x.id === e.id ? { ...x, exerciseId: edit.exerciseId, exerciseName: edit.exerciseName } : x));
        }
      }
      changed.add(n);
    }
  }
  out = out.map((w) => (changed.has(w.week) ? w : weeks.find((x) => x.week === w.week)!));
  return { weeks: out, changed: [...changed].sort((a, b) => a - b), skipped };
}
