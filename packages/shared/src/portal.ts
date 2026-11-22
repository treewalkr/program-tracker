import { z } from "zod";
import { normalizeKind } from "./sessionKind";
import {
  CardioIntervalType,
  CardioLog,
  HrBpmRange,
  LoggedBy,
  Readiness,
  SessionFlag,
  SessionKind,
  SetType,
  sessionsInSeqOrder,
  CardioTargetUnit,
  type CardioInterval,
  type CardioPrescription,
  type CardioTarget,
  type OneRepMaxes,
  type Phasing,
  type ProgramSession,
} from "./domain";
import { oneRepMaxKg, resolveLoadKg } from "./load";
import { addDays, isoWeekday } from "./importHistory";
import { cardioDone, cardioLogSec, cardioWeekTotals, isoWeekStart, sessionLoad, type CardioCountLog } from "./cardio";
import { zoneBpm, type HrZones } from "./hr";
import { Vo2Protocol } from "./vo2max";
import { localDateOf } from "./metrics";

// ---------------------------------------------------------------------------
// Client portal — what a client may see of their program. An explicit
// allow-list: every field is picked by name, never spread from the program,
// so direction, phasing, limitations, goals and 1RMs can't leak.
// ---------------------------------------------------------------------------

/** A prescribed set as the client sees it: %1RM already resolved to kg. */
export const PortalSet = z.object({
  setNumber: z.number().int(),
  type: SetType,
  reps: z.number().int(),
  repsMin: z.number().int().optional(),
  amrap: z.boolean(),
  durationSeconds: z.number().int().optional(),
  /** Resolved load (kg); null = no load (auto-regulated or bodyweight). */
  targetWeightKg: z.number().nullable(),
  targetRpe: z.number().optional(),
  targetRpeMin: z.number().optional(),
  targetRir: z.number().optional(),
  tempo: z.string().optional(),
  stopRpe: z.number().optional(),
  restSeconds: z.number().int().optional(),
  /** The client's last logged kg for this exercise and set (any program); prefills a set with no target. */
  lastWeightKg: z.number().nullable().optional(),
});
export type PortalSet = z.infer<typeof PortalSet>;

/** The client's own last comparable set on this exercise — a reference, never a suggestion. */
export const PortalLastSet = z.object({
  date: z.string(),
  weightKg: z.number().nullable(),
  reps: z.number().int(),
  rpe: z.number().nullable(),
});
export type PortalLastSet = z.infer<typeof PortalLastSet>;

export const PortalExercise = z.object({
  /** The program-exercise slot id (`programExerciseId` on a log). */
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  order: z.number().int(),
  group: z.string().optional(),
  notes: z.string().optional(),
  /** Bodyweight move: a set with no kg is complete as logged. */
  bodyweight: z.boolean().optional(),
  /** Last time: the client's heaviest set in a comparable rep range, from their newest earlier session with one. */
  last: PortalLastSet.nullable().optional(),
  prescribedSets: z.array(PortalSet),
});
export type PortalExercise = z.infer<typeof PortalExercise>;

/** A set the client logged, as they entered it. */
export const PortalLoggedSet = z.object({
  programExerciseId: z.string().nullable(),
  exerciseId: z.string(),
  setNumber: z.number().int(),
  type: SetType,
  weightKg: z.number().nullable(),
  reps: z.number().int(),
  rpe: z.number().nullable(),
  /** Saved untouched from the prescription. */
  asPlanned: z.boolean(),
});
export type PortalLoggedSet = z.infer<typeof PortalLoggedSet>;

/** What the client entered on their own log — so "Edit log" reopens it, not the plan. */
export const PortalLogEntry = z.object({
  sets: z.array(PortalLoggedSet),
  cardio: CardioLog.nullable(),
  notes: z.string().nullable(),
  perceivedEnergy: z.number().int().nullable(),
  readiness: Readiness.nullable(),
  flags: z.array(SessionFlag).nullable(),
  /** The coach's note on this log and when they reviewed it (optional: older API builds don't send them). */
  trainerFeedback: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
});
export type PortalLogEntry = z.infer<typeof PortalLogEntry>;

