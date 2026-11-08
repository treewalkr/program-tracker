import { Elysia, t } from "elysia";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, clients, sessionLogs, setLogs, exercises, programs } from "@pt/db";
import { CardioLog, SessionKind, SetType } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { buildHistory } from "../lib/history";
import { loadLogPrograms, queueSignalsForOutbox, timedIdsOf, timedSlotIdsOf } from "../lib/signals-service";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

/** Write boundary for a full session log: session + sets in one payload.
 *  Same four cardio rules as the shared SessionLog (domain.ts). */
const SessionLogInput = z
  .object({
    clientId: z.string().uuid(),
    programId: z.string().uuid(),
    programSessionId: z.string().uuid().nullable().optional(),
    date: IsoDate,
    kind: SessionKind.default("lifting"),
    cardio: CardioLog.nullable().optional(),
    notes: z.string().max(2000).optional(),
    perceivedEnergy: z.number().int().min(1).max(10).optional(),
    sets: z
      .array(
        z.object({
          programExerciseId: z.string().uuid().nullable().optional(),
          exerciseId: z.string().uuid(),
          setNumber: z.number().int().min(1).max(20),
          type: SetType.default("working"),
          weightKg: z.number().min(0).max(600).optional(),
          reps: z.number().int().min(0).max(200),
          rpe: z.number().min(1).max(10).optional(),
        })
      )
      .max(100),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "lifting") {
      if (val.sets.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting log requires at least 1 set",
          path: ["sets"],
        });
      }
      if (val.cardio != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting log must not have cardio payload",
          path: ["cardio"],
        });
      }
    } else if (val.kind === "cardio") {
      if (val.cardio == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio log requires cardio payload",
          path: ["cardio"],
        });
      }
      if (val.sets.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio log must not have sets",
          path: ["sets"],
        });
      }
    }
  });

/** numeric columns come back as strings — convert to numbers at the API boundary. */
function serializeSets(rows: typeof setLogs.$inferSelect[]) {
  return rows.map((s) => ({
    ...s,
    weightKg: s.weightKg != null ? Number(s.weightKg) : null,
    rpe: s.rpe != null ? Number(s.rpe) : null,
  }));
}

/** Logs carry no trainer_id — scope them through the trainer's clients. */
const ofTrainer = (trainerId: string) =>
  inArray(sessionLogs.clientId, db.select({ id: clients.id }).from(clients).where(eq(clients.trainerId, trainerId)));

async function loadSessionWithSets(trainerId: string, clientId?: string, from?: string, to?: string, programId?: string) {
  const conds = [ofTrainer(trainerId)];
  if (clientId) conds.push(eq(sessionLogs.clientId, clientId));
  if (programId) conds.push(eq(sessionLogs.programId, programId));
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
  const byLog = serializeSets(sets);
  return logs.map((l) => ({ ...l, sets: byLog.filter((s) => s.sessionLogId === l.id) }));
}

export const logRoutes = new Elysia({ prefix: "/v1/logs", tags: ["logs"] })
  .use(trainerContext)
  /** Log a completed session on behalf of a client (trainer-entered in MVP). */
  .post(
    "/sessions",
    async ({ body, status, trainerId }) => {
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
      if (exerciseIds.length > 0) {
        const known = await db.select().from(exercises).where(inArray(exercises.id, exerciseIds));
        // A swap may pick any exercise — but only from this trainer's catalog (seed or own).
        const knownIds = new Set(
          known.filter((e) => e.trainerId === null || e.trainerId === trainerId).map((e) => e.id)
        );
        const missing = exerciseIds.filter((id) => !knownIds.has(id));
        if (missing.length) return status(422, { error: "unknown exercises", ids: missing });
      }

      const [log] = await db
        .insert(sessionLogs)
        .values({
          clientId: input.clientId,
          programId: input.programId,
          programSessionId: input.programSessionId ?? null,
          date: input.date,
          kind: input.kind,
          cardio: input.cardio ?? null,
          notes: input.notes ?? null,
          perceivedEnergy: input.perceivedEnergy ?? null,
        })
        .returning();

      // Cardio logs carry no sets — drizzle `.values([])` throws, so insert only with rows.
      const insertedSets =
        input.sets.length > 0
          ? await db
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
              .returning()
          : [];

      // Write path: the log is committed — queue any new signals for the outbox.
      // A queueing failure must not fail the already-committed log write.
      await queueSignalsForOutbox(program.trainerId, input.clientId).catch((err) =>
        console.error("signal outbox queue failed:", err)
      );

      return status(201, { ...log, sets: serializeSets(insertedSets) });
    },
    { body: t.Any() }
  )
  .get(
    "/sessions",
    async ({ query, trainerId }) =>
      loadSessionWithSets(trainerId, query.clientId, query.from, query.to, query.programId),
    {
      query: t.Object({
        clientId: t.Optional(t.String()),
        /** Only this program's logs — the program page shows them per session. */
        programId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )
  /** Per-exercise history — same shape the AI prompt consumes. */
  .get(
    "/history",
    async ({ query, status, trainerId }) => {
      const since = new Date(Date.now() - 56 * 86400_000).toISOString().slice(0, 10);
      const conds = [ofTrainer(trainerId), gte(sessionLogs.date, since)];
      if (query.clientId) conds.push(eq(sessionLogs.clientId, query.clientId));
      const logs = await db.select().from(sessionLogs).where(and(...conds));
      if (logs.length === 0) return { history: [] };
      const sets = await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)));

      const catalog = (await db.select().from(exercises)).filter(
        (e) => e.trainerId === null || e.trainerId === trainerId
      );

      const logPrograms = await loadLogPrograms(logs);
      return {
        history: buildHistory({
          logs,
          sets,
          catalog: catalog.map((e) => ({ id: e.id, name: e.name })),
          timedExerciseIds: timedIdsOf(logPrograms),
          timedSlotIds: timedSlotIdsOf(logPrograms),
        }),
      };
    },
    { query: t.Object({ clientId: t.Optional(t.String()) }) }
  );
