import type { CardioLog, SetType } from "./domain";

/**
 * Day intensity for the overview's contributions strip: how much a client
 * logged on one calendar day, shaded 1–4 against their own usual day.
 * Pure functions — web DTOs fit the minimal input shapes structurally.
 *
 * Measure (per day, first that applies):
 *  - tonnage  — Σ kg × reps of loaded sets (timed holds excluded)
 *  - sets     — lifting with no load (bodyweight, timed): set count
 *  - minutes  — cardio-only day: Σ duration
 *  - sessions — cardio with no duration: log count
 * Each day compares only against days measured the same way.
 */

export type VolumeBasis = "tonnage" | "sets" | "minutes" | "sessions";

export interface DayVolume {
  basis: VolumeBasis;
  amount: number;
}

export interface DayVolumeLog {
  kind?: string;
  cardio?: Pick<CardioLog, "durationMin"> | null;
  sets: { exerciseId: string; type?: SetType; weightKg?: number | null; reps: number }[];
}

/** One day's logged volume; null when nothing was logged. `timed` = exercise
 *  ids prescribed as timed holds (their reps are seconds). */
export function dayVolume(logs: DayVolumeLog[], timed: Set<string> = new Set()): DayVolume | null {
  if (logs.length === 0) return null;
  let tonnage = 0;
  let sets = 0;
  let minutes = 0;
  let cardioLogs = 0;
  for (const log of logs) {
    if (log.kind === "cardio") {
      cardioLogs += 1;
      minutes += log.cardio?.durationMin ?? 0;
      continue;
    }
    for (const s of log.sets) {
      sets += 1;
      if (!timed.has(s.exerciseId) && s.weightKg) tonnage += s.weightKg * s.reps;
    }
  }
  if (tonnage > 0) return { basis: "tonnage", amount: tonnage };
  if (sets > 0) return { basis: "sets", amount: sets };
  if (minutes > 0) return { basis: "minutes", amount: minutes };
  return { basis: "sessions", amount: Math.max(1, cardioLogs) };
}

export interface VolumeBaseline {
  q1: number;
  median: number;
  q3: number;
}

/** Linear-interpolated quantile of an ascending list. */
function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Quartiles of a client's logged days (one basis). Empty input → zeros. */
export function volumeBaseline(amounts: number[]): VolumeBaseline {
  if (amounts.length === 0) return { q1: 0, median: 0, q3: 0 };
  const sorted = [...amounts].sort((a, b) => a - b);
  return { q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75) };
}

/** 1 = light (below Q1), 2 = below usual, 3 = usual (median…Q3), 4 = big (above Q3).
 *  Quartile cut points keep one outlier day from washing out the rest. */
export function intensityLevel(amount: number, b: VolumeBaseline): 1 | 2 | 3 | 4 {
  if (amount > b.q3) return 4;
  if (amount >= b.median) return 3;
  if (amount >= b.q1) return 2;
  return 1;
}

/** Levels for a run of days (0 = nothing logged), each against the usual day of its own basis. */
export function dayIntensityLevels(days: (DayVolume | null)[]): (0 | 1 | 2 | 3 | 4)[] {
  const byBasis = new Map<VolumeBasis, number[]>();
  for (const d of days) if (d) byBasis.set(d.basis, [...(byBasis.get(d.basis) ?? []), d.amount]);
  const baselines = new Map([...byBasis].map(([k, v]) => [k, volumeBaseline(v)] as const));
  return days.map((d) => (d ? intensityLevel(d.amount, baselines.get(d.basis)!) : 0));
}