/** The log on a session, for its done state. */
export const PortalSessionLog = z.object({
  id: z.string(),
  loggedBy: LoggedBy,
  date: z.string(),
  /** A cardio log marked "didn't do it": the session is resolved but not done (optional: older API builds don't send it). */
  skipped: z.boolean().optional(),
  /** Only on the client's own log: what they entered. A coach's log never carries it. */
  entry: PortalLogEntry.optional(),
});
export type PortalSessionLog = z.infer<typeof PortalSessionLog>;

/** An interval as the client sees it: bpm already resolved from their HR zones. */
export const PortalCardioInterval = z.object({
  id: z.string(),
  type: CardioIntervalType,
  repeat: z.number().int(),
  durationSec: z.number().int().optional(),
  distanceM: z.number().int().optional(),
  hrZone: z.number().int().optional(),
  hrBpm: HrBpmRange.optional(),
  paceSecPerKm: z.number().int().optional(),
  rpe: z.number().optional(),
  notes: z.string().optional(),
  recovery: z
    .object({ type: z.enum(["active_recovery", "passive_recovery"]), durationSec: z.number().int().optional(), distanceM: z.number().int().optional() })
    .optional(),
  recoveryAfterLast: z.boolean().optional(),
});
export type PortalCardioInterval = z.infer<typeof PortalCardioInterval>;

/** The cardio prescription a client sees: targets and intervals, bpm resolved; no library ids or HR profile. */
export const PortalCardioPrescription = z.object({
  modality: z.string(),
  durationMin: z.number().int().optional(),
  hrZone: z.number().int().optional(),
  intensity: z.string().optional(),
  distanceKm: z.number().optional(),
  targetRpe: z.number().optional(),
  paceSecPerKm: z.number().int().optional(),
  /** The coach's own bpm band, else the zone's band from the client's HR profile. */
  hrBpm: HrBpmRange.optional(),
  intervals: z.array(PortalCardioInterval).optional(),
});
export type PortalCardioPrescription = z.infer<typeof PortalCardioPrescription>;

export const PortalSession = z.object({
  id: z.string(),
  name: z.string(),
  kind: SessionKind,
  seq: z.number().int(),
  weekday: z.number().int().nullable(),
  order: z.number().int(),
  typeName: z.string().optional(),
  notes: z.string().optional(),
  exercises: z.array(PortalExercise),
  cardio: PortalCardioPrescription.nullable(),
  log: PortalSessionLog.nullable(),
});
export type PortalSession = z.infer<typeof PortalSession>;

export const PortalWeek = z.object({
  /** Block week number. */
  week: z.number().int(),
  /** First and last calendar day of this block week (YYYY-MM-DD). */
  startDate: z.string(),
  endDate: z.string(),
  /** Only the current week can be logged from the portal. */
  loggable: z.boolean(),
  /** Why this week looks different, in words the client can have — never the directive itself. */
  weekLabel: z.enum(["deload", "test"]).nullable().optional(),
  sessions: z.array(PortalSession),
});
export type PortalWeek = z.infer<typeof PortalWeek>;

/** This week's cardio against the coach's weekly target (Mon–Sun, like the coach's pace check). */
export const PortalCardio = z.object({
  unit: CardioTargetUnit,
  target: z.number(),
  done: z.number(),
  /** This week's sessions and minutes, which the member reads first (optional: older API builds don't send them). */
  sessions: z.number().optional(),
  minutes: z.number().optional(),
});
export type PortalCardio = z.infer<typeof PortalCardio>;

/** `GET /v1/portal/week`: the active program's current and (when planned) next week. */
export const PortalWeekDto = z.object({
  /** `startsOn`: the day Week 1 starts (set on newer programs); before it, nothing is loggable. */
  program: z.object({ id: z.string(), name: z.string(), startsOn: z.string().nullable().optional() }).nullable(),
  currentWeek: z.number().int().nullable(),
  weeks: z.array(PortalWeek),
  /** Null when the coach set no cardio target. */
  cardio: PortalCardio.nullable().optional(),
});
export type PortalWeekDto = z.infer<typeof PortalWeekDto>;

