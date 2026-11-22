import { Elysia, t } from "elysia";
import { and, eq, ne, sql } from "drizzle-orm";
import { cardioModalities, db, type CardioModalityRow } from "@pt/db";
import { normalizeTypeName } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { ensureModalities } from "../lib/modalities";
import { ModalityModel } from "../models/modalities";
import { ErrorBody } from "../models/shared";

const lockedPreset = { error: "preset modalities can't be edited" };

/** modalityId → number of this trainer's programs with a cardio session using it. */
async function usageCounts(trainerId: string, modalityId?: string): Promise<Map<string, number>> {
  const rows = await db.execute<{ id: string; n: number }>(sql`
    select s->'cardio'->>'modalityId' as id, count(distinct p.id)::int as n
    from programs p
    cross join lateral jsonb_array_elements(p.sessions) w
    cross join lateral jsonb_array_elements(coalesce(w->'sessions', '[]'::jsonb)) s
    where p.trainer_id = ${trainerId} and jsonb_typeof(s->'cardio') = 'object' and (s->'cardio') ? 'modalityId'
    ${modalityId ? sql`and s->'cardio'->>'modalityId' = ${modalityId}` : sql``}
    group by 1`);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

const toDto = (row: CardioModalityRow, usedIn: number) => ({
  id: row.id,
  name: row.name,
  metric: row.metric,
  presetKey: row.presetKey,
  archivedAt: row.archivedAt,
  usedIn,
});

async function nameTaken(trainerId: string, name: string, exceptId?: string) {
  const [hit] = await db
    .select({ id: cardioModalities.id })
    .from(cardioModalities)
    .where(
      and(
        eq(cardioModalities.trainerId, trainerId),
        sql`lower(${cardioModalities.name}) = lower(${name})`,
        exceptId ? ne(cardioModalities.id, exceptId) : undefined
      )
    )
    .limit(1);
  return Boolean(hit);
}

const taken = (name: string) => ({ error: `"${name}" is already a modality` });
const idParams = t.Object({ id: t.String({ format: "uuid" }) });

/** Cardio modalities, managed like session types: presets archive/restore only, the trainer's own are editable. */
export const modalityRoutes = new Elysia({ prefix: "/v1/modalities", tags: ["modalities"] })
  .use(trainerContext)
  .get(
    "/",
    async ({ trainerId, impersonating }) => {
      const [rows, uses] = await Promise.all([ensureModalities(trainerId, { write: !impersonating }), usageCounts(trainerId)]);
      return rows.map((r) => toDto(r, uses.get(r.id) ?? 0));
    },
    { response: { 200: t.Array(ModalityModel.dto) }, detail: { summary: "Every modality (archived flagged), presets seeded" } }
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const name = normalizeTypeName(body.name);
      if (!name) return status(422, { error: "name is required" });
      await ensureModalities(trainerId); // presets first, so a custom one can't take a preset's name
      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('modalities:' || ${trainerId}))`);
        if (await nameTaken(trainerId, name)) return null;
        const [row] = await tx.insert(cardioModalities).values({ trainerId, name, metric: body.metric }).returning();
        return row;
      });
      if (!created) return status(409, taken(name));
      return status(201, toDto(created, 0));
    },
    {
      body: ModalityModel.create,
      response: { 201: ModalityModel.dto, 409: ErrorBody, 422: ErrorBody },
      detail: { summary: "Add a modality" },
    }
  )
  /** Rename, change metric or archive/restore; presets only archive/restore. Programs keep the name they captured. */
  .patch(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const [existing] = await db
        .select()
        .from(cardioModalities)
        .where(and(eq(cardioModalities.id, params.id), eq(cardioModalities.trainerId, trainerId)));
      if (!existing) return status(404, { error: "modality not found" });
      if (existing.presetKey && (body.name !== undefined || body.metric !== undefined)) return status(409, lockedPreset);
      const updates: Partial<typeof cardioModalities.$inferInsert> = {};
      if (body.name !== undefined) {
        const name = normalizeTypeName(body.name);
        if (!name) return status(422, { error: "name is required" });
        if (await nameTaken(trainerId, name, existing.id)) return status(409, taken(name));
        updates.name = name;
      }
      if (body.metric !== undefined) updates.metric = body.metric;
      if (body.archived !== undefined) updates.archivedAt = body.archived ? (existing.archivedAt ?? new Date()) : null;
      const [row] = Object.keys(updates).length
        ? await db.update(cardioModalities).set(updates).where(eq(cardioModalities.id, existing.id)).returning()
        : [existing];
      const uses = await usageCounts(trainerId, row.id);
      return toDto(row, uses.get(row.id) ?? 0);
    },
    {
      params: idParams,
      body: ModalityModel.update,
      response: { 200: ModalityModel.dto, 404: ErrorBody, 409: ErrorBody, 422: ErrorBody },
      detail: { summary: "Edit or archive a modality" },
    }
  )
  /** Delete for good — only unused custom modalities; presets archive instead. */
  .delete(
    "/:id",
    async ({ params, status, trainerId }) => {
      const [existing] = await db
        .select()
        .from(cardioModalities)
        .where(and(eq(cardioModalities.id, params.id), eq(cardioModalities.trainerId, trainerId)));
      if (!existing) return status(404, { error: "modality not found" });
      if (existing.presetKey) return status(409, { error: "preset modalities can only be archived" });
      const uses = (await usageCounts(trainerId, existing.id)).get(existing.id) ?? 0;
      if (uses) return status(409, { error: `used in ${uses} program${uses === 1 ? "" : "s"} — archive it instead` });
      await db.delete(cardioModalities).where(eq(cardioModalities.id, existing.id));
      return status(204);
    },
    { params: idParams, detail: { summary: "Delete an unused custom modality" } }
  );
