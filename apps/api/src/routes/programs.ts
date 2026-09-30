import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, programs } from "@pt/db";
import { Phasing, ProgramSession } from "@pt/shared";
import { getDefaultTrainerId } from "../lib/trainer";

/** Write boundary: raw jsonb sessions are only accepted if they pass the shared schema. */
const SessionsDoc = z.array(ProgramSession).min(1).max(14);

/** null clears the phasing; a malformed document is a 422. */
function parsePhasing(raw: unknown): { ok: true; value: Phasing | null } | { ok: false; issues: unknown } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const parsed = Phasing.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: z.treeifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

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
      const phasing = parsePhasing(body.phasing);
      if (!phasing.ok) {
        return status(422, { error: "invalid phasing document", issues: phasing.issues });
      }
      const [created] = await db
        .insert(programs)
        .values({
          trainerId,
          clientId: body.clientId ?? null,
          name: body.name,
          description: body.description ?? null,
          sessions: parsed.data,
          phasing: phasing.value,
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
        phasing: t.Optional(t.Any()),
        aiAssisted: t.Optional(t.Boolean()),
        createdFromProgramId: t.Optional(t.String()),
      }),
    }
  )
  /** Replace the whole sessions document (trainer edited an active program) → version++.
   *  An absent phasing leaves it untouched; explicit null clears it. */
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const parsed = SessionsDoc.safeParse(body.sessions);
      if (!parsed.success) {
        return status(422, { error: "invalid sessions document", issues: z.treeifyError(parsed.error) });
      }
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });

      const update: Record<string, unknown> = { sessions: parsed.data, version: current.version + 1 };
      if (body.phasing !== undefined) {
        const phasing = parsePhasing(body.phasing);
        if (!phasing.ok) {
          return status(422, { error: "invalid phasing document", issues: phasing.issues });
        }
        update.phasing = phasing.value;
      }

      const [updated] = await db
        .update(programs)
        .set(update)
        .where(eq(programs.id, params.id))
        .returning();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ sessions: t.Any(), phasing: t.Optional(t.Any()) }),
    }
  )
  /** Status transitions; activating a program archives the client's other active ones
   *  and stamps activated_at on FIRST activation only (block-week anchor). */
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
      const stamp = body.status === "active" && !current.activatedAt ? { activatedAt: new Date() } : {};
      const [updated] = await db
        .update(programs)
        .set({ status: body.status, ...stamp })
        .where(eq(programs.id, params.id))
        .returning();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.Union([t.Literal("draft"), t.Literal("active"), t.Literal("archived")]) }),
    }
  );