/** This ISO week's cardio done against the target, counted exactly as the coach's cardio-behind signal counts it. */
export function portalCardio(target: CardioTarget | null | undefined, logs: readonly CardioCountLog[], now: number): PortalCardio | null {
  if (!target) return null;
  const totals = cardioWeekTotals([...logs], isoWeekStart(new Date(now)));
  return { unit: target.unit, target: target.value, done: cardioDone(target, totals), sessions: totals.sessions, minutes: totals.minutes };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Today" for a portal request: the client's own local date when it is within a
 * day of the server's (time zones put a Thai phone up to a day apart), the
 * server's when none was sent, and null when the phone's date is further off.
 */
export function portalToday(asked: string | undefined | null, now: number): string | null {
  const server = localDateOf(now);
  if (asked == null) return server;
  if (!ISO_DAY.test(asked) || Number.isNaN(Date.parse(`${asked}T00:00:00Z`))) return null;
  return asked >= addDays(server, -1) && asked <= addDays(server, 1) ? asked : null;
}

/** Midday on `date` in the runtime's zone — a clock time whose local date is `date`, for week math. */
export function nowOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/** The client-safe label for block week `week`: a deload or a test week, else none.
 *  Only the label crosses into the portal; the phasing scheme stays with the coach. */
export function portalWeekLabel(phasing: Phasing | null | undefined, week: number): "deload" | "test" | null {
  const d = phasing?.weeks?.find((w) => w.week === week)?.directive;
  return d === "deload" || d === "test" ? d : null;
}

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const num = (v: number | string | null | undefined): number | null => (v == null || v === "" ? null : Number(v));

/** The client's own log entry, every field picked by name (numeric columns arrive as strings). */
export function portalLogEntry(
  log: {
    cardio?: CardioLog | null;
    notes?: string | null;
    perceivedEnergy?: number | null;
    readiness?: Readiness | null;
    flags?: SessionFlag[] | null;
    trainerFeedback?: string | null;
    reviewedAt?: Date | string | null;
  },
  sets: readonly {
    programExerciseId?: string | null;
    exerciseId: string;
    setNumber: number;
    type: string;
    weightKg?: number | string | null;
    reps: number;
    rpe?: number | string | null;
    asPlanned?: boolean | null;
  }[]
): PortalLogEntry {
  return {
    sets: [...sets]
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => ({
        programExerciseId: s.programExerciseId ?? null,
        exerciseId: s.exerciseId,
        setNumber: s.setNumber,
        type: s.type === "backoff" ? "backoff" : "working",
        weightKg: num(s.weightKg),
        reps: s.reps,
        rpe: num(s.rpe),
        asPlanned: s.asPlanned ?? false,
      })),
    cardio: log.cardio ?? null,
    notes: log.notes ?? null,
    perceivedEnergy: log.perceivedEnergy ?? null,
    readiness: log.readiness ?? null,
    flags: log.flags ?? null,
    trainerFeedback: log.trainerFeedback ?? null,
    reviewedAt: log.reviewedAt instanceof Date ? log.reviewedAt.toISOString() : (log.reviewedAt ?? null),
  };
}

/** What the projection knows beyond the program: equipment and the client's last loads. */
export interface PortalLoadContext {
  isBodyweight?: (exerciseId: string) => boolean;
  lastWeights?: LastWeights;
  lastSets?: LastSets;
  /** The client's HR zones in effect now; a zone target shows as its bpm band. */
  hrZones?: HrZones | null;
  /**
   * The zones in effect on a session's own day (by ISO weekday; null = any
   * day). Wins over `hrZones`, so a profile starting later in the block shows
   * only on the weeks it covers.
   */
  hrZonesFor?: (weekday: number | null) => HrZones | null;
}

