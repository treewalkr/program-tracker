import { estimate1rm, mainLiftIds, sessionTag, timedExerciseIds, timedSlotIds } from "@pt/shared";
import type { ProgramDto, SessionLogDto } from "./api/types";
import { cardioLogLabel, logDateLabel, loggedSetLabel } from "./programLogs";

/**
 * The client page's History tab, computed from session logs and the client's
 * programs: per-lift progress (best e1RM, trend, recent sets) and the logged
 * sessions grouped by week.
 */

export type HistoryRange = "8w" | "6m" | "all";

export const HISTORY_RANGES: { id: HistoryRange; label: string; badge: string; phrase: string }[] = [
  { id: "8w", label: "8 weeks", badge: "8 wks", phrase: "the last 8 weeks" },
  { id: "6m", label: "6 months", badge: "6 mo", phrase: "the last 6 months" },
  { id: "all", label: "All", badge: "All", phrase: "any range" },
];

export const rangeInfo = (r: HistoryRange) => HISTORY_RANGES.find((x) => x.id === r)!;

/** Most logs the "All" range asks for; reaching it means older ones are cut off. */
export const ALL_LIMIT = 1000;

const DAY = 86_400_000;
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** First calendar day in the range (YYYY-MM-DD), counting today; null = all time. */
export function rangeStart(range: HistoryRange, today: string): string | null {
  if (range === "all") return null;
  const back = range === "8w" ? 55 : 182;
  return isoOf(new Date(utc(today).getTime() - back * DAY));
}

type LogSet = SessionLogDto["sets"][number];

/** A set's `reps` are seconds when its exercise or its slot is a timed hold — the API's buildHistory rule. */
export function timedSetTest(programs: readonly Pick<ProgramDto, "weeks">[]): (s: Pick<LogSet, "exerciseId" | "programExerciseId">) => boolean {
  const ex = new Set(programs.flatMap((p) => [...timedExerciseIds(p)]));
  const slots = new Set(programs.flatMap((p) => [...timedSlotIds(p)]));
  return (s) => ex.has(s.exerciseId) || (s.programExerciseId != null && slots.has(s.programExerciseId));
}

export interface LiftPoint {
  date: string;
  /** Best e1RM that day (kg), or the longest hold (s) for a timed lift. */
  value: number;
}

export interface LiftRow {
  exerciseId: string;
  name: string;
  /** null for timed holds and lifts never logged with a load. */
  bestE1rm: number | null;
  /** The newest sets (max 6), oldest first. */
  recentSets: { date: string; label: string }[];
  /** One point per session date, oldest first. */
  series: LiftPoint[];
  unit: "kg" | "s";
  lastDate: string;
  timed: boolean;
  /** A main lift (Power or Primary) in any of the client's programs. */
  main: boolean;
}

const RECENT = 6;

export function liftProgress(
  logs: readonly SessionLogDto[],
  programs: readonly Pick<ProgramDto, "weeks">[],
  nameOf: (exerciseId: string) => string,
): LiftRow[] {
  const isTimed = timedSetTest(programs);
  const main = new Set(programs.flatMap((p) => [...(mainLiftIds(p) ?? [])]));

  // Oldest first; within a day by set number so "recent" reads in the order lifted.
  const entries = logs
    .flatMap((l) => l.sets.map((s) => ({ date: l.date.slice(0, 10), s })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.s.setNumber - b.s.setNumber);

  const byEx = new Map<string, { date: string; s: LogSet; timed: boolean }[]>();
  for (const e of entries) {
    byEx.set(e.s.exerciseId, [...(byEx.get(e.s.exerciseId) ?? []), { ...e, timed: isTimed(e.s) }]);
  }

  const rows: LiftRow[] = [];
  for (const [exerciseId, sets] of byEx) {
    // A lift is timed when most of its sets are holds (a swap can mix both).
    const timed = sets.filter((x) => x.timed).length * 2 > sets.length;
    const score = (x: (typeof sets)[number]) => (timed ? x.s.reps : estimate1rm(x.s.weightKg ?? 0, x.s.reps));
    const days = new Map<string, number>();
    for (const x of sets) {
      if (x.timed !== timed) continue;
      const v = score(x);
      if (v > 0) days.set(x.date, Math.max(days.get(x.date) ?? 0, v));
    }
    const series = [...days].map(([date, value]) => ({ date, value }));
    const best = timed ? 0 : Math.max(0, ...series.map((p) => p.value));
    rows.push({
      exerciseId,
      name: nameOf(exerciseId),
      bestE1rm: best > 0 ? best : null,
      recentSets: sets.slice(-RECENT).map((x) => ({ date: x.date, label: loggedSetLabel(x.s, x.timed) })),
      series,
      unit: timed ? "s" : "kg",
      lastDate: sets[sets.length - 1].date,
      timed,
      main: main.has(exerciseId),
    });
  }
  return rows.sort(
    (a, b) => Number(b.main) - Number(a.main) || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name),
  );
}

