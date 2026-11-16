import { z } from "zod";
import {
  CardioPrescription,
  LoggedBy,
  SessionKind,
  SetType,
  sessionsInSeqOrder,
  type OneRepMaxes,
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
  prescribedSets: z.array(PortalSet),
});
export type PortalExercise = z.infer<typeof PortalExercise>;

/** The log on a session, for its done state. */
export const PortalSessionLog = z.object({
  id: z.string(),
  loggedBy: LoggedBy,
  date: z.string(),
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

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** What the projection knows beyond the program: equipment and the client's last loads. */
export interface PortalLoadContext {
  isBodyweight?: (exerciseId: string) => boolean;
  lastWeights?: LastWeights;
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
