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
import { computeSignals } from "@pt/shared";
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
    sessions: p.sessions,
    activatedAt: p.activatedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    phasing: p.phasing ?? null,
  };
}

/** numeric columns come back as strings — convert at this boundary. */
export function toSignalLog(log: SessionLogRow, sets: SetLogRow[]): SignalLog {
  return {
    programId: log.programId,
    date: log.date,
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
  if (scoped.length === 0) return [];

  const clientIds = [...new Set(scoped.map((p) => p.clientId!))];
  const clientRows = await db.select().from(clients).where(inArray(clients.id, clientIds));
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
  for (const program of scoped) {
    const client = clientRows.find((c) => c.id === program.clientId);
    const programLogs = logRows
      .filter((l) => l.programId === program.id)
      .map((l) => toSignalLog(l, setsByLog.get(l.id) ?? []));
    signals.push(
      ...computeSignals(
        toSignalProgram(program),
        programLogs,
        nameOf,
        client?.daysPerWeek ?? undefined
      )
    );
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
