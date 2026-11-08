/**
 * History import (paste notes v2, docs/history-import-plan.md): the logged
 * numbers of a pasted program saved as archived programs plus real logs.
 * Pure — the API builds the plan from the stored import, the web previews it.
 */

import { ProgramWeeksDocument, type ProgramExercise, type ProgramSession, type ProgramWeek } from "./domain";
import { IMPORT_LIMITS, blockLabel, normalizeExerciseName, type ImportResult } from "./import";

// ---------------------------------------------------------------------------
// Dates (ISO YYYY-MM-DD, calendar math in UTC so no timezone shifts a day)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: string): boolean => ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday of a date: 1 = Mon … 7 = Sun. */
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

// ---------------------------------------------------------------------------
// Weekday names in day labels ("Mon - Upper A", "วันจันทร์")
// ---------------------------------------------------------------------------

const ENGLISH_DAYS: [RegExp, number][] = [
  [/\b(mon|monday)\b/i, 1],
  [/\b(tue|tues|tuesday)\b/i, 2],
  [/\b(wed|weds|wednesday)\b/i, 3],
  [/\b(thu|thur|thurs|thursday)\b/i, 4],
  [/\b(fri|friday)\b/i, 5],
  [/\b(sat|saturday)\b/i, 6],
  [/\b(sun|sunday)\b/i, 7],
];

/** Thai has no spaces between words — the names are distinct enough to find as is.
 *  "อาทิตย์ที่ 2" / "อาทิตย์หน้า" mean a week, not Sunday. */
const THAI_DAYS: [RegExp, number][] = [
  [/จันทร์/, 1],
  [/อังคาร/, 2],
  [/พุธ/, 3],
  [/พฤหัส(?:บดี)?/, 4],
  [/ศุกร์/, 5],
  [/เสาร์/, 6],
  [/อาทิตย์(?!\s*(?:ที่|หน้า|นี้|ก่อน))/, 7],
];

/** The weekday a day label names (1 = Mon … 7 = Sun), the first one written; null when none. */
export function weekdayFromLabel(label: string): number | null {
  let best: { at: number; day: number } | null = null;
  for (const [re, day] of [...ENGLISH_DAYS, ...THAI_DAYS]) {
    const m = re.exec(label);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, day };
  }
  return best?.day ?? null;
}

// ---------------------------------------------------------------------------
// Week and day dates
// ---------------------------------------------------------------------------

/** Start dates of `weekCount` consecutive weeks ending with the one starting `latestStart`. */
export function defaultWeekStarts(weekCount: number, latestStart: string): string[] {
  return Array.from({ length: weekCount }, (_, i) => addDays(latestStart, -7 * (weekCount - 1 - i)));
}

/**
 * One date per day of a week starting `weekStart`:
 * - a weekday in the label wins — the first such date on or after the start;
 * - else the Nth unlabeled day goes on the client's Nth training day, counted
 *   from the start's weekday;
 * - with more unlabeled days than training days, or none set: start + index.
 * Never past start + 6.
 */
export function dayDates(
  weekStart: string,
  days: readonly { label: string }[],
  trainingDays: readonly number[] | null | undefined,
): string[] {
  const startDay = isoWeekday(weekStart);
  const offsetOf = (weekday: number) => (weekday - startDay + 7) % 7;
  const named = days.map((d) => weekdayFromLabel(d.label));
  const unlabeled = named.filter((w) => w === null).length;
  const slots = [...new Set(trainingDays ?? [])].map(offsetOf).sort((a, b) => a - b);
  const useSlots = slots.length > 0 && unlabeled <= slots.length;
  let n = 0;
  return days.map((_, i) => {
    const wd = named[i];
    const offset = wd !== null ? offsetOf(wd) : useSlots ? slots[n++] : i;
    return addDays(weekStart, Math.min(6, offset));
  });
}

// ---------------------------------------------------------------------------
// Import result → archived programs + logs
// ---------------------------------------------------------------------------

/** A logged set as saved: set_logs minus the ids the API stamps. */
export interface HistorySet {
  programExerciseId: string;
  exerciseId: string;
  setNumber: number;
  /** Reps, or seconds for a timed slot (as metrics.ts reads them). */
  reps: number;
  weightKg?: number;
}

