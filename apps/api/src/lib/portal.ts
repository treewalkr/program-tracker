import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { clients, db, exercises, programs, sessionLogs, setLogs, type ProgramRow } from "@pt/db";
import {
  addDays,
  blockAnchorDate,
  blockWeekStart,
  lastSetsOf,
  lastWeightsOf,
  loadStep,
  isoWeekStart,
  latestLogBySession,
  localDateOf,
  portalLogEntry,
  portalCardio,
  portalSessions,
  portalWeekLabel,
  weekOf,
  weekSessions,
  type CardioTarget,
  type Equipment,
  type PortalSessionLog,
  type PortalWeek,
  type PortalWeekDto,
} from "@pt/shared";
import { withExerciseNames } from "./exercise-names";
import { toSignalProgram } from "./signals-service";

/**
 * What the portal shows: the client's active program, this block week and
 * the next. Drafts and archived programs never reach a client.
 */

/** The client's active program (the latest activated when there are several). */
export async function activeProgramOf(clientId: string): Promise<ProgramRow | null> {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.clientId, clientId), eq(programs.status, "active")))
    .orderBy(desc(programs.activatedAt), desc(programs.createdAt))
    .limit(1);
  return row ?? null;
}

export interface PortalWeekContext {
  program: ProgramRow;
  currentWeek: number;
  /** First and last day of the current block week. */
  startDate: string;
  endDate: string;
  /** False while today is before Week 1's start (a future start date): nothing is loggable yet. */
  started: boolean;
  /** Program session ids planned in the current week. */
  currentSessionIds: Set<string>;
}

/** Block-week math for the active program — the same anchor as signals and the client page. */
export async function portalWeekContext(clientId: string, now = Date.now()): Promise<PortalWeekContext | null> {
  const program = await activeProgramOf(clientId);
  if (!program) return null;
  const logs = await db.select({ date: sessionLogs.date }).from(sessionLogs).where(eq(sessionLogs.programId, program.id));
  const signalLogs = logs.map((l) => ({ programId: program.id, date: l.date, sets: [] }));
  const sp = toSignalProgram(program);
  const currentWeek = weekOf(sp, signalLogs, now);
  const startDate = blockWeekStart(blockAnchorDate(sp, signalLogs).slice(0, 10), currentWeek);
  return {
    program,
    currentWeek,
    startDate,
    endDate: addDays(startDate, 6),
    started: localDateOf(now) >= startDate,
    currentSessionIds: new Set(weekSessions(program.sessions, currentWeek).map((s) => s.id)),
  };
}

/** `GET /v1/portal/week` — current + next week, projected through the client-safe allow-list. */
export async function loadPortalWeek(clientId: string, now = Date.now()): Promise<PortalWeekDto> {
  const ctx = await portalWeekContext(clientId, now);
  if (!ctx) return { program: null, currentWeek: null, weeks: [] };
  const { program, currentWeek, startDate, started } = ctx;
  const [client] = await db
    .select({ oneRepMaxes: clients.oneRepMaxes, cardioTarget: clients.cardioTarget })
    .from(clients)
    .where(eq(clients.id, clientId));
  const logs = await db
    .select({
      id: sessionLogs.id,
      programSessionId: sessionLogs.programSessionId,
      date: sessionLogs.date,
      loggedBy: sessionLogs.loggedBy,
      createdAt: sessionLogs.createdAt,
    })
    .from(sessionLogs)
    .where(and(eq(sessionLogs.clientId, clientId), eq(sessionLogs.programId, program.id)));
  const done = await withClientEntries(latestLogBySession(logs));
  const loads = await loadContext(clientId, program, startDate);

  const weeks: PortalWeek[] = [];
  for (const week of [currentWeek, currentWeek + 1]) {
    const doc = program.sessions.find((w) => w.week === week);
    // next week shows only once it's planned; the current week always shows (possibly empty)
    if (!doc && week !== currentWeek) continue;
    const named = doc ? await withExerciseNames(doc) : null;
    const start = week === currentWeek ? startDate : addDays(startDate, 7);
    weeks.push({
      week,
      startDate: start,
      endDate: addDays(start, 6),
      loggable: week === currentWeek && started,
      weekLabel: portalWeekLabel(program.phasing, week),
      sessions: named
        ? portalSessions(named.sessions, client?.oneRepMaxes ?? null, (id) => (week === currentWeek ? (done.get(id) ?? null) : null), loads)
        : [],
    });
  }
  return { program: { id: program.id, name: program.name, startsOn: program.startsOn ?? null }, currentWeek, weeks, cardio: await cardioThisWeek(clientId, client?.cardioTarget ?? null, now) };
}

