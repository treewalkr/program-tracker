import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  clients,
  exercises,
  programs,
  sessionLogs,
  setLogs,
  signalOutbox,
  type ProgramRow,
  type SessionLogRow,
  type SetLogRow,
} from "@pt/db";
import { cardioBehindSignal, computeSignals, deloadRulesText, effectiveDeload, timedExerciseIds, timedSlotIds, weekOf } from "@pt/shared";
import { trainerDeloadSettings } from "./deload";
import type { Signal, SignalLog, SignalProgram } from "@pt/shared";

/**
 * One rule engine, three trigger paths (docs/notifications.md):
 * read path (GET /v1/notifications), write path (log insert → outbox),
 * clock path (L5 cron). All funnel through computeTrainerSignals so the
 * API returns exactly what the mock dashboard computed client-side.
 */

export function toSignalProgram(p: ProgramRow): SignalProgram {
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name,
    status: p.status,
    weeks: p.sessions,
    activatedAt: p.activatedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    phasing: p.phasing ?? null,
  };
}

/** Current block week of a program, anchored like every other block window
 *  (the earlier of activation and the first log) — so weekly generation
 *  targets the same week the signals and the client page show. */
export async function currentBlockWeek(p: ProgramRow, now = Date.now()): Promise<number> {
  const rows = await db
    .select({ date: sessionLogs.date })
    .from(sessionLogs)
    .where(eq(sessionLogs.programId, p.id));
  return weekOf(toSignalProgram(p), rows.map((r) => ({ programId: p.id, date: r.date, sets: [] })), now);
}

/** The programs these logs belong to (deduped). */
export async function loadLogPrograms(logs: { programId: string }[]): Promise<ProgramRow[]> {
  const ids = [...new Set(logs.map((l) => l.programId))];
  if (ids.length === 0) return [];
  return db.select().from(programs).where(inArray(programs.id, ids));
}

/** Union of timed-hold exercises across these programs — history spans
 *  programs, and logged sets carry no duration of their own. */
export function timedIdsOf(rows: ProgramRow[]): Set<string> {
  return new Set(rows.flatMap((p) => [...timedExerciseIds(toSignalProgram(p))]));
}

/** Timed program-exercise slots across these programs (see timedSlotIds). */
export function timedSlotIdsOf(rows: ProgramRow[]): Set<string> {
  return new Set(rows.flatMap((p) => [...timedSlotIds(toSignalProgram(p))]));
}

/** numeric columns come back as strings — convert at this boundary. */
export function toSignalLog(log: SessionLogRow, sets: SetLogRow[]): SignalLog {
  return {
    programId: log.programId,
    date: log.date,
    kind: log.kind,
    cardio: log.cardio ?? null,
    sets: sets.map((s) => ({
      exerciseId: s.exerciseId,
      type: s.type as SignalLog["sets"][number]["type"],
      weightKg: s.weightKg != null ? Number(s.weightKg) : null,
      reps: s.reps,
      rpe: s.rpe != null ? Number(s.rpe) : null,
    })),
  };
}

export async function computeTrainerSignals(
  trainerId: string,
  onlyClientId?: string
): Promise<Signal[]> {
  const active = await db
    .select()
    .from(programs)
    .where(and(eq(programs.trainerId, trainerId), eq(programs.status, "active")));
  const scoped = active.filter((p) => p.clientId && (!onlyClientId || p.clientId === onlyClientId));

  // Cardio targets are a client attribute: clients without an active program
  // still get the cardio pace check (F18).
  const clientRows = (
    await db
      .select()
      .from(clients)
      .where(onlyClientId ? and(eq(clients.trainerId, trainerId), eq(clients.id, onlyClientId)) : eq(clients.trainerId, trainerId))
  ).filter((c) => scoped.some((p) => p.clientId === c.id) || (c.cardioTarget && c.status !== "archived"));
  if (clientRows.length === 0) return [];

  const clientIds = clientRows.map((c) => c.id);
  const logRows = await db.select().from(sessionLogs).where(inArray(sessionLogs.clientId, clientIds));
  const setRows = logRows.length
    ? await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionLogId, logRows.map((l) => l.id)))
    : [];

  const exerciseIds = [...new Set(setRows.map((s) => s.exerciseId))];
  const exerciseRows = exerciseIds.length
    ? await db.select().from(exercises).where(inArray(exercises.id, exerciseIds))
    : [];
  const nameOf = (id: string) => exerciseRows.find((e) => e.id === id)?.name ?? "unknown exercise";

  const setsByLog = new Map<string, SetLogRow[]>();
  for (const s of setRows) {
    const list = setsByLog.get(s.sessionLogId) ?? [];
    list.push(s);
    setsByLog.set(s.sessionLogId, list);
  }

  const signals: Signal[] = [];
  const now = Date.now();
  const myDeload = await trainerDeloadSettings(trainerId);
  for (const client of clientRows) {
    // One active program per client.
    const program = scoped.find((p) => p.clientId === client.id) ?? null;
    const clientLogs = logRows
      .filter((l) => l.clientId === client.id)
      .map((l) => toSignalLog(l, setsByLog.get(l.id) ?? []));
    if (program) {
      signals.push(
        ...computeSignals(
          toSignalProgram(program),
          clientLogs.filter((l) => l.programId === program.id),
          nameOf,
          client.sessionsPerWeek ?? undefined,
          now,
          deloadRulesText(effectiveDeload(myDeload, client.deloadSettings))
        )
      );
    }
    if (client.cardioTarget) {
      const behind = cardioBehindSignal(
        { programId: program?.id ?? null, clientId: client.id },
        client.cardioTarget,
        clientLogs,
        now,
        client.createdAt.toISOString()
      );
      if (behind) signals.push(behind);
    }
  }
  return signals;
}

/** Write path: queue unseen signal ids for the (L5) email dispatcher.
 *  Dedupe = PK conflict — signal ids are deterministic. */
export async function queueSignalsForOutbox(trainerId: string, clientId: string): Promise<void> {
  const signals = await computeTrainerSignals(trainerId, clientId);
  if (signals.length === 0) return;
  await db
    .insert(signalOutbox)
    .values(
      signals.map((s) => ({
        signalId: s.id,
        kind: s.kind,
        payload: {
          title: s.title,
          evidence: s.evidence,
          severity: s.severity,
          programId: s.programId,
          clientId: s.clientId,
        },
      }))
    )
    .onConflictDoNothing({ target: signalOutbox.signalId });
}
