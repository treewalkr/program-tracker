import { Elysia, t } from "elysia";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, sessionTypes, type SessionTypeRow } from "@pt/db";
import { ensureSessionTypes } from "../lib/session-types";
import { SESSION_KINDS, SESSION_TYPE_NAME_MAX, normalizeTypeName, type SessionKind } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";

const Name = t.String({ minLength: 1, maxLength: SESSION_TYPE_NAME_MAX });
// A plain string checked in the handler: t.UnionEnum fills an absent optional
// field with its first member, which would turn a partial PATCH into a format change.
const Format = t.String({ maxLength: 20 });
const isFormat = (f: string): f is SessionKind => (SESSION_KINDS as readonly string[]).includes(f);
const badFormat = { error: "format must be lifting or cardio" };

/** typeId → number of this trainer's programs (any status) with a session of that type. */
async function usageCounts(trainerId: string, typeId?: string): Promise<Map<string, number>> {
  const rows = await db.execute<{ id: string; n: number }>(sql`
    select s->>'typeId' as id, count(distinct p.id)::int as n
    from programs p
    cross join lateral jsonb_array_elements(p.sessions) w
    cross join lateral jsonb_array_elements(coalesce(w->'sessions', '[]'::jsonb)) s
    where p.trainer_id = ${trainerId} and s ? 'typeId'
    ${typeId ? sql`and s->>'typeId' = ${typeId}` : sql``}
    group by 1`);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

const toDto = (row: SessionTypeRow, usedIn: number) => ({
  id: row.id,
  name: row.name,
  format: row.format,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  usedIn,
});

async function nameTaken(trainerId: string, name: string, exceptId?: string) {
  const [hit] = await db
    .select({ id: sessionTypes.id })
    .from(sessionTypes)
    .where(
      and(
        eq(sessionTypes.trainerId, trainerId),
        sql`lower(${sessionTypes.name}) = lower(${name})`,
        exceptId ? ne(sessionTypes.id, exceptId) : undefined
      )
    )
    .limit(1);
  return Boolean(hit);
}

const taken = (name: string) => ({ error: `"${name}" is already a session type` });

export const sessionTypeRoutes = new Elysia({ prefix: "/v1/session-types", tags: ["session-types"] })
  .use(trainerContext)
  /** Every type the trainer has (archived included, flagged), defaults seeded on first read. */
  .get("/", async ({ trainerId }) => {
    const [rows, uses] = await Promise.all([ensureSessionTypes(trainerId), usageCounts(trainerId)]);
    return rows.map((r) => toDto(r, uses.get(r.id) ?? 0));
  })
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const name = normalizeTypeName(body.name);
      if (!name) return status(422, { error: "name is required" });
      if (!isFormat(body.format)) return status(422, badFormat);
      await ensureSessionTypes(trainerId); // a first create must not skip the defaults
      if (await nameTaken(trainerId, name)) return status(409, taken(name));
      const [created] = await db.insert(sessionTypes).values({ trainerId, name, format: body.format }).returning();
      return status(201, toDto(created, 0));
    },
    { body: t.Object({ name: Name, format: Format }) }
  )
  /** Rename, change format or archive/restore. Programs keep the name they captured. */
  .patch(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const [existing] = await db
        .select()
        .from(sessionTypes)
        .where(and(eq(sessionTypes.id, params.id), eq(sessionTypes.trainerId, trainerId)));
      if (!existing) return status(404, { error: "session type not found" });

      const updates: Partial<typeof sessionTypes.$inferInsert> = {};
      if (body.name !== undefined) {
        const name = normalizeTypeName(body.name);
        if (!name) return status(422, { error: "name is required" });
        if (await nameTaken(trainerId, name, existing.id)) return status(409, taken(name));
        updates.name = name;
      }
      if (body.format !== undefined) {
        if (!isFormat(body.format)) return status(422, badFormat);
        updates.format = body.format;
      }
      if (body.archived !== undefined) updates.archivedAt = body.archived ? (existing.archivedAt ?? new Date()) : null;

      const [row] = Object.keys(updates).length
        ? await db.update(sessionTypes).set(updates).where(eq(sessionTypes.id, existing.id)).returning()
        : [existing];
      const uses = await usageCounts(trainerId, row.id);
      return toDto(row, uses.get(row.id) ?? 0);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ name: t.Optional(Name), format: t.Optional(Format), archived: t.Optional(t.Boolean()) }),
    }
  )
  /** Delete for good — only unused types, and never the last one (it would re-seed the defaults). */
  .delete(
    "/:id",
    async ({ params, status, trainerId }) => {
      const rows = await db.select().from(sessionTypes).where(eq(sessionTypes.trainerId, trainerId));
      const existing = rows.find((r) => r.id === params.id);
      if (!existing) return status(404, { error: "session type not found" });
      if (rows.length === 1) return status(409, { error: "keep at least one session type" });
      const uses = (await usageCounts(trainerId, existing.id)).get(existing.id) ?? 0;
      if (uses) return status(409, { error: `used in ${uses} program${uses === 1 ? "" : "s"} — archive it instead` });
      await db.delete(sessionTypes).where(eq(sessionTypes.id, existing.id));
      return status(204);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
