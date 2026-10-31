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
  weekOf,
} from "@pt/shared";
import { ContextError } from "../ai/runtime";
import { periodizationContext, type ExampleProgramSummary } from "../ai/prompt";
import { buildHistory } from "./history";
import { ensureSeededChains } from "./chains";
import { toSignalLog, toSignalProgram } from "./signals-service";

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
      const targetSessions = targetWeekObj ? targetWeekObj.days.flatMap((d) => d.sessions) : [];
      previous = {
        name: p.name,
        sessions: targetSessions.map((s) => ({
          name: s.name,
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
    .where(and(eq(sessionLogs.clientId, clientId), gte(sessionLogs.date, since)));
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
  const totalWorkingSets = sets.filter((s) => s.type === "working").length;
  const chainBalance = totalWorkingSets === 0 ? null : chainBalanceText(chains, counts);

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
  // by goal-word overlap + days/week proximity, capped at 2 positive matches.
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
    { goals: client.goals, daysPerWeek: client.daysPerWeek },
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
        sessions: firstWeek.days.flatMap((d) => d.sessions).map((s) => ({
          name: s.name,
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
      daysPerWeek: client.daysPerWeek,
      cardioTarget: client.cardioTarget ?? null,
    },
    previousProgram: previous,
    periodization,
    chainBalance,
    examples,
    programDirection: basedOnProgram?.direction ?? null,
    learnedPreferences: combinePreferenceDocs(trainerDoc, clientDoc),
    history: buildHistory({
      logs,
      sets,
      catalog: catalogByTrainer.map((e) => ({ id: e.id, name: e.name })),
    }),
    catalog: catalogByTrainer.map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment,
      movementPattern: e.movementPattern,
      functionalMovement: e.functionalMovement,
    })),
  };
}