/** The calendar day of an ISO weekday inside a 7-day block week starting `weekStart`; the start for "any day". */
export function sessionDateIn(weekStart: string, weekday: number | null | undefined): string {
  if (!weekday) return weekStart;
  return addDays(weekStart, (weekday - isoWeekday(weekStart) + 7) % 7);
}

/** Per exercise, the client's sessions with it, newest first: each session's sets. */
export type LastSets = Map<string, PortalLastSet[][]>;

/**
 * The client's sets per exercise, grouped by session day, newest first — only days
 * before `before` (this week's start), so "last time" is never today's own entry.
 */
export function lastSetsOf(
  logs: readonly { date: string; sets: readonly { exerciseId: string; weightKg?: number | string | null; reps: number; rpe?: number | string | null }[] }[],
  before: string
): LastSets {
  const byEx = new Map<string, Map<string, PortalLastSet[]>>();
  for (const log of logs) {
    const date = log.date.slice(0, 10);
    if (date >= before) continue;
    for (const s of log.sets) {
      const days = byEx.get(s.exerciseId) ?? new Map<string, PortalLastSet[]>();
      const kg = s.weightKg == null || s.weightKg === "" ? null : Number(s.weightKg);
      const rpe = s.rpe == null || s.rpe === "" ? null : Number(s.rpe);
      days.set(date, [...(days.get(date) ?? []), { date, weightKg: kg, reps: s.reps, rpe }]);
      byEx.set(s.exerciseId, days);
    }
  }
  return new Map([...byEx].map(([ex, days]) => [ex, [...days].sort((a, b) => b[0].localeCompare(a[0])).map(([, sets]) => sets)]));
}

/** Two reps either side of the prescribed range still compares; further out is different work. */
const REP_SLACK = 2;

/** The newest earlier session with a set in a comparable rep range: its heaviest such set. */
export function lastComparable(last: LastSets | undefined, exerciseId: string, range: { min: number; max: number }): PortalLastSet | null {
  for (const sets of last?.get(exerciseId) ?? []) {
    const fit = sets.filter((s) => s.reps > 0 && s.reps >= range.min - REP_SLACK && s.reps <= range.max + REP_SLACK);
    if (fit.length === 0) continue;
    return fit.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) || ((b.weightKg ?? 0) === (a.weightKg ?? 0) && b.reps > a.reps) ? b : a));
  }
  return null;
}

/** The rep range an exercise is prescribed in (working sets); null for timed holds. */
function repRangeOf(sets: readonly { reps: number; repsMin?: number | null; amrap?: boolean; durationSeconds?: number | null; type?: string }[]) {
  const work = sets.filter((s) => s.type !== "backoff");
  const pool = work.length > 0 ? work : sets;
  if (pool.length === 0 || pool.some((s) => s.durationSeconds != null)) return null;
  const min = Math.min(...pool.map((s) => s.repsMin ?? s.reps));
  const max = pool.some((s) => s.amrap) ? Infinity : Math.max(...pool.map((s) => s.reps));
  return { min, max };
}

/** Last logged kg per exercise: `exerciseId#setNumber` first, else the exercise's latest set. */
export type LastWeights = Map<string, number>;

/**
 * The client's last logged kg per exercise and set, oldest log first so the newest wins.
 * Sets with no kg (bodyweight, blank) are ignored.
 */
export function lastWeightsOf(
  logs: readonly { date: string; sets: readonly { exerciseId: string; setNumber: number; weightKg?: number | string | null }[] }[]
): LastWeights {
  const out: LastWeights = new Map();
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const s of [...log.sets].sort((a, b) => a.setNumber - b.setNumber)) {
      if (s.weightKg == null || s.weightKg === "") continue;
      const kg = Number(s.weightKg);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      out.set(`${s.exerciseId}#${s.setNumber}`, kg);
      out.set(s.exerciseId, kg);
    }
  }
  return out;
}

const lastKgOf = (w: LastWeights | undefined, exerciseId: string, setNumber: number) =>
  w?.get(`${exerciseId}#${setNumber}`) ?? w?.get(exerciseId) ?? null;

