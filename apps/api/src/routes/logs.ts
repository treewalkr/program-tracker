import { Elysia, t } from "elysia";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, clients, sessionLogs, setLogs, exercises } from "@pt/db";
import { trainerContext } from "../lib/trainer-context";
import { buildHistory } from "../lib/history";
import { createSessionLog, deleteSessionLog, SessionLogInput, serializeSets } from "../lib/log-service";
import { loadLogPrograms, timedIdsOf, timedSlotIdsOf } from "../lib/signals-service";
import { LogModel } from "../models/logs";
import { ErrorBody } from "../models/shared";

/** Logs carry no trainer_id — scope them through the trainer's clients. */
const ofTrainer = (trainerId: string) =>
  inArray(sessionLogs.clientId, db.select({ id: clients.id }).from(clients).where(eq(clients.trainerId, trainerId)));

async function loadSessionWithSets(
  trainerId: string,
  clientId?: string,
  from?: string,
  to?: string,
  programId?: string,
  limit = 200
) {
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
    .limit(limit);
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
      const result = await createSessionLog({ trainerId, input: parsed.data });
      switch (result.outcome) {
        case "program_not_found":
          return status(404, { error: "program not found" });
        case "program_mismatch":
          return status(422, { error: "program does not belong to client" });
        case "unknown_exercises":
          return status(422, { error: "unknown exercises", ids: result.ids });
        case "conflict":
          return status(409, { error: "already logged", existing: result.existing });
      }
      return status(201, { ...result.log, sets: result.sets, replaced: result.replaced });
    },
    { body: t.Any() }
  )
  /** Remove a log (Undo after save). Its sets go by cascade. */
  .delete(
    "/sessions/:id",
    async ({ params, status, trainerId }) => {
      const deleted = await deleteSessionLog(trainerId, and(eq(sessionLogs.id, params.id), ofTrainer(trainerId)));
      if (!deleted) return status(404, { error: "log not found" });
      return status(204);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  /** Coach review: stamp (or clear) reviewed, and set the feedback the member sees in the portal. */
  .patch(
    "/sessions/:id/review",
    async ({ params, body, status, trainerId }) => {
      const feedback = body.feedback === undefined ? {} : { trainerFeedback: body.feedback?.trim() ? body.feedback.trim() : null };
      const [row] = await db
        .update(sessionLogs)
        .set({
          reviewedAt: body.reviewed ? new Date() : null,
          reviewedBy: body.reviewed ? trainerId : null,
          ...feedback,
        })
        .where(and(eq(sessionLogs.id, params.id), ofTrainer(trainerId)))
        .returning({
          id: sessionLogs.id,
          reviewedAt: sessionLogs.reviewedAt,
          reviewedBy: sessionLogs.reviewedBy,
          trainerFeedback: sessionLogs.trainerFeedback,
        });
      if (!row) return status(404, { error: "log not found" });
      return row;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: LogModel.review,
      response: { 200: LogModel.reviewed, 404: ErrorBody, 422: ErrorBody },
      detail: { summary: "Review a session log and leave feedback for the member" },
    }
  )
  .get(
    "/sessions",
    async ({ query, trainerId }) =>
      loadSessionWithSets(trainerId, query.clientId, query.from, query.to, query.programId, query.limit),
    {
      query: t.Object({
        clientId: t.Optional(t.String()),
        /** Only this program's logs — the program page shows them per session. */
        programId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        /** Newest N logs — the client History tab's "All" range asks for up to 1000. */
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 1000, default: 200 })),
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
