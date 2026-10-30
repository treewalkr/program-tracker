import { estimate1rm } from "./domain";
import type { CardioLog, Phasing, ProgramWeek, SetType, WeekDirective, WeekTarget } from "./domain";

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
  /** "lifting" (default) or "cardio" — cardio logs carry no sets. */
  kind?: string;
  /** Cardio actuals when kind is "cardio". */
  cardio?: CardioLog | null;
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

/** Block anchor (activatedAt ?? first log ?? createdAt) — the date every
 *  block-week window derives from. */
export function blockAnchorDate(program: SignalProgram, logs: SignalLog[]): string {
  const programLogs = logs.filter((l) => l.programId === program.id);
  return (
    program.activatedAt ??
    programLogs.map((l) => l.date).sort()[0] ??
    program.createdAt
  );
}

/** Fractional days since the block anchor (activatedAt ?? first log ?? createdAt) —
 *  the same anchor weekOf uses; weekOf is refactored onto the shared private anchor. */
export function daysIntoBlock(
  program: SignalProgram,
  logs: SignalLog[],
  now = Date.now()
): number {
  const start = blockAnchorDate(program, logs);
  return (now - new Date(start).getTime()) / 86400_000;
}

/** 1-indexed block week derived from first activation (or first log / creation). */
export function weekOf(program: SignalProgram, logs: SignalLog[], now = Date.now()): number {
  const days = daysIntoBlock(program, logs, now);
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

// ---------------------------------------------------------------------------
// Weekly result summary (client-facing messages)
// ---------------------------------------------------------------------------

/** A per-exercise PR: this week's best working set strictly beat the exercise's
 *  best e1RM in earlier weeks of the same program. */
export interface PrEntry {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  /** Prior best e1RM in earlier weeks of the same program (always < e1rm). */
  prevBest: number;
}

/** Deterministic snapshot of one logged block week — the single source the AI
 *  message prompt, the API audit row, and the web mock all share. */
export interface WeekSummaryStats {
  week: number;
  /** ISO date (YYYY-MM-DD) the week window starts — anchor + (week-1)*7 days. */
  weekStart: string;
  sessionsLogged: number;
  /** Sessions in the program doc's week w; null if week not in doc. */
  sessionsPlanned: number | null;
  /** round(logged / planned * 100); null when planned is null/0. */
  adherencePct: number | null;
  /** Σ kg × reps of working sets with a load (matches blockPulse). */
  overallVolume: number;
  /** % vs week-1, only when week-1 has logged volume > 0. */
  overallVolumeDelta: number | null;
  /** Working sets. */
  sets: number;
  /** Rounded to 0.1. */
  avgRpe: number | null;
  bestE1rm: number;
  /** Decision 7: this week beats the prior block-best, sorted by e1RM desc. */
  prs: PrEntry[];
  nextWeek: { week: number; directive: WeekDirective | null; target: WeekTarget | null } | null;
}

export interface WeekSummaryInput {
  program: SignalProgram;
  /** All of the client's logs; filtered to program.id inside. */
  logs: SignalLog[];
  /** 1-indexed block week. */
  week: number;
  catalog: { id: string; name: string }[];
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekly result summary from logged data; null when the week window has no
 *  session logs for this program (callers 422 on that). */
export function weekSummary(input: WeekSummaryInput): WeekSummaryStats | null {
  const { program, logs, week, catalog } = input;
  const anchor = blockAnchorDate(program, logs).slice(0, 10);
  const weekStart = addDaysIso(anchor, (week - 1) * 7);
  const weekEnd = addDaysIso(anchor, week * 7);

  const inWindow = logs.filter(
    (l) => l.programId === program.id && l.date >= weekStart && l.date < weekEnd
  );
  if (inWindow.length === 0) return null;

  let overallVolume = 0;
  let sets = 0;
  let rpeSum = 0;
  let rpeN = 0;
  let bestE1rm = 0;
  const weekBest = new Map<string, { weightKg: number; reps: number; e1rm: number }>();
  for (const log of inWindow) {
    for (const s of log.sets) {
      if (s.type !== "working") continue;
      sets += 1;
      if (s.weightKg) overallVolume += s.weightKg * s.reps;
      if (s.rpe) {
        rpeSum += s.rpe;
        rpeN += 1;
      }
      if (s.weightKg && s.reps) {
        const e1rm = estimate1rm(s.weightKg, s.reps);
        bestE1rm = Math.max(bestE1rm, e1rm);
        const cur = weekBest.get(s.exerciseId);
        if (!cur || e1rm > cur.e1rm) {
          weekBest.set(s.exerciseId, { weightKg: s.weightKg, reps: s.reps, e1rm });
        }
      }
    }
  }

  // Prior best e1RM per exercise across earlier weeks of the same program.
  const priorBest = new Map<string, number>();
  let prevWeekVolume = 0;
  const prevWeekStart = addDaysIso(anchor, (week - 2) * 7);
  for (const log of logs) {
    if (log.programId !== program.id) continue;
    if (log.date < anchor || log.date >= weekStart) continue;
    if (log.date >= prevWeekStart) {
      for (const s of log.sets) {
        if (s.type === "working" && s.weightKg) prevWeekVolume += s.weightKg * s.reps;
      }
    }
    for (const s of log.sets) {
      if (s.type !== "working" || !s.weightKg || !s.reps) continue;
      const e1rm = estimate1rm(s.weightKg, s.reps);
      priorBest.set(s.exerciseId, Math.max(priorBest.get(s.exerciseId) ?? 0, e1rm));
    }
  }

  const nameById = new Map(catalog.map((e) => [e.id, e.name]));
  const prs = [...weekBest.entries()]
    .flatMap(([exerciseId, best]) => {
      const prev = priorBest.get(exerciseId);
      if (prev == null || best.e1rm <= prev) return [];
      return [
        {
          exerciseId,
          exerciseName: nameById.get(exerciseId) ?? exerciseId,
          weightKg: best.weightKg,
          reps: best.reps,
          e1rm: best.e1rm,
          prevBest: prev,
        },
      ];
    })
    .sort((a, b) => b.e1rm - a.e1rm);

  const docWeek = program.weeks.find((w) => w.week === week);
  const sessionsPlanned = docWeek
    ? docWeek.days.flatMap((d) => d.sessions).length
    : null;
  const adherencePct =
    sessionsPlanned && sessionsPlanned > 0
      ? Math.round((inWindow.length / sessionsPlanned) * 100)
      : null;

  const nextPlan = program.phasing?.weeks?.find((w) => w.week === week + 1);

  return {
    week,
    weekStart,
    sessionsLogged: inWindow.length,
    sessionsPlanned,
    adherencePct,
    overallVolume,
    overallVolumeDelta:
      week > 1 && prevWeekVolume > 0
        ? Math.round(((overallVolume - prevWeekVolume) / prevWeekVolume) * 100)
        : null,
    sets,
    avgRpe: rpeN > 0 ? Math.round((rpeSum / rpeN) * 10) / 10 : null,
    bestE1rm,
    prs,
    nextWeek: nextPlan
      ? {
          week: nextPlan.week,
          directive: nextPlan.directive ?? null,
          target: nextPlan.target ?? null,
        }
      : null,
  };
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
