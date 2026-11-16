import { z } from "zod";
import {
  CardioLog,
  CardioPrescription,
  LoggedBy,
  Readiness,
  SessionFlag,
  SessionKind,
  SetType,
  sessionsInSeqOrder,
  type OneRepMaxes,
  type Phasing,
  type ProgramSession,
} from "./domain";
import { oneRepMaxKg, resolveLoadKg } from "./load";
import { addDays } from "./importHistory";

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
});
export type PortalLogEntry = z.infer<typeof PortalLogEntry>;

/** The log on a session, for its done state. */
export const PortalSessionLog = z.object({
  id: z.string(),
  loggedBy: LoggedBy,
  date: z.string(),
  /** Only on the client's own log: what they entered. A coach's log never carries it. */
  entry: PortalLogEntry.optional(),
});
export type PortalSessionLog = z.infer<typeof PortalSessionLog>;

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
  cardio: CardioPrescription.nullable(),
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

/** `GET /v1/portal/week`: the active program's current and (when planned) next week. */
export const PortalWeekDto = z.object({
  program: z.object({ id: z.string(), name: z.string() }).nullable(),
  currentWeek: z.number().int().nullable(),
  weeks: z.array(PortalWeek),
});
export type PortalWeekDto = z.infer<typeof PortalWeekDto>;

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
  };
}

/** What the projection knows beyond the program: equipment and the client's last loads. */
export interface PortalLoadContext {
  isBodyweight?: (exerciseId: string) => boolean;
  lastWeights?: LastWeights;
  lastSets?: LastSets;
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
    kind: s.kind ?? "lifting",
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
    cardio: s.cardio
      ? {
          modality: s.cardio.modality,
          durationMin: opt(s.cardio.durationMin),
          hrZone: opt(s.cardio.hrZone),
          intensity: opt(s.cardio.intensity),
          distanceKm: opt(s.cardio.distanceKm),
          targetRpe: opt(s.cardio.targetRpe),
        }
      : null,
    log,
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

/** The latest log per program session (by date, then creation). */
export function latestLogBySession<
  L extends { id: string; programSessionId: string | null; date: string; loggedBy: LoggedBy; createdAt?: string | Date }
>(logs: readonly L[]): Map<string, PortalSessionLog> {
  const out = new Map<string, PortalSessionLog & { at: string }>();
  for (const l of logs) {
    if (!l.programSessionId) continue;
    const at = `${l.date}|${l.createdAt instanceof Date ? l.createdAt.toISOString() : (l.createdAt ?? "")}`;
    const prev = out.get(l.programSessionId);
    if (!prev || at > prev.at) out.set(l.programSessionId, { id: l.id, loggedBy: l.loggedBy, date: l.date, at });
  }
  return new Map([...out].map(([k, { at: _at, ...v }]) => [k, v]));
}

/** First day of block week `week` given the block anchor day. */
export function blockWeekStart(anchor: string, week: number): string {
  return addDays(anchor, (week - 1) * 7);
}
