import { estimate1rm } from "./domain";
import type { Phasing, WeekDirective } from "./domain";

/**
 * Block pulse: weekly volume & intensity computed from logged working sets.
 * Pure functions over (program, logs) — same pattern as the signal engine.
 * Web DTOs and API rows both fit the minimal input shapes structurally.
 */

export interface SignalProgram {
  id: string;
  clientId: string | null;
  name: string;
  status: string;
  /** Only the count matters (adherence expectations). */
  sessions: unknown[];
  activatedAt?: string | null;
  createdAt: string;
  phasing?: Phasing | null;
}

export interface SignalLogSet {
  exerciseId: string;
  type: "warm_up" | "working" | "backoff";
  weightKg?: number | null;
  reps: number;
  rpe?: number | null;
}

export interface SignalLog {
  programId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  sets: SignalLogSet[];
}

export interface WeekMetrics {
  week: number;
  /** Directive from the program's periodization scheme, when present. */
  directive: WeekDirective | null;
  /** Σ kg × reps of working sets with a load. Bodyweight work counts in sets/reps only. */
  tonnage: number;
  sets: number;
  reps: number;
  avgRpe: number | null;
  bestE1rm: number;
  /** % change vs previous logged week. */
  tonnageDelta: number | null;
  e1rmDelta: number | null;
  /** True when the week has no logs yet (future or missed). */
  plannedOnly: boolean;
}

/** 1-indexed block week derived from first activation (or first log / creation). */
export function weekOf(program: SignalProgram, logs: SignalLog[], now = Date.now()): number {
  const programLogs = logs.filter((l) => l.programId === program.id);
  const start =
    program.activatedAt ??
    programLogs.map((l) => l.date).sort()[0] ??
    program.createdAt;
  const days = (now - new Date(start).getTime()) / 86400_000;
  return Math.max(1, Math.floor(days / 7) + 1);
}

function dateKey(iso: string): number {
  return new Date(iso).getTime();
}

export function blockPulse(
  program: SignalProgram,
  logs: SignalLog[],
  now = Date.now()
): WeekMetrics[] {
  const ph = program.phasing;
  if (!ph) return [];
  const start = program.activatedAt ? dateKey(program.activatedAt) : null;
  const weeks = new Map<number, { tonnage: number; sets: number; reps: number; rpeSum: number; rpeN: number; best: number }>();

  for (const log of logs) {
    if (log.programId !== program.id) continue;
    if (start != null && dateKey(log.date) < start) continue;
    const days = (dateKey(log.date) - (start ?? dateKey(log.date) - 7 * 86400_000)) / 86400_000;
    const week = Math.max(1, Math.floor(days / 7) + 1);
    const entry = weeks.get(week) ?? { tonnage: 0, sets: 0, reps: 0, rpeSum: 0, rpeN: 0, best: 0 };
    for (const s of log.sets) {
      if (s.type !== "working") continue;
      entry.sets += 1;
      entry.reps += s.reps;
      if (s.weightKg) entry.tonnage += s.weightKg * s.reps;
      if (s.rpe) {
        entry.rpeSum += s.rpe;
        entry.rpeN += 1;
      }
      if (s.weightKg && s.reps) entry.best = Math.max(entry.best, estimate1rm(s.weightKg, s.reps));
    }
    weeks.set(week, entry);
  }

  const totalWeeks = Math.max(ph.plannedWeeks, weekOf(program, logs, now));
  const out: WeekMetrics[] = [];
  let prev: WeekMetrics | null = null;
  for (let w = 1; w <= totalWeeks; w++) {
    const e = weeks.get(w);
    const directive = ph.weeks?.find((x) => x.week === w)?.directive ?? null;
    const metric: WeekMetrics = {
      week: w,
      directive,
      tonnage: e?.tonnage ?? 0,
      sets: e?.sets ?? 0,
      reps: e?.reps ?? 0,
      avgRpe: e && e.rpeN > 0 ? Math.round((e.rpeSum / e.rpeN) * 10) / 10 : null,
      bestE1rm: e?.best ?? 0,
      tonnageDelta: null,
      e1rmDelta: null,
      plannedOnly: !e,
    };
    if (prev && !metric.plannedOnly && !prev.plannedOnly) {
      if (prev.tonnage > 0) metric.tonnageDelta = Math.round(((metric.tonnage - prev.tonnage) / prev.tonnage) * 100);
      if (prev.bestE1rm > 0) metric.e1rmDelta = Math.round(((metric.bestE1rm - prev.bestE1rm) / prev.bestE1rm) * 100);
    }
    out.push(metric);
    prev = metric;
  }
  return out;
}

/** One-line summary for AI context and signal evidence: "weekly tonnage 1.8t → 2.3t (+28%) · best e1RM 77 → 84". */
export function pulseSummary(pulse: WeekMetrics[]): string | null {
  const logged = pulse.filter((w) => !w.plannedOnly && (w.tonnage > 0 || w.bestE1rm > 0));
  if (logged.length < 2) return null;
  const first = logged[0];
  const last = logged[logged.length - 1];
  const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`);
  const parts: string[] = [];
  if (first.tonnage > 0 && last.tonnage > 0) {
    const delta = Math.round(((last.tonnage - first.tonnage) / first.tonnage) * 100);
    parts.push(`weekly tonnage ${t(first.tonnage)} → ${t(last.tonnage)} (${delta >= 0 ? "+" : ""}${delta}%)`);
  }
  if (first.bestE1rm > 0 && last.bestE1rm > 0) {
    parts.push(`best e1RM ${Math.round(first.bestE1rm)} → ${Math.round(last.bestE1rm)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
