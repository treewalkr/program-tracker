import { Elysia, t } from "elysia";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { cardioTemplates, db, trainers } from "@pt/db";
import { CARDIO_TEMPLATE_PRESETS, cardioTemplatePreset, CardioTemplatePrescription } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { CardioTemplateModel } from "../models/cardio-templates";
import { ErrorBody } from "../models/shared";

/** Built-in templates live in code (CARDIO_TEMPLATE_PRESETS); the API only stores which ones a trainer hid. */
async function hiddenPresets(trainerId: string): Promise<string[]> {
  const [row] = await db.select({ hidden: trainers.hiddenCardioPresets }).from(trainers).where(eq(trainers.id, trainerId));
  return row?.hidden ?? [];
}

const invalid = (error: z.ZodError) => ({ error: "invalid cardio template", issues: z.treeifyError(error) });
const idParams = t.Object({ id: t.String({ format: "uuid" }) });

/** Cardio templates: the built-in presets (hideable) and the trainer's saved ones (CRUD + archive). */
export const cardioTemplateRoutes = new Elysia({ prefix: "/v1/cardio-templates", tags: ["cardio-templates"] })
  .use(trainerContext)
  .get(
    "/",
    async ({ trainerId }) => {
      const [hidden, rows] = await Promise.all([
        hiddenPresets(trainerId),
        db.select().from(cardioTemplates).where(eq(cardioTemplates.trainerId, trainerId)).orderBy(asc(cardioTemplates.createdAt)),
      ]);
      const presets = CARDIO_TEMPLATE_PRESETS.map((p) => ({ ...p, hidden: hidden.includes(p.key) }));
      return { presets, templates: rows };
    },
    {
      response: { 200: t.Object({ presets: t.Array(CardioTemplateModel.preset), templates: t.Array(CardioTemplateModel.dto) }) },
      detail: { summary: "Built-in presets (with hidden flags) and the trainer's saved templates" },
    }
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const parsed = CardioTemplatePrescription.safeParse(body.prescription);
      if (!parsed.success) return status(422, invalid(parsed.error));
      const name = body.name.trim();
      if (!name) return status(422, { error: "name is required" });
      const [row] = await db
        .insert(cardioTemplates)
        .values({ trainerId, name, prescription: parsed.data, basedOn: body.basedOn ?? null })
        .returning();
      return status(201, row);
    },
    {
      body: CardioTemplateModel.create,
      response: { 201: CardioTemplateModel.dto, 422: ErrorBody },
      detail: { summary: "Save a cardio template" },
    }
  )
  .put(
    "/presets/:key",
    async ({ params, body, status, trainerId }) => {
      if (!cardioTemplatePreset(params.key)) return status(404, { error: "preset not found" });
      const current = await hiddenPresets(trainerId);
      const hidden = body.hidden ? [...new Set([...current, params.key])] : current.filter((k) => k !== params.key);
      await db.update(trainers).set({ hiddenCardioPresets: hidden }).where(eq(trainers.id, trainerId));
      return { hidden };
    },
    {
      params: t.Object({ key: t.String({ maxLength: 64 }) }),
      body: t.Object({ hidden: t.Boolean() }),
      response: { 200: t.Object({ hidden: t.Array(t.String()) }), 404: ErrorBody },
      detail: { summary: "Hide or show a built-in cardio template" },
    }
  )
  .patch(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const where = and(eq(cardioTemplates.id, params.id), eq(cardioTemplates.trainerId, trainerId));
      const [existing] = await db.select().from(cardioTemplates).where(where);
      if (!existing) return status(404, { error: "template not found" });
      const updates: Partial<typeof cardioTemplates.$inferInsert> = {};
      if (body.prescription !== undefined) {
        const parsed = CardioTemplatePrescription.safeParse(body.prescription);
        if (!parsed.success) return status(422, invalid(parsed.error));
        updates.prescription = parsed.data;
      }
      if (body.name !== undefined) {
        const name = body.name.trim();
        if (!name) return status(422, { error: "name is required" });
        updates.name = name;
      }
      if (body.archived !== undefined) updates.archivedAt = body.archived ? (existing.archivedAt ?? new Date()) : null;
      if (!Object.keys(updates).length) return existing;
      const [row] = await db.update(cardioTemplates).set({ ...updates, updatedAt: new Date() }).where(where).returning();
      return row;
    },
    {
      params: idParams,
      body: CardioTemplateModel.update,
      response: { 200: CardioTemplateModel.dto, 404: ErrorBody, 422: ErrorBody },
      detail: { summary: "Rename, rewrite or archive a cardio template" },
    }
  )
  /** Sessions keep their own copy, so deleting a template never changes a program. */
  .delete(
    "/:id",
    async ({ params, status, trainerId }) => {
      const [gone] = await db
        .delete(cardioTemplates)
        .where(and(eq(cardioTemplates.id, params.id), eq(cardioTemplates.trainerId, trainerId)))
        .returning({ id: cardioTemplates.id });
      if (!gone) return status(404, { error: "template not found" });
      return status(204);
    },
    { params: idParams, detail: { summary: "Delete a cardio template" } }
  );