/** One program session as the client sees it. */
export function portalSession(
  s: ProgramSession,
  maxes: OneRepMaxes | null | undefined,
  log: PortalSessionLog | null,
  loads: PortalLoadContext = {}
): PortalSession {
  return {
    id: s.id,
    name: s.name,
    kind: normalizeKind(s.kind ?? "exercises"),
    seq: s.seq,
    weekday: s.weekday ?? null,
    order: s.order,
    typeName: opt(s.typeName),
    notes: opt(s.notes),
    exercises: [...(s.exercises ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((e) => {
        const max = oneRepMaxKg(maxes, e.exerciseId);
        return {
          id: e.id,
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName ?? "Exercise",
          order: e.order,
          group: opt(e.group),
          notes: opt(e.notes),
          bodyweight: loads.isBodyweight?.(e.exerciseId) ?? false,
          last: (() => {
            const range = loads.lastSets ? repRangeOf(e.prescribedSets) : null;
            return range ? lastComparable(loads.lastSets, e.exerciseId, range) : null;
          })(),
          prescribedSets: e.prescribedSets.map((ps) => ({
            setNumber: ps.setNumber,
            type: ps.type ?? "working",
            reps: ps.reps,
            repsMin: opt(ps.repsMin),
            amrap: ps.amrap ?? false,
            durationSeconds: opt(ps.durationSeconds),
            targetWeightKg: resolveLoadKg(ps, max),
            targetRpe: opt(ps.targetRpe),
            targetRpeMin: opt(ps.targetRpeMin),
            targetRir: opt(ps.targetRir),
            tempo: opt(ps.tempo),
            stopRpe: opt(ps.stopRpe),
            restSeconds: opt(ps.restSeconds),
            lastWeightKg: lastKgOf(loads.lastWeights, e.exerciseId, ps.setNumber),
          })),
        };
      }),
    cardio: s.cardio ? portalCardioRx(s.cardio, loads.hrZonesFor ? loads.hrZonesFor(s.weekday ?? null) : loads.hrZones) : null,
    log,
  };
}

const bpmOf = (own: { min: number; max: number } | undefined, zone: number | null | undefined, zones: HrZones | null | undefined) =>
  own ? { min: own.min, max: own.max } : (zoneBpm(zones, zone) ?? undefined);

function portalInterval(iv: CardioInterval, zones: HrZones | null | undefined): PortalCardioInterval {
  return {
    id: iv.id,
    type: iv.type,
    repeat: iv.repeat ?? 1,
    durationSec: opt(iv.durationSec),
    distanceM: opt(iv.distanceM),
    hrZone: opt(iv.hrZone),
    hrBpm: bpmOf(iv.hrBpm, iv.hrZone, zones),
    paceSecPerKm: opt(iv.paceSecPerKm),
    rpe: opt(iv.rpe),
    notes: opt(iv.notes),
    recovery: iv.recovery
      ? { type: iv.recovery.type ?? "passive_recovery", durationSec: opt(iv.recovery.durationSec), distanceM: opt(iv.recovery.distanceM) }
      : undefined,
    recoveryAfterLast: opt(iv.recoveryAfterLast),
  };
}

/** The cardio prescription through the allow-list, with bpm resolved from the client's zones. */
export function portalCardioRx(c: CardioPrescription, zones?: HrZones | null): PortalCardioPrescription {
  return {
    modality: c.modality,
    durationMin: opt(c.durationMin),
    hrZone: opt(c.hrZone),
    intensity: opt(c.intensity),
    distanceKm: opt(c.distanceKm),
    targetRpe: opt(c.targetRpe),
    paceSecPerKm: opt(c.paceSecPerKm),
    hrBpm: bpmOf(c.hrBpm, c.hrZone, zones),
    intervals: c.intervals?.length ? c.intervals.map((iv) => portalInterval(iv, zones)) : undefined,
  };
}

/** A week's sessions in programming order, projected for the client. */
export function portalSessions(
  sessions: readonly ProgramSession[],
  maxes: OneRepMaxes | null | undefined,
  logOf: (sessionId: string) => PortalSessionLog | null,
  loads: PortalLoadContext = {}
): PortalSession[] {
  return sessionsInSeqOrder(sessions).map((s) => portalSession(s, maxes, logOf(s.id), loads));
}

/** The latest log per program session (by date, then creation). A skipped cardio log says so. */
export function latestLogBySession<
  L extends {
    id: string;
    programSessionId: string | null;
    date: string;
    loggedBy: LoggedBy;
    createdAt?: string | Date;
    cardio?: { skipped?: unknown } | null;
  }
>(logs: readonly L[]): Map<string, PortalSessionLog> {
  const out = new Map<string, PortalSessionLog & { at: string }>();
  for (const l of logs) {
    if (!l.programSessionId) continue;
    const at = `${l.date}|${l.createdAt instanceof Date ? l.createdAt.toISOString() : (l.createdAt ?? "")}`;
    const prev = out.get(l.programSessionId);
    const skipped = l.cardio?.skipped != null ? { skipped: true } : {};
    if (!prev || at > prev.at) out.set(l.programSessionId, { id: l.id, loggedBy: l.loggedBy, date: l.date, ...skipped, at });
  }
  return new Map([...out].map(([k, { at: _at, ...v }]) => [k, v]));
}

/** First day of block week `week` given the block anchor day. */
export function blockWeekStart(anchor: string, week: number): string {
  return addDays(anchor, (week - 1) * 7);
}

// ---------------------------------------------------------------------------
// Progress tab: this week's cardio, recent cardio logs, one VO₂max trend
// ---------------------------------------------------------------------------

/** One of the client's recent cardio logs, picked by name. */
export const PortalCardioLog = z.object({
  id: z.string(),
  date: z.string(),
  modality: z.string(),
  durationSec: z.number().int().nullable(),
  distanceKm: z.number().nullable(),
  rpe: z.number().nullable(),
  /** Session RPE × minutes (AU); null without both, or when skipped. */
  load: z.number().int().nullable(),
  avgHr: z.number().int().nullable(),
  maxHr: z.number().int().nullable(),
  skipped: z.boolean(),
  loggedBy: LoggedBy,
  trainerFeedback: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});
export type PortalCardioLog = z.infer<typeof PortalCardioLog>;

export const PortalProgressDto = z.object({
  week: z.object({
    minutes: z.number(),
    sessions: z.number().int(),
    load: z.number(),
    /** Per modality; distance is never summed across modalities. */
    byModality: z.record(z.string(), z.object({ minutes: z.number(), sessions: z.number().int(), load: z.number(), distanceKm: z.number() })),
  }),
  /** Null when the coach set no weekly target. */
  target: PortalCardio.nullable(),
  recent: z.array(PortalCardioLog),
  vo2: z.object({
    /** Protocols the client has results for, newest test first. */
    protocols: z.array(Vo2Protocol),
    protocol: Vo2Protocol.nullable(),
    points: z.array(z.object({ testedOn: z.string(), value: z.number() })),
  }),
});
export type PortalProgressDto = z.infer<typeof PortalProgressDto>;

/** A stored cardio log row → what the progress tab shows. */
export function portalCardioLog(row: {
  id: string;
  date: string;
  cardio: CardioLog | null;
  loggedBy: LoggedBy;
  trainerFeedback?: string | null;
  reviewedAt?: Date | string | null;
}): PortalCardioLog {
  const c = row.cardio;
  return {
    id: row.id,
    date: row.date,
    modality: c?.modality ?? "Cardio",
    durationSec: cardioLogSec(c),
    distanceKm: c?.distanceKm ?? null,
    rpe: c?.rpe ?? null,
    load: sessionLoad(c),
    avgHr: c?.avgHr ?? null,
    maxHr: c?.maxHr ?? null,
    skipped: c?.skipped != null,
    loggedBy: row.loggedBy,
    trainerFeedback: row.trainerFeedback ?? null,
    reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : (row.reviewedAt ?? null),
  };
}