export interface HistoryLog {
  /** 1-based week of its program. */
  week: number;
  date: string;
  programSessionId: string;
  /** "Day 1 Back/Biceps" — for the preview. */
  dayLabel: string;
  exercises: number;
  notes: string;
  sets: HistorySet[];
}

export interface HistoryProgram {
  /** Index into result.blocks. */
  block: number;
  name: string;
  /** First week's start (YYYY-MM-DD) — the block anchor. */
  activatedAt: string;
  weeks: ProgramWeek[];
  logs: HistoryLog[];
}

export type HistorySkipReason = "flagged" | "no_exercise" | "too_many_sets" | "future" | "too_long" | "invalid_program";

export interface HistorySkip {
  week: string;
  day?: string;
  exercise?: string;
  reason: HistorySkipReason;
  message: string;
}

export interface HistoryPlan {
  programs: HistoryProgram[];
  skipped: HistorySkip[];
}

export const HISTORY_SKIP_MESSAGES: Record<HistorySkipReason, string> = {
  flagged: "numbers not found in the text",
  no_exercise: "no exercise picked",
  too_many_sets: `more than ${IMPORT_LIMITS.setsPerExercise} sets`,
  future: "date after today",
  too_long: "a set longer than a log can hold",
  invalid_program: "doesn't fit a program",
};

/** The key `exerciseIds` uses: the name as written, normalized. */
export const historyExerciseKey = (sourceName: string): string => normalizeExerciseName(sourceName);

/** Any logged numbers in the result — the Save history panel shows only then. */
export const hasActuals = (r: ImportResult): boolean =>
  r.weeks.some((w) => w.days.some((d) => d.sessions.some((s) => s.exercises.some((e) => (e.actuals?.length ?? 0) > 0))));

const MAX_LOGGED_REPS = 200;
const fmtNum = (n: number) => String(Number(n.toFixed(2)));

/**
 * One archived program per block with at least one logged session: its weeks
 * become weeks 1…k (fresh ids per week, sessions placed on their day's
 * weekday), and every lifting session with usable numbers becomes a log dated
 * on its day. Anything left out is listed in `skipped`, with why.
 */
