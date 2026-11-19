import { Elysia, t } from "elysia";
import { z } from "zod";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, clients, sessionLogs, setLogs, exercises } from "@pt/db";
import { trainerContext } from "../lib/trainer-context";
import { buildHistory } from "../lib/history";
import { createSessionLog, deleteSessionLog, loadLogsWithSets, SessionLogInput } from "../lib/log-service";
import { loadLogPrograms, timedIdsOf, timedSlotIdsOf } from "../lib/signals-service";

/** Logs carry no trainer_id — scope them through the trainer's clients. */
const ofTrainer = (trainerId: string) =>
  inArray(sessionLogs.clientId, db.select({ id: clients.id }).from(clients).where(eq(clients.trainerId, trainerId)));

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
  .get(
    "/sessions",
    async ({ query, trainerId }) =>
      loadLogsWithSets({
        scope: ofTrainer(trainerId),
        clientIds: query.clientId ? [query.clientId] : undefined,
        programId: query.programId,
        from: query.from,
        to: query.to,
        limit: query.limit ?? 200,
      }),
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