/** This ISO week's cardio against the coach's target — any program, as the coach's pace check counts it. */
async function cardioThisWeek(clientId: string, target: CardioTarget | null, now: number) {
  if (!target) return null;
  const logs = await db
    .select({ date: sessionLogs.date, kind: sessionLogs.kind, cardio: sessionLogs.cardio })
    .from(sessionLogs)
    .where(and(eq(sessionLogs.clientId, clientId), eq(sessionLogs.kind, "cardio"), gte(sessionLogs.date, isoWeekStart(new Date(now)))));
  return portalCardio(target, logs, now);
}

/** The client's own logs get what they entered (sets, cardio, readiness, flags, notes); a coach's log stays bare. */
async function withClientEntries(done: Map<string, PortalSessionLog>): Promise<Map<string, PortalSessionLog>> {
  const ids = [...done.values()].filter((l) => l.loggedBy === "client").map((l) => l.id);
  if (ids.length === 0) return done;
  const [rows, sets] = await Promise.all([
    db.select().from(sessionLogs).where(inArray(sessionLogs.id, ids)),
    db.select().from(setLogs).where(inArray(setLogs.sessionLogId, ids)),
  ]);
  const out = new Map(done);
  for (const [sessionId, log] of done) {
    const row = rows.find((r) => r.id === log.id);
    if (!row || row.loggedBy !== "client") continue;
    out.set(sessionId, { ...log, entry: portalLogEntry(row, sets.filter((s) => s.sessionLogId === log.id)) });
  }
  return out;
}

/** Which exercises are bodyweight, the client's last kg per exercise and set, and their
 *  sets from before this week for the "Last:" line (any program). */
async function loadContext(clientId: string, program: ProgramRow, weekStart: string) {
  // only catalog ids can be looked up; anything else is simply not bodyweight and has no history
  const ids = [...new Set(program.sessions.flatMap((w) => w.sessions.flatMap((s) => (s.exercises ?? []).map((e) => e.exerciseId))))].filter((id) =>
    UUID.test(id),
  );
  const equipment = ids.length
    ? await db.select({ id: exercises.id, equipment: exercises.equipment }).from(exercises).where(inArray(exercises.id, ids))
    : [];
  // takes no load (bodyweight, band): a set with no kg is complete
  const bodyweight = new Set(equipment.filter((e) => loadStep(e.equipment as Equipment) === null).map((e) => e.id));
  const rows = ids.length
    ? await db
        .select({
          date: sessionLogs.date,
          exerciseId: setLogs.exerciseId,
          setNumber: setLogs.setNumber,
          weightKg: setLogs.weightKg,
          reps: setLogs.reps,
          rpe: setLogs.rpe,
        })
        .from(setLogs)
        .innerJoin(sessionLogs, eq(setLogs.sessionLogId, sessionLogs.id))
        .where(and(eq(sessionLogs.clientId, clientId), inArray(setLogs.exerciseId, ids)))
    : [];
  const logs = rows.map((r) => ({ date: r.date, sets: [r] }));
  return {
    isBodyweight: (id: string) => bodyweight.has(id),
    lastWeights: lastWeightsOf(logs),
    lastSets: lastSetsOf(logs, weekStart),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
