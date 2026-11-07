import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, programs } from "@pt/db";
import { Phasing, ProgramWeeksDocument } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";

/** Write boundary: raw jsonb weeks are only accepted if they pass the shared schema. */
const WeeksDoc = ProgramWeeksDocument;

export function toProgramDto(row: typeof programs.$inferSelect) {
  const { sessions, ...rest } = row;
  return { ...rest, weeks: sessions };
}

/** null clears the phasing; a malformed document is a 422. */
function parsePhasing(raw: unknown): { ok: true; value: Phasing | null } | { ok: false; issues: unknown } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const parsed = Phasing.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: z.treeifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

export const programRoutes = new Elysia({ prefix: "/v1/programs", tags: ["programs"] })
  .use(trainerContext)
  .get("/", async ({ query, trainerId }) => {
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
    return rows.map(toProgramDto);
  })
  .get(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!row) return status(404, { error: "program not found" });
      return toProgramDto(row);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const parsed = WeeksDoc.safeParse(body.weeks);
      if (!parsed.success) {
        return status(422, { error: "invalid weeks document", issues: z.treeifyError(parsed.error) });
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
          direction: body.direction ?? null,
          aiAssisted: body.aiAssisted ?? false,
          createdFromProgramId: body.createdFromProgramId ?? null,
        })
        .returning();
      return status(201, toProgramDto(created));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        clientId: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        direction: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
        weeks: t.Any(),
        phasing: t.Optional(t.Any()),
        aiAssisted: t.Optional(t.Boolean()),
        createdFromProgramId: t.Optional(t.String()),
      }),
    }
  )
  /** Replace the whole weeks document (trainer edited an active program) → version++.
   *  An absent phasing leaves it untouched; explicit null clears it. */
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const parsed = WeeksDoc.safeParse(body.weeks);
      if (!parsed.success) {
        return status(422, { error: "invalid weeks document", issues: z.treeifyError(parsed.error) });
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
      if (body.direction !== undefined) {
        update.direction = body.direction;
      }

      const [updated] = await db
        .update(programs)
        .set(update)
        .where(eq(programs.id, params.id))
        .returning();
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        weeks: t.Any(),
        phasing: t.Optional(t.Any()),
        direction: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
      }),
    }
  )
  .patch(
    "/:id/direction",
    async ({ params, body, status }) => {
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });

      const [updated] = await db
        .update(programs)
        .set({ direction: body.direction })
        .where(eq(programs.id, params.id))
        .returning();
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        direction: t.Union([t.String({ maxLength: 500 }), t.Null()]),
      }),
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
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.Union([t.Literal("draft"), t.Literal("active"), t.Literal("archived")]) }),
    }
  );
