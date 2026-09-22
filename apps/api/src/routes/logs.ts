import { Elysia, t } from "elysia";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, sessionLogs, setLogs, exercises, programs } from "@pt/db";
import { getDefaultTrainerId } from "../lib/trainer";
import { buildHistory } from "../lib/history";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

/** Write boundary for a full session log: session + sets in one payload. */
const SessionLogInput = z.object({
  clientId: z.string().uuid(),
  programId: z.string().uuid(),
  programSessionId: z.string().uuid().nullable().optional(),
  date: IsoDate,
  notes: z.string().max(2000).optional(),
  perceivedEnergy: z.number().int().min(1).max(10).optional(),
  sets: z
    .array(
      z.object({
        programExerciseId: z.string().uuid().nullable().optional(),
        exerciseId: z.string().uuid(),
        setNumber: z.number().int().min(1).max(20),
        type: z.enum(["warm_up", "working", "backoff"]).default("working"),
        weightKg: z.number().min(0).max(600).optional(),
        reps: z.number().int().min(0).max(200),
        rpe: z.number().min(1).max(10).optional(),
      })
    )
    .min(1)
    .max(100),
});

async function loadSessionWithSets(clientId?: string, from?: string, to?: string) {
  const conds = [];
  if (clientId) conds.push(eq(sessionLogs.clientId, clientId));
  if (from) conds.push(gte(sessionLogs.date, from));
  if (to) conds.push(lte(sessionLogs.date, to));
  const logs = await db
    .select()
    .from(sessionLogs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sessionLogs.date))
    .limit(200);
  const sets = logs.length
    ? await db.select().from(setLogs).where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)))
    : [];
  return logs.map((l) => ({ ...l, sets: sets.filter((s) => s.sessionLogId === l.id) }));
}

export const logRoutes = new Elysia({ prefix: "/v1/logs" })
  /** Log a completed session on behalf of a client (trainer-entered in MVP). */
  .post(
    "/sessions",
    async ({ body, status }) => {
      const parsed = SessionLogInput.safeParse(body);
      if (!parsed.success) {
        return status(422, { error: "invalid log", issues: z.treeifyError(parsed.error) });
      }
      const input = parsed.data;

      const [program] = await db.select().from(programs).where(eq(programs.id, input.programId));
      if (!program) return status(404, { error: "program not found" });
      if (program.clientId !== input.clientId) {
        return status(422, { error: "program does not belong to client" });
      }

      const exerciseIds = [...new Set(input.sets.map((s) => s.exerciseId))];
      const known = await db.select().from(exercises).where(inArray(exercises.id, exerciseIds));
      const knownIds = new Set(known.map((e) => e.id));
      const missing = exerciseIds.filter((id) => !knownIds.has(id));
      if (missing.length) return status(422, { error: "unknown exercises", ids: missing });

      const [log] = await db
        .insert(sessionLogs)
        .values({
          clientId: input.clientId,
          programId: input.programId,
          programSessionId: input.programSessionId ?? null,
          date: input.date,
          notes: input.notes ?? null,
          perceivedEnergy: input.perceivedEnergy ?? null,
        })
        .returning();

      const insertedSets = await db
        .insert(setLogs)
        .values(
          input.sets.map((s) => ({
            sessionLogId: log.id,
            programExerciseId: s.programExerciseId ?? null,
            exerciseId: s.exerciseId,
            setNumber: s.setNumber,
            type: s.type,
            weightKg: s.weightKg !== undefined ? String(s.weightKg) : null,
            reps: s.reps,
            rpe: s.rpe !== undefined ? String(s.rpe) : null,
          }))
        )
        .returning();

      return status(201, { ...log, sets: insertedSets });
    },
    { body: t.Any() }
  )
  .get(
    "/sessions",
    async ({ query }) => loadSessionWithSets(query.clientId, query.from, query.to),
    {
      query: t.Object({
        clientId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )
  /** Per-exercise history — same shape the AI prompt consumes. */
  .get(
    "/history",
    async ({ query, status }) => {
      const since = new Date(Date.now() - 56 * 86400_000).toISOString().slice(0, 10);
      const conds = [gte(sessionLogs.date, since)];
      if (query.clientId) conds.push(eq(sessionLogs.clientId, query.clientId));
      const logs = await db.select().from(sessionLogs).where(and(...conds));
      if (logs.length === 0) return { history: [] };
      const sets = await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)));

      const trainerId = await getDefaultTrainerId();
      const catalog = (await db.select().from(exercises)).filter(
        (e) => e.trainerId === null || e.trainerId === trainerId
      );

      return {
        history: buildHistory({
          logs,
          sets,
          catalog: catalog.map((e) => ({ id: e.id, name: e.name })),
        }),
      };
    },
    { query: t.Object({ clientId: t.Optional(t.String()) }) }
  );
