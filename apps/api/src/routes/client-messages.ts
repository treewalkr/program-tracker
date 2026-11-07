import { Elysia, t } from "elysia";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  clientMessages,
  clients,
  exercises,
  programs,
  sessionLogs,
  setLogs,
  type SetLogRow,
} from "@pt/db";
import { AiClientMessageDraft, CLIENT_MESSAGE_MAX_CHARS, weekSummary } from "@pt/shared";
import { callLlm } from "../ai/llm";
import { recordFeedback } from "../lib/llm-feedback";
import { buildClientMessageMessages } from "../ai/prompt";
import { mockClientMessage } from "../ai/mock";
import { ContextError, providerRuntime } from "../ai/runtime";
import { trainerContext } from "../lib/trainer-context";
import { toSignalLog, toSignalProgram } from "../lib/signals-service";

/**
 * Client-facing weekly messages: deterministic stats → AI phrasing → trainer
 * gate (approve/reject) → copy-to-LINE. No delivery integration — the trainer
 * pastes the approved text themselves (Q6: LINE, copy-paste).
 */
export const clientMessageRoutes = new Elysia({ prefix: "/v1/client-messages", tags: ["client-messages"] })
  .use(trainerContext)
  .post(
    "/generate",
    async ({ body, status, trainerId }) => {
      try {
        const [client] = await db.select().from(clients).where(eq(clients.id, body.clientId));
        if (!client) return status(404, { error: "client not found" });

        const [program] = await db.select().from(programs).where(eq(programs.id, body.programId));
        if (!program) return status(404, { error: "program not found" });
        if (program.clientId !== body.clientId) {
          return status(422, { error: "program does not belong to client" });
        }

        const logRows = await db
          .select()
          .from(sessionLogs)
          .where(eq(sessionLogs.clientId, body.clientId));
        const setRows = logRows.length
          ? await db
              .select()
              .from(setLogs)
              .where(inArray(setLogs.sessionLogId, logRows.map((l) => l.id)))
          : [];
        const setsByLog = new Map<string, SetLogRow[]>();
        for (const s of setRows) {
          const list = setsByLog.get(s.sessionLogId) ?? [];
          list.push(s);
          setsByLog.set(s.sessionLogId, list);
        }
        const catalog = await db.select().from(exercises);
        const catalogByTrainer = catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId);

        const stats = weekSummary({
          program: toSignalProgram(program),
          logs: logRows.map((l) => toSignalLog(l, setsByLog.get(l.id) ?? [])),
          week: body.week,
          catalog: catalogByTrainer.map((e) => ({ id: e.id, name: e.name })),
        });
        if (!stats) return status(422, { error: `week ${body.week} has no logged sessions` });

        const rt = providerRuntime(body.providerId ?? "zai", body.model);

        const [row] = await db
          .insert(clientMessages)
          .values({
            trainerId,
            clientId: body.clientId,
            programId: program.id,
            week: body.week,
            providerId: body.providerId ?? "zai",
            model: rt.model,
            status: "pending",
            stats,
          })
          .returning();

        const messages = buildClientMessageMessages({
          clientName: client.name,
          programName: program.name,
          stats,
        });

        // Call + validate, with exactly one retry on validation failure.
        const out = await callLlm({
          purpose: "client_message",
          builder: "buildClientMessageMessages",
          links: { trainerId, clientId: body.clientId, clientMessageId: row.id },
          context: {
            clientName: client.name,
            programId: program.id,
            programVersion: program.version,
            programName: program.name,
            week: body.week,
            stats,
          },
          messages: [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ],
          rt,
          mode: "json",
          schema: AiClientMessageDraft,
          mock: () => JSON.stringify(mockClientMessage(stats)),
        });

        if (out.ok) {
          const [updated] = await db
            .update(clientMessages)
            .set({ status: "validated", draft: out.data, error: null })
            .where(eq(clientMessages.id, row.id))
            .returning();
          return status(201, updated);
        }

        const [failed] = await db
          .update(clientMessages)
          .set(
            out.kind === "provider"
              ? { status: "failed_provider", error: out.error.message }
              : { status: "failed_validation", error: out.kind === "validation" ? out.error : "aborted" }
          )
          .where(eq(clientMessages.id, row.id))
          .returning();
        return status(502, failed);
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: t.Object({
        clientId: t.String(),
        programId: t.String(),
        week: t.Integer({ minimum: 1, maximum: 26 }),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/",
    async ({ query, trainerId }) => {
      const mine = eq(clientMessages.trainerId, trainerId);
      return db
        .select()
        .from(clientMessages)
        .where(query.clientId ? and(mine, eq(clientMessages.clientId, query.clientId)) : mine)
        .orderBy(desc(clientMessages.createdAt));
    },
    { query: t.Object({ clientId: t.Optional(t.String()) }) }
  )
  .get(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(clientMessages).where(eq(clientMessages.id, params.id));
      if (!row) return status(404, { error: "client message not found" });
      return row;
    },
    { params: t.Object({ id: t.String() }) }
  )
  /** Approve: the trainer's (possibly edited) text becomes the final text. */
  .post(
    "/:id/approve",
    async ({ params, body, status, trainerId }) => {
      const [row] = await db.select().from(clientMessages).where(eq(clientMessages.id, params.id));
      if (!row) return status(404, { error: "client message not found" });
      if (row.status !== "validated") {
        return status(409, { error: `client message is ${row.status}, not validated` });
      }
      if (!row.draft) return status(409, { error: "client message has no draft" });
      if (body.text !== undefined && !body.text.trim()) {
        return status(422, { error: "text must not be empty" });
      }
      const [updated] = await db
        .update(clientMessages)
        .set({ status: "approved", finalText: (body.text ?? row.draft.message).trim() })
        .where(eq(clientMessages.id, row.id))
        .returning();
      const draftText = row.draft.message.trim();
      const edited = updated.finalText !== draftText;
      await recordFeedback({
        trainerId,
        clientId: row.clientId,
        subjectKind: "client_message",
        subjectId: row.id,
        signal: "client_message_approved",
        score: edited ? 0 : 1,
        payload: edited ? { edited, draft: draftText, final: updated.finalText } : { edited },
      });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        text: t.Optional(t.String({ minLength: 1, maxLength: CLIENT_MESSAGE_MAX_CHARS })),
      }),
    }
  )
  .post(
    "/:id/reject",
    async ({ params, status, trainerId }) => {
      const [row] = await db.select().from(clientMessages).where(eq(clientMessages.id, params.id));
      if (!row) return status(404, { error: "client message not found" });
      const [updated] = await db
        .update(clientMessages)
        .set({ status: "rejected" })
        .where(eq(clientMessages.id, params.id))
        .returning();
      await recordFeedback({
        trainerId,
        clientId: row.clientId,
        subjectKind: "client_message",
        subjectId: row.id,
        signal: "client_message_rejected",
      });
      return updated;
    },
    { params: t.Object({ id: t.String() }) }
  );