export function buildHistory(
  r: ImportResult,
  opts: {
    /** One start date per week of the result (index = week index). */
    weekStarts: readonly string[];
    trainingDays?: readonly number[] | null;
    /** historyExerciseKey(sourceName) → catalog exercise id. */
    exerciseIds: Readonly<Record<string, string>>;
    /** Catalog id → display name, captured on the program exercises. */
    exerciseNames?: Readonly<Record<string, string>>;
    /** Days after it are not logged (YYYY-MM-DD). */
    today: string;
  },
): HistoryPlan {
  const skipped: HistorySkip[] = [];
  const programs: HistoryProgram[] = [];

  r.blocks.forEach((block, bi) => {
    const blockSkips: HistorySkip[] = [];
    const skip = (s: Omit<HistorySkip, "message">) => blockSkips.push({ ...s, message: HISTORY_SKIP_MESSAGES[s.reason] });
    const weeks: ProgramWeek[] = [];
    const logs: HistoryLog[] = [];

    block.weeks.forEach((wi, k) => {
      const week = r.weeks[wi];
      const start = opts.weekStarts[wi];
      if (!week || !start) return;
      const weekLabel = week.label ?? `Week ${k + 1}`;
      const dates = dayDates(start, week.days, opts.trainingDays);
      const sessions: ProgramSession[] = [];
      const seq = { lifting: 0, cardio: 0 };
      const perWeekday = new Map<number, number>();

      week.days.forEach((day, di) => {
        const date = dates[di];
        const weekday = isoWeekday(date);
        for (const s of day.sessions) {
          const place = () => {
            const order = perWeekday.get(weekday) ?? 0;
            perWeekday.set(weekday, order + 1);
            return { id: crypto.randomUUID(), name: (s.name.trim() || day.label).slice(0, 160), weekday, order };
          };
          if (s.kind === "cardio") {
            sessions.push({ ...place(), seq: ++seq.cardio, kind: "cardio", exercises: [], cardio: s.cardio ?? { modality: s.name.slice(0, 80) || "Cardio" } });
            continue;
          }
          const picked = s.exercises.flatMap((ex) => {
            const exerciseId = opts.exerciseIds[historyExerciseKey(ex.sourceName)];
            if (!exerciseId) {
              if (ex.actuals?.length) skip({ week: weekLabel, day: day.label, exercise: ex.sourceName, reason: "no_exercise" });
              return [];
            }
            return [{ ex, exerciseId }];
          });
          if (picked.length === 0) continue;
          const exercises: ProgramExercise[] = picked.map(({ ex, exerciseId }, order) => {
            return {
              id: crypto.randomUUID(),
              exerciseId,
              exerciseName: (opts.exerciseNames?.[exerciseId] ?? ex.name).slice(0, 200),
              order,
              prescribedSets: structuredClone(ex.sets),
              ...(ex.note ? { notes: ex.note } : {}),
            };
          });
          const session: ProgramSession = { ...place(), seq: ++seq.lifting, kind: "lifting", exercises };
          sessions.push(session);

          // —— the log ——
          const sets: HistorySet[] = [];
          const notes: string[] = [];
          let logged = 0;
          picked.forEach(({ ex, exerciseId }, i) => {
            const actuals = ex.actuals ?? [];
            if (actuals.length === 0) return;
            const base = { week: weekLabel, day: day.label, exercise: ex.sourceName };
            if (ex.flags.some((f) => f.field === "actual" && f.level === "warn")) return skip({ ...base, reason: "flagged" });
            if (actuals.length > IMPORT_LIMITS.setsPerExercise) return skip({ ...base, reason: "too_many_sets" });
            const timed = ex.sets.some((ps) => ps.durationSeconds != null);
            const before = sets.length;
            let tooLong = false;
            actuals.forEach((a, j) => {
              const value = timed ? (a.seconds ?? ex.sets[j]?.durationSeconds) : (a.reps ?? (ex.sets[j]?.reps || undefined));
              if (value == null || !(value >= 0)) return;
              const reps = Math.round(value);
              if (reps > MAX_LOGGED_REPS) {
                tooLong = true;
                return;
              }
              sets.push({
                programExerciseId: exercises[i].id,
                exerciseId,
                setNumber: j + 1,
                reps,
                ...(a.kg != null ? { weightKg: a.kg } : {}),
              });
            });
            if (tooLong) skip({ ...base, reason: "too_long" });
            if (sets.length > before) logged++;
            if (timed) {
              const counted = actuals.flatMap((a) => (a.reps != null ? [fmtNum(a.reps)] : []));
              if (counted.length) notes.push(`${ex.sourceName.trim()}: ${counted.join(", ")} reps`);
            }
          });
          if (sets.length === 0) continue;
          if (date > opts.today) {
            skip({ week: weekLabel, day: day.label, reason: "future" });
            continue;
          }
          logs.push({
            week: k + 1,
            date,
            programSessionId: session.id,
            dayLabel: day.label,
            exercises: logged,
            notes: [`From notes: ${weekLabel} · ${day.label}`, ...notes].join("\n").slice(0, 2000),
            sets,
          });
        }
      });
      weeks.push({ week: k + 1, sessions });
    });

    skipped.push(...blockSkips);
    if (logs.length === 0) return;
    const name = blockLabel(r, bi).slice(0, 160);
    if (!ProgramWeeksDocument.safeParse(weeks).success) {
      skipped.push({
        week: name,
        reason: "invalid_program",
        message: `${HISTORY_SKIP_MESSAGES.invalid_program} (more than 26 weeks, or too many sessions in a week or day)`,
      });
      return;
    }
    programs.push({ block: bi, name, activatedAt: opts.weekStarts[block.weeks[0]], weeks, logs });
  });

  return { programs, skipped };
}

export interface HistorySummary {
  programs: number;
  sessions: number;
  sets: number;
  /** First and last logged date; null with nothing to save. */
  from: string | null;
  to: string | null;
}

export function historySummary(plan: HistoryPlan): HistorySummary {
  const logs = plan.programs.flatMap((p) => p.logs);
  const dates = logs.map((l) => l.date).sort();
  return {
    programs: plan.programs.length,
    sessions: logs.length,
    sets: logs.reduce((n, l) => n + l.sets.length, 0),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}
