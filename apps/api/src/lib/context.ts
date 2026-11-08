import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  clients,
  exercises,
  programExamples,
  programs,
  sessionLogs,
  setLogs,
  trainerPreferences,
} from "@pt/db";
import {
  blockPulse,
  chainBalanceText,
  chainSetCounts,
  combinePreferenceDocs,
  pulseSummary,
  selectExamples,
  sessionsInSeqOrder,
  weekOf,
} from "@pt/shared";
import { ContextError } from "../ai/runtime";
import { periodizationContext, type ExampleProgramSummary } from "../ai/prompt";
import { buildHistory, renderTrainingLog, sessionLabelsFor } from "./history";
import { ensureSeededChains } from "./chains";
import { ensureSessionTypes } from "./session-types";
import { loadLogPrograms, timedIdsOf, timedSlotIdsOf, toSignalLog, toSignalProgram } from "./signals-service";
import { loadActiveRules } from "./coaching-rules";

export const HISTORY_WINDOW_DAYS = 56;

export async function loadContext(
  trainerId: string,
  clientId: string,
  basedOnProgramId: string | null,
  focus?: { focusWeek: number }
) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new ContextError(404, "client not found");

  const catalog = await db.select().from(exercises);
  const catalogByTrainer = catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId);

  let previous = null;
  let basedOnProgram = null;
  if (basedOnProgramId) {
    const [p] = await db.select().from(programs).where(eq(programs.id, basedOnProgramId));
    if (p) {
      basedOnProgram = p;
      const nameById = new Map(catalogByTrainer.map((e) => [e.id, e.name]));
      const targetWeekObj = focus?.focusWeek
        ? p.sessions.find((w) => w.week === focus.focusWeek) ?? p.sessions[p.sessions.length - 1]
        : p.sessions[p.sessions.length - 1];
      const targetSessions = targetWeekObj ? sessionsInSeqOrder(targetWeekObj.sessions) : [];
      previous = {
        name: p.name,
        sessions: targetSessions.map((s) => ({
          name: s.name,
          kind: s.kind,
          exercises: s.exercises.map((e) => ({
            name: nameById.get(e.exerciseId) ?? e.exerciseId,
            role: e.role,
            sets: e.prescribedSets.map(
              (ps) =>
                `${ps.reps}${ps.amrap ? "+" : ""} reps${ps.targetRpe ? ` @ RPE ${ps.targetRpe}` : ""}`
            ),
          })),
        })),
      };
    }
  }

  const since = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const logs = await db
    .select()
    .from(sessionLogs)
    .where(and(eq(sessionLogs.clientId, clientId), gte(sessionLogs.date, since)))
    .orderBy(desc(sessionLogs.date), desc(sessionLogs.createdAt));
  const sets = logs.length
    ? await db.select().from(setLogs).where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)))
    : [];

  const chains = await ensureSeededChains(trainerId);
  const structuredLogs = logs.map((l) => ({
    date: l.date,
    sets: sets
      .filter((s) => s.sessionLogId === l.id)
      .map((s) => ({ exerciseId: s.exerciseId, type: s.type })),
  }));
  const counts = chainSetCounts(chains, structuredLogs, catalogByTrainer, since);
  const chainBalance = sets.length === 0 ? null : chainBalanceText(chains, counts);

  // Auto-injected periodization context — derived, never trainer-editable.
  let periodization: string | null = null;
  if (basedOnProgram?.phasing) {
    const ph = basedOnProgram.phasing;
    const signalLogs = logs.map((l) =>
      toSignalLog(l, sets.filter((s) => s.sessionLogId === l.id))
    );
    const program = toSignalProgram(basedOnProgram);
    const week = focus?.focusWeek ? focus.focusWeek + 1 : weekOf(program, signalLogs);
    const summary = pulseSummary(blockPulse(program, signalLogs));
    periodization = periodizationContext(ph, week, summary);
  }

  const logPrograms = await loadLogPrograms(logs);
  const timedExerciseIds = timedIdsOf(logPrograms);
  const timedSlotIds = timedSlotIdsOf(logPrograms);
  const catalogForHistory = catalogByTrainer.map((e) => ({ id: e.id, name: e.name }));

  const prefRows = await db
    .select()
    .from(trainerPreferences)
    .where(eq(trainerPreferences.trainerId, trainerId));

  const trainerDoc = prefRows
    .filter((r) => r.clientId === null)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.document ?? null;
  const clientDoc = prefRows
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.document ?? null;

  // Gold-standard few-shot retrieval — the trainer's example library, ranked
  // by goal-word overlap + sessions/week proximity, capped at 2 positive matches.
  const exampleRows = await db
    .select({ example: programExamples, program: programs })
    .from(programExamples)
    .innerJoin(programs, eq(programExamples.programId, programs.id))
    .where(eq(programExamples.trainerId, trainerId))
    .orderBy(desc(programExamples.createdAt));
  const matched = selectExamples(
    exampleRows.map(({ example, program }) => ({
      programId: program.id,
      goal: example.goal,
      level: example.level,
      daysPerWeek: example.daysPerWeek,
      createdAt: example.createdAt,
    })),
    { goals: client.goals, daysPerWeek: client.sessionsPerWeek },
    { excludeProgramId: basedOnProgramId, limit: 2 },
  );
  const examples: ExampleProgramSummary[] = matched.flatMap((m) => {
    const row = exampleRows.find((r) => r.program.id === m.programId);
    if (!row) return [];
    const firstWeek = row.program.sessions[0];
    return [
      {
        programId: row.program.id,
        name: row.program.name,
        goal: m.goal,
        level: m.level,
        daysPerWeek: m.daysPerWeek,
        sessions: sessionsInSeqOrder(firstWeek.sessions).map((s) => ({
          name: s.name,
          kind: s.kind,
          exercises: s.exercises.map((e) => ({
            name: e.exerciseName ?? e.exerciseId,
            role: e.role,
            sets: e.prescribedSets.map(
              (ps) => `${ps.reps}${ps.amrap ? "+" : ""} reps${ps.targetRpe ? ` @ RPE ${ps.targetRpe}` : ""}`
            ),
          })),
        })),
      },
    ];
  });

  return {
    client: {
      name: client.name,
      goals: client.goals,
      limitations: client.limitations,
      sessionsPerWeek: client.sessionsPerWeek,
      trainingDays: client.trainingDays ?? null,
      cardioDays: client.cardioDays ?? null,
      longRunDay: client.longRunDay ?? null,
      oneRepMaxes: Object.entries(client.oneRepMaxes ?? {}).map(([exerciseId, m]) => ({
        exerciseId,
        name: catalogByTrainer.find((e) => e.id === exerciseId)?.name ?? exerciseId,
        kg: m.kg,
        date: m.date,
      })),
      cardioTarget: client.cardioTarget ?? null,
    },
    previousProgram: previous,
    periodization,
    chainBalance,
    examples,
    programDirection: basedOnProgram?.direction ?? null,
    learnedPreferences: combinePreferenceDocs(trainerDoc, clientDoc),
    // Trainer-confirmed rules only (proposed/retired never reach a prompt).
    coachingRules: await loadActiveRules(trainerId, clientId),
    history: buildHistory({ logs, sets, catalog: catalogForHistory, timedExerciseIds, timedSlotIds }),
    // Dated, per-session, every set + cardio — what the prompts actually render (F11).
    trainingLog: renderTrainingLog({
      logs,
      sets,
      catalog: catalogForHistory,
      timedExerciseIds,
      timedSlotIds,
      sessionLabels: sessionLabelsFor(logPrograms),
    }),
    // Archived types stay on old sessions but are never offered to the AI.
    sessionTypes: (await ensureSessionTypes(trainerId))
      .filter((t) => t.archivedAt === null)
      .map((t) => ({ name: t.name, format: t.format })),
    // Archived/hidden exercises stay resolvable by id but are never offered to the AI.
    catalog: catalogByTrainer.filter((e) => e.archivedAt === null).map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment,
      movementPattern: e.movementPattern,
      functionalMovement: e.functionalMovement,
      note: e.note,
    })),
  };
}
