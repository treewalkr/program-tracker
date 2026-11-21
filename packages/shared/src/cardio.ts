import { z } from "zod";
import {
  CardioInterval,
  CardioIntervalType,
  CardioPrescription,
  CardioRecovery,
  HrBpmRange,
  MAX_CARDIO_INTERVALS,
  PaceSecPerKm,
  ProgramWeeksDocument,
  type CardioLog,
  type CardioMetric,
  type CardioTarget,
  type CardioTargetUnit,
} from "./domain";

/**
 * Weekly cardio math: ISO-week windows and target progress.
 * Pure functions over logs the client page / overview already hold —
 * same pattern as metrics.ts. No server round-trip for progress.
 */

/** YYYY-MM-DD of the ISO week's Monday containing `now`. */
export function isoWeekStart(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOffset = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
  d.setDate(d.getDate() - dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Minimal log shape the totals need — SessionLog DTOs fit structurally. */
export interface CardioCountLog {
  date: string;
  kind?: string;
  cardio?: CardioLog | null;
}

/** One modality's week. Distance is only ever summed within a modality. */
export interface CardioModalityTotals {
  minutes: number;
  sessions: number;
  load: number;
  distanceKm: number;
}

export interface CardioTotals {
  minutes: number;
  sessions: number;
  /** Session load in AU: Σ session RPE × minutes over logs that have an RPE. */
  load: number;
  /** Legacy minutes × logged zone, only for a `zone_minutes` target saved before session load. */
  zoneMinutes: number;
  /** Keyed by the logged modality name; never summed across modalities. */
  byModality: Record<string, CardioModalityTotals>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Totals over cardio logs with `date >= since` (string compare on YYYY-MM-DD).
 *  Skipped logs don't count. Exercise logs and other clients' rows are ignored
 *  by the caller's filter. */
export function cardioWeekTotals(logs: CardioCountLog[], since: string): CardioTotals {
  const totals: CardioTotals = { minutes: 0, sessions: 0, load: 0, zoneMinutes: 0, byModality: {} };
  let seconds = 0;
  const modSeconds: Record<string, number> = {};
  for (const log of logs) {
    if (log.kind !== "cardio") continue;
    if (log.date < since) continue;
    if (isSkippedCardio(log.cardio)) continue;
    totals.sessions += 1;
    const sec = cardioLogSec(log.cardio);
    const load = sessionLoad(log.cardio) ?? 0;
    totals.load += load;
    if (sec != null) {
      seconds += sec;
      totals.zoneMinutes += Math.round((sec / 60) * (log.cardio?.hrZone ?? 1));
    }
    const name = log.cardio?.modality?.trim();
    if (name) {
      const m = (totals.byModality[name] ??= { minutes: 0, sessions: 0, load: 0, distanceKm: 0 });
      m.sessions += 1;
      m.load += load;
      m.distanceKm = round1(m.distanceKm + (log.cardio?.distanceKm ?? 0));
      modSeconds[name] = (modSeconds[name] ?? 0) + (sec ?? 0);
    }
  }
  totals.minutes = Math.round(seconds / 60);
  for (const [name, m] of Object.entries(totals.byModality)) m.minutes = Math.round(modSeconds[name] / 60);
  return totals;
}

/** Done-value in the target's unit. */
export function cardioDone(target: CardioTarget, totals: CardioTotals): number {
  if (target.unit === "minutes") return totals.minutes;
  if (target.unit === "sessions") return totals.sessions;
  if (target.unit === "session_load") return totals.load;
  return totals.zoneMinutes;
}

/** The units a trainer can pick now; `zone_minutes` is still read but no longer offered. */
export const OFFERED_CARDIO_TARGET_UNITS = ["minutes", "sessions", "session_load"] as const satisfies readonly CardioTargetUnit[];

export function cardioUnitLabel(unit: CardioTargetUnit): "min" | "sessions" | "AU" | "zone-min" {
  if (unit === "minutes") return "min";
  if (unit === "sessions") return "sessions";
  if (unit === "session_load") return "AU";
  return "zone-min";
}

// ---------------------------------------------------------------------------
// Prescription rules and totals
// ---------------------------------------------------------------------------

type Rx = Pick<CardioPrescription, "durationMin" | "distanceKm" | "hrBpm" | "intervals">;

const hasWork = (v: { durationSec?: number; distanceM?: number }) =>
  (v.durationSec ?? 0) > 0 || (v.distanceM ?? 0) > 0;

/**
 * Why a prescription can't be saved (empty = fine). Needs at least one
 * workload: a duration, a distance, or an interval with a time or distance.
 * Number ranges are the schema's job; this checks what spans fields.
 */
export function cardioIssues(rx: Rx): string[] {
  const issues: string[] = [];
  const intervals = rx.intervals ?? [];
  const workload = (rx.durationMin ?? 0) > 0 || (rx.distanceKm ?? 0) > 0 || intervals.some(hasWork);
  if (!workload) issues.push("cardio needs a duration, a distance or an interval with a time or distance");
  if (rx.hrBpm && rx.hrBpm.min > rx.hrBpm.max) issues.push("target HR min must be ≤ max");
  intervals.forEach((iv, i) => {
    if (iv.hrBpm && iv.hrBpm.min > iv.hrBpm.max) issues.push(`interval ${i + 1}: target HR min must be ≤ max`);
    if (iv.recovery && iv.type !== "work") issues.push(`interval ${i + 1}: only a work interval has a recovery`);
    if (iv.recovery && !hasWork(iv.recovery)) issues.push(`interval ${i + 1}: recovery needs a time or distance`);
  });
  return issues;
}

export interface CardioPlanTotals {
  /** Whole session in seconds; null when any part is distance-only (never guessed). */
  durationSec: number | null;
  distanceM: number;
  /** Time in work intervals. */
  workSec: number;
  /** Time in recovery intervals and between reps. */
  recoverySec: number;
  /** True when some distance has no time, which is why durationSec is null. */
  untimedDistance: boolean;
}

/** Recoveries a work interval adds: between reps, plus one after the last when asked. */
export function recoveryCount(iv: Pick<CardioInterval, "repeat" | "recovery" | "recoveryAfterLast">): number {
  if (!iv.recovery) return 0;
  const reps = iv.repeat ?? 1;
  return iv.recoveryAfterLast ? reps : reps - 1;
}

/**
 * Planned totals. With intervals the intervals are the plan; without them the
 * session's own duration and distance are. A part with a distance but no time
 * makes the time unknown, and the app never estimates it.
 */
export function cardioTotals(rx: Rx): CardioPlanTotals {
  const intervals = rx.intervals ?? [];
  if (intervals.length === 0) {
    const durationSec = rx.durationMin != null && rx.durationMin > 0 ? rx.durationMin * 60 : null;
    const distanceM = Math.round((rx.distanceKm ?? 0) * 1000);
    return {
      durationSec,
      distanceM,
      workSec: durationSec ?? 0,
      recoverySec: 0,
      untimedDistance: durationSec == null && distanceM > 0,
    };
  }
  let time = 0;
  let distanceM = 0;
  let workSec = 0;
  let recoverySec = 0;
  let untimed = false;
  const add = (part: { durationSec?: number; distanceM?: number }, times: number, bucket: "work" | "recovery" | null) => {
    if (times <= 0) return;
    if (part.durationSec != null) {
      time += part.durationSec * times;
      if (bucket === "work") workSec += part.durationSec * times;
      if (bucket === "recovery") recoverySec += part.durationSec * times;
    } else if ((part.distanceM ?? 0) > 0) {
      untimed = true;
    }
    distanceM += (part.distanceM ?? 0) * times;
  };
  for (const iv of intervals) {
    const reps = iv.repeat ?? 1;
    const bucket = iv.type === "work" ? "work" : iv.type === "active_recovery" || iv.type === "passive_recovery" ? "recovery" : null;
    add(iv, reps, bucket);
    if (iv.recovery) add(iv.recovery, recoveryCount(iv), "recovery");
  }
  return { durationSec: untimed ? null : time, distanceM, workSec, recoverySec, untimedDistance: untimed };
}

// ---------------------------------------------------------------------------
// AI drafts: coerce, never reject
// ---------------------------------------------------------------------------

const optionalCatch = <T extends z.ZodTypeAny>(s: T) => s.optional().catch(undefined);

/** One interval as the AI wrote it; bad optional fields drop, a bad interval drops (see coerceIntervals). */
const LooseInterval = z.object({
  id: z.string().min(1).max(64),
  type: CardioIntervalType,
  repeat: z.number().int().min(1).max(50).catch(1).default(1),
  durationSec: optionalCatch(CardioInterval.shape.durationSec),
  distanceM: optionalCatch(CardioInterval.shape.distanceM),
  hrZone: optionalCatch(CardioInterval.shape.hrZone),
  hrBpm: optionalCatch(HrBpmRange),
  paceSecPerKm: optionalCatch(PaceSecPerKm),
  rpe: optionalCatch(CardioInterval.shape.rpe),
  notes: optionalCatch(CardioInterval.shape.notes),
  recovery: optionalCatch(CardioRecovery),
  recoveryAfterLast: optionalCatch(z.boolean()),
});

/** Ids the AI forgot get filled so the interval survives. */
function coerceIntervals(raw: unknown): unknown {
  if (!Array.isArray(raw)) return undefined;
  const out: CardioInterval[] = [];
  for (const [i, item] of raw.entries()) {
    if (out.length >= MAX_CARDIO_INTERVALS) break;
    const withId = item && typeof item === "object" && !Array.isArray(item) && !(item as { id?: unknown }).id
      ? { ...(item as object), id: `i${i + 1}` }
      : item;
    const parsed = LooseInterval.safeParse(withId);
    if (!parsed.success) continue;
    const iv = parsed.data as CardioInterval;
    if (iv.recovery && iv.type !== "work") delete iv.recovery;
    out.push(iv);
  }
  return out.length ? out : undefined;
}

/**
 * The cardio prescription an AI draft may carry: the modality is required,
 * everything else drops quietly when it's malformed, so a strict rule never
 * fails a generation.
 */
export const CoercedCardioPrescription = z.object({
  modality: CardioPrescription.shape.modality,
  durationMin: z.number().int().min(1).max(300).nullable().optional().catch(undefined),
  hrZone: z.number().int().min(1).max(5).nullable().optional().catch(undefined),
  intensity: optionalCatch(z.string().max(60)),
  distanceKm: optionalCatch(z.number().min(0).max(300)),
  targetRpe: optionalCatch(z.number().min(1).max(10)),
  paceSecPerKm: optionalCatch(PaceSecPerKm),
  hrBpm: optionalCatch(HrBpmRange),
  modalityId: optionalCatch(z.string().min(1).max(64)),
  templateId: optionalCatch(z.string().min(1).max(64)),
  intervals: z.preprocess(coerceIntervals, z.array(CardioInterval).max(MAX_CARDIO_INTERVALS).optional()),
});

/** Coerce a raw AI cardio object; null when even the modality is unusable. */
export function coerceCardio(raw: unknown): CardioPrescription | null {
  const parsed = CoercedCardioPrescription.safeParse(raw);
  return parsed.success ? (parsed.data as CardioPrescription) : null;
}

// ---------------------------------------------------------------------------
// Program write boundary
// ---------------------------------------------------------------------------

/**
 * The weeks document a trainer write must pass: the shared document schema plus
 * the cardio workload rule. Reads keep using ProgramWeeksDocument, so an older
 * modality-only session still loads (the editor flags it before saving).
 */
export const ProgramWeeksWrite = ProgramWeeksDocument.superRefine((weeks, ctx) => {
  weeks.forEach((w, wi) =>
    w.sessions.forEach((s, si) => {
      if (s.kind !== "cardio" || !s.cardio) return;
      for (const message of cardioIssues(s.cardio)) {
        ctx.addIssue({ code: "custom", message, path: [wi, "sessions", si, "cardio"] });
      }
    })
  );
});

// ---------------------------------------------------------------------------
// Cardio logs
// ---------------------------------------------------------------------------

type LogTime = Pick<CardioLog, "durationSec" | "durationMin">;

/** A log's time in seconds: `durationSec`, else an old row's minutes × 60; null when neither. */
export function cardioLogSec(log: LogTime | null | undefined): number | null {
  if (!log) return null;
  if (log.durationSec != null) return log.durationSec;
  if (log.durationMin != null) return log.durationMin * 60;
  return null;
}

/** True for a log the member marked as not done. */
export function isSkippedCardio(log: Pick<CardioLog, "skipped"> | null | undefined): boolean {
  return log?.skipped != null;
}

/** Session load in AU: session RPE × minutes, rounded; null without both (or when skipped). */
export function sessionLoad(log: (LogTime & Pick<CardioLog, "rpe" | "skipped">) | null | undefined): number | null {
  if (!log || isSkippedCardio(log) || log.rpe == null) return null;
  const sec = cardioLogSec(log);
  if (sec == null) return null;
  return Math.round((log.rpe * sec) / 60);
}

export type CardioPace =
  | { metric: "pace"; secPerKm: number }
  | { metric: "split"; secPer500m: number }
  | { metric: "speed"; kmh: number };

/** Pace, split or speed by the modality's metric; null without a distance > 0 and a time, or for metric "none". */
export function cardioPace(log: (LogTime & Pick<CardioLog, "distanceKm">) | null | undefined, metric: CardioMetric): CardioPace | null {
  const sec = cardioLogSec(log);
  const km = log?.distanceKm ?? 0;
  if (sec == null || sec <= 0 || km <= 0) return null;
  if (metric === "pace") return { metric, secPerKm: Math.round(sec / km) };
  if (metric === "split") return { metric, secPer500m: Math.round(sec / (km * 2)) };
  if (metric === "speed") return { metric, kmh: Math.round((km / (sec / 3600)) * 10) / 10 };
  return null;
}

/**
 * Why a cardio log can't be written now (empty = fine): a completed log needs
 * its time and session RPE; a skipped one needs only its reason.
 */
export function cardioLogIssues(log: CardioLog): string[] {
  if (isSkippedCardio(log)) return [];
  const issues: string[] = [];
  if (log.durationSec == null) issues.push("a completed cardio log needs its duration (durationSec)");
  if (log.rpe == null) issues.push("a completed cardio log needs a session RPE");
  return issues;
}

/** The log as it's stored: `durationMin` mirrors `durationSec` (rounded, at least 1) so a rollback still reads it. */
export function withDurationMin<T extends LogTime>(log: T): T {
  if (log.durationSec == null) return log;
  return { ...log, durationMin: Math.max(1, Math.round(log.durationSec / 60)) };
}

/** Reading any stored log: an old minutes-only row gains `durationSec`. Nothing else changes. */
export function upgradeCardioLog<T extends LogTime>(log: T): T {
  if (log.durationSec != null || log.durationMin == null) return log;
  return { ...log, durationSec: log.durationMin * 60 };
}