export interface SessionRow {
  id: string;
  date: string;
  dateLabel: string;
  name: string;
  programId: string;
  programName: string;
  kind: SessionLogDto["kind"];
  setCount: number;
  /** Sets per exercise, in the order first logged. */
  exercises: { exerciseId: string; name: string; sets: string[] }[];
  /** "Run · 35 min · Z2 · 5.5 km" for a cardio log; null otherwise. */
  cardio: string | null;
  notes: string | null;
}

export interface WeekGroup {
  /** Monday, YYYY-MM-DD. */
  start: string;
  label: string;
  sessions: SessionRow[];
}

/** Monday of the ISO date's week (UTC calendar math, so no timezone shift). */
export function mondayOf(iso: string): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return isoOf(d);
}

/** "Week of 19 Oct" */
export function weekLabel(monday: string): string {
  return `Week of ${utc(monday).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

export function sessionsByWeek(
  logs: readonly SessionLogDto[],
  programs: readonly ProgramDto[],
  nameOf: (exerciseId: string) => string,
): WeekGroup[] {
  const isTimed = timedSetTest(programs);
  const programById = new Map(programs.map((p) => [p.id, p]));
  const sessionName = new Map<string, string>();
  for (const p of programs) {
    for (const w of p.weeks) for (const s of w.sessions) sessionName.set(`${p.id}:${s.id}`, s.name || sessionTag(s));
  }

  const ordered = logs
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.date.localeCompare(a.l.date) || a.i - b.i)
    .map(({ l }) => l);

  const weeks: WeekGroup[] = [];
  for (const l of ordered) {
    const date = l.date.slice(0, 10);
    const exercises: SessionRow["exercises"] = [];
    const sorted = [...l.sets].sort((a, b) => a.setNumber - b.setNumber);
    for (const s of sorted) {
      let ex = exercises.find((e) => e.exerciseId === s.exerciseId);
      if (!ex) exercises.push((ex = { exerciseId: s.exerciseId, name: nameOf(s.exerciseId), sets: [] }));
      ex.sets.push(loggedSetLabel(s, isTimed(s)));
    }
    const planned = l.programSessionId ? sessionName.get(`${l.programId}:${l.programSessionId}`) : undefined;
    const row: SessionRow = {
      id: l.id,
      date,
      dateLabel: logDateLabel(date),
      name: planned ?? (l.kind === "cardio" ? (l.cardio?.modality ?? "Cardio") : "Freestyle"),
      programId: l.programId,
      programName: programById.get(l.programId)?.name ?? "Program",
      kind: l.kind,
      setCount: l.sets.length,
      exercises,
      cardio: l.kind === "cardio" && l.cardio ? cardioLogLabel(l.cardio) : null,
      notes: l.notes || null,
    };
    const start = mondayOf(date);
    const last = weeks[weeks.length - 1];
    if (last?.start === start) last.sessions.push(row);
    else weeks.push({ start, label: weekLabel(start), sessions: [row] });
  }
  return weeks;
}
