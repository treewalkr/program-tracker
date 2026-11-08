import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { aiImports, db } from "@pt/db";
import { DEFAULT_PROVIDER_ID, IMPORT_MAX_CHARS, chunkLines, importLines } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { ContextError, providerRuntime, resolveEffort } from "../ai/runtime";
import { abortGeneration, deregisterGeneration, registerGeneration } from "../ai/cancellation";
import { extractChunks, importResult, recentImports, settleImport } from "../lib/imports";

/** Paste notes → a stored, resumable, cancellable import (docs/paste-import-plan.md §1). */
export const importRoutes = new Elysia({ prefix: "/v1/ai/imports", tags: ["ai"] })
  .use(trainerContext)
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      try {
        const providerId = body.providerId ?? DEFAULT_PROVIDER_ID;
        const rt = providerRuntime(providerId, body.model);
        const effort = resolveEffort(rt, body.effort);
        const text = importLines(body.text).join("\n");
        const chunks = chunkLines(importLines(text));
        if (chunks.length === 0) return status(422, { error: "nothing to read — paste some notes" });

        const [row] = await db
          .insert(aiImports)
          .values({
            trainerId,
            clientId: body.clientId,
            text,
            providerId,
            model: rt.model,
            effort: effort ?? rt.defaultEffort ?? null,
            status: "pending",
            chunksTotal: chunks.length,
          })
          .returning();

        const ac = registerGeneration(row.id);
        try {
          const outcomes = await extractChunks(row, rt, effort, ac.signal);
          if (outcomes === null) {
            const [current] = await db.select().from(aiImports).where(eq(aiImports.id, row.id));
            return status(200, current);
          }
          const result = await importResult(trainerId, text, outcomes);
          const { code, row: settled } = await settleImport(row.id, result, outcomes.every((o) => !o.ok));
          return status(code, settled);
        } finally {
          deregisterGeneration(row.id);
        }
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: t.Object({
        clientId: t.String(),
        text: t.String({ minLength: 1, maxLength: IMPORT_MAX_CHARS }),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        effort: t.Optional(t.String()),
      }),
    }
  )
  /** The client's 5 most recent imports, newest first (no result — open one to get it). */
  .get("/", ({ query, trainerId }) => recentImports(trainerId, query.clientId), {
    query: t.Object({ clientId: t.String() }),
  })
  /** The row with chunksDone / chunksTotal — polled while pending. */
  .get(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(aiImports).where(eq(aiImports.id, params.id));
      if (!row) return status(404, { error: "import not found" });
      return row;
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/cancel",
    async ({ params, status }) => {
      const [cancelled] = await db
        .update(aiImports)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(aiImports.id, params.id), eq(aiImports.status, "pending")))
        .returning();
      if (!cancelled) {
        const [row] = await db.select().from(aiImports).where(eq(aiImports.id, params.id));
        if (!row) return status(404, { error: "import not found" });
        return status(409, { error: `import is ${row.status}, not pending` });
      }
      abortGeneration(params.id);
      return cancelled;
    },
    { params: t.Object({ id: t.String() }) }
  );
