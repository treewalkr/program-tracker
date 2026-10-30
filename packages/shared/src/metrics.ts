import { estimate1rm } from "./domain";
import type { Phasing, ProgramWeek, SetType, WeekDirective, WeekTarget } from "./domain";

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
  weeks: ProgramWeek[];
  activatedAt?: string | null;
  createdAt: string;
  phasing?: Phasing | null;
}

export interface SignalLogSet {
  exerciseId: string;
  type: SetType;
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
  /** Target from phasing.weeks[w].target ?? null */
  target: WeekTarget | null;
  /** Σ kg × reps of working sets with a load. Bodyweight work counts in sets/reps only. */
  overallVolume: number;
  sets: number;
  reps: number;
  avgRpe: number | null;
  bestE1rm: number;
  /** % change vs previous logged week. */
  overallVolumeDelta: number | null;
  /** % change of Σ reps */
  repsDelta: number | null;
  e1rmDelta: number | null;
  /** Actual % on the target's metric */
  targetDelta: number | null;
  /** Decision 8: met when actual satisfies target */
  targetMet: boolean | null;
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
  const weeks = new Map<number, { overallVolume: number; sets: number; reps: number; rpeSum: number; rpeN: number; best: number }>();

  for (const log of logs) {
    if (log.programId !== program.id) continue;
    if (start != null && dateKey(log.date) < start) continue;
    const days = (dateKey(log.date) - (start ?? dateKey(log.date) - 7 * 86400_000)) / 86400_000;
    const week = Math.max(1, Math.floor(days / 7) + 1);
    const entry = weeks.get(week) ?? { overallVolume: 0, sets: 0, reps: 0, rpeSum: 0, rpeN: 0, best: 0 };
    for (const s of log.sets) {
      if (s.type !== "working") continue;
      entry.sets += 1;
      entry.reps += s.reps;
      if (s.weightKg) entry.overallVolume += s.weightKg * s.reps;
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
    const weekPlan = ph.weeks?.find((x) => x.week === w);
    const directive = weekPlan?.directive ?? null;
    const target = weekPlan?.target ?? null;
    const metric: WeekMetrics = {
      week: w,
      directive,
      target,
      overallVolume: e?.overallVolume ?? 0,
      sets: e?.sets ?? 0,
      reps: e?.reps ?? 0,
      avgRpe: e && e.rpeN > 0 ? Math.round((e.rpeSum / e.rpeN) * 10) / 10 : null,
      bestE1rm: e?.best ?? 0,
      overallVolumeDelta: null,
      repsDelta: null,
      e1rmDelta: null,
      targetDelta: null,
      targetMet: null,
      plannedOnly: !e,
    };
    if (prev && !metric.plannedOnly && !prev.plannedOnly) {
      if (prev.overallVolume > 0) metric.overallVolumeDelta = Math.round(((metric.overallVolume - prev.overallVolume) / prev.overallVolume) * 100);
      if (prev.reps > 0) metric.repsDelta = Math.round(((metric.reps - prev.reps) / prev.reps) * 100);
      if (prev.bestE1rm > 0) metric.e1rmDelta = Math.round(((metric.bestE1rm - prev.bestE1rm) / prev.bestE1rm) * 100);

      if (target) {
        if (target.metric === "overall_volume") {
          metric.targetDelta = metric.overallVolumeDelta;
        } else if (target.metric === "rep_volume") {
          metric.targetDelta = metric.repsDelta;
        } else if (target.metric === "intensity") {
          metric.targetDelta = metric.e1rmDelta;
        }

        if (metric.targetDelta != null) {
          metric.targetMet = target.deltaPercent >= 0
            ? metric.targetDelta >= target.deltaPercent
            : metric.targetDelta <= target.deltaPercent;
        }
      }
    }
    out.push(metric);
    prev = metric;
  }
  return out;
}

/** One-line summary for AI context and signal evidence: "weekly overall volume 1.8t → 2.3t (+28%) · best e1RM 77 → 84". */
export function pulseSummary(pulse: WeekMetrics[]): string | null {
  const logged = pulse.filter((w) => !w.plannedOnly && (w.overallVolume > 0 || w.bestE1rm > 0));
  if (logged.length < 2) return null;
  const first = logged[0];
  const last = logged[logged.length - 1];
  const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`);
  const parts: string[] = [];
  if (first.overallVolume > 0 && last.overallVolume > 0) {
    const delta = Math.round(((last.overallVolume - first.overallVolume) / first.overallVolume) * 100);
    parts.push(`weekly overall volume ${t(first.overallVolume)} → ${t(last.overallVolume)} (${delta >= 0 ? "+" : ""}${delta}%)`);
  }
  if (first.bestE1rm > 0 && last.bestE1rm > 0) {
    parts.push(`best e1RM ${Math.round(first.bestE1rm)} → ${Math.round(last.bestE1rm)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface ChainDef {
  id: string;
  name: string;
  muscleGroups: string[];
}

export interface ChainCatalogEntry {
  id: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups?: string[] | null;
}

/** Chain ids (in `chains` order) whose muscleGroups intersect the exercise's primary ∪ secondary. */
export function chainsForExercise(exercise: ChainCatalogEntry, chains: ChainDef[]): string[] {
  const exGroups = new Set<string>([
    exercise.primaryMuscleGroup,
    ...(exercise.secondaryMuscleGroups ?? []),
  ]);
  const matched: string[] = [];
  for (const c of chains) {
    if (c.muscleGroups.some((g) => exGroups.has(g))) {
      matched.push(c.id);
    }
  }
  return matched;
}

/** Working sets per chain id for logs with date >= since (date-only ISO strings, client-local). */
export function chainSetCounts(
  chains: ChainDef[],
  logs: { date: string; sets: { exerciseId: string; type: string }[] }[],
  catalog: ChainCatalogEntry[],
  since: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of chains) {
    counts[c.id] = 0;
  }
  const exerciseChainIds = new Map<string, string[]>();
  for (const entry of catalog) {
    exerciseChainIds.set(entry.id, chainsForExercise(entry, chains));
  }

  for (const log of logs) {
    if (log.date < since) continue;
    for (const s of log.sets) {
      if (s.type !== "working") continue;
      const matchedChains = exerciseChainIds.get(s.exerciseId);
      if (matchedChains) {
        for (const cid of matchedChains) {
          counts[cid] = (counts[cid] ?? 0) + 1;
        }
      }
    }
  }
  return counts;
}

/** "Intrinsic 5 · Deep Longitudinal 31 · Lateral 0 · … working sets · untrained: Lateral" —
 *  the " · untrained: A, B" suffix appears only when ≥1 chain has 0 sets. */
export function chainBalanceText(chains: ChainDef[], counts: Record<string, number>): string {
  const parts = chains.map((c) => `${c.name} ${counts[c.id] ?? 0}`);
  const base = `${parts.join(" · ")} working sets`;
  const untrained = chains
    .filter((c) => (counts[c.id] ?? 0) === 0)
    .map((c) => c.name);
  if (untrained.length > 0) {
    return `${base} · untrained: ${untrained.join(", ")}`;
  }
  return base;
}
