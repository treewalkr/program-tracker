import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, programs } from "@pt/db";
import { ProgramSession } from "@pt/shared";
import { getDefaultTrainerId } from "../lib/trainer";

/** Write boundary: raw jsonb sessions are only accepted if they pass the shared schema. */
const SessionsDoc = z.array(ProgramSession).min(1).max(14);

export const programRoutes = new Elysia({ prefix: "/v1/programs" })
  .get("/", async ({ query }) => {
    const trainerId = await getDefaultTrainerId();
    const rows = query.clientId
      ? await db
          .select()
          .from(programs)
          .where(and(eq(programs.trainerId, trainerId), eq(programs.clientId, query.clientId)))
          .orderBy(desc(programs.createdAt))
      : await db
          .select()
          .from(programs)
          .where(eq(programs.trainerId, trainerId))
          .orderBy(desc(programs.createdAt));
    return rows;
  })
  .get(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!row) return status(404, { error: "program not found" });
      return row;
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/",
    async ({ body, status }) => {
      const trainerId = await getDefaultTrainerId();
      const parsed = SessionsDoc.safeParse(body.sessions);
      if (!parsed.success) {
        return status(422, { error: "invalid sessions document", issues: z.treeifyError(parsed.error) });
      }
      const [created] = await db
        .insert(programs)
        .values({
          trainerId,
          clientId: body.clientId ?? null,
          name: body.name,
          description: body.description ?? null,
          sessions: parsed.data,
          aiAssisted: body.aiAssisted ?? false,
          createdFromProgramId: body.createdFromProgramId ?? null,
        })
        .returning();
      return status(201, created);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        clientId: t.Optional(t.String()),
        description: t.Optional(t.String({ maxLength: 2000 })),
        sessions: t.Any(),
        aiAssisted: t.Optional(t.Boolean()),
        createdFromProgramId: t.Optional(t.String()),
      }),
    }
  )
  /** Replace the whole sessions document (trainer edited an active program) → version++. */
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const parsed = SessionsDoc.safeParse(body.sessions);
      if (!parsed.success) {
        return status(422, { error: "invalid sessions document", issues: z.treeifyError(parsed.error) });
      }
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });

      const [updated] = await db
        .update(programs)
        .set({ sessions: parsed.data, version: current.version + 1 })
        .where(eq(programs.id, params.id))
        .returning();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ sessions: t.Any() }),
    }
  )
  /** Status transitions; activating a program archives the client's other active ones. */
  .patch(
    "/:id/status",
    async ({ params, body, status }) => {
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });

      if (body.status === "active" && current.clientId) {
        const clientPrograms = await db
          .select()
          .from(programs)
          .where(eq(programs.clientId, current.clientId));
        for (const p of clientPrograms) {
          if (p.id !== current.id && p.status === "active") {
            await db.update(programs).set({ status: "archived" }).where(eq(programs.id, p.id));
          }
        }
      }
      const [updated] = await db
        .update(programs)
        .set({ status: body.status })
        .where(eq(programs.id, params.id))
        .returning();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.Union([t.Literal("draft"), t.Literal("active"), t.Literal("archived")]) }),
    }
  );
