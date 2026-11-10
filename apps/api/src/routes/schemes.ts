import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, periodizationSchemes, trainers } from "@pt/db";
import { PeriodizationSchemeInput, schemePreset } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";

/** Built-in presets live in code (SCHEME_PRESETS); the API only stores which ones a trainer hid. */
async function hiddenPresets(trainerId: string): Promise<string[]> {
  const [row] = await db
    .select({ hidden: trainers.hiddenSchemePresets })
    .from(trainers)
    .where(eq(trainers.id, trainerId));
  return row?.hidden ?? [];
}

export const schemeRoutes = new Elysia({ prefix: "/v1/schemes", tags: ["schemes"] })
  .use(trainerContext)
  .get("/", async ({ trainerId }) => {
    const rows = await db
      .select()
      .from(periodizationSchemes)
      .where(eq(periodizationSchemes.trainerId, trainerId))
      .orderBy(asc(periodizationSchemes.createdAt));
    return { schemes: rows };
  })
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const parsed = PeriodizationSchemeInput.safeParse(body);
      if (!parsed.success) {
        return status(422, { error: "invalid scheme", issues: z.treeifyError(parsed.error) });
      }
      const { name, weeks, description, basedOn } = parsed.data;
      const [created] = await db
        .insert(periodizationSchemes)
        .values({ trainerId, name, weeks, description: description ?? null, basedOn: basedOn ?? null })
        .returning();
      return status(201, created);
    },
    { body: t.Any() }
  )
  .get("/presets/hidden", async ({ trainerId }) => ({ hidden: await hiddenPresets(trainerId) }))
  .put(
    "/presets/:key",
    async ({ params, body, status, trainerId }) => {
      if (!schemePreset(params.key)) return status(404, { error: "preset not found" });
      const current = await hiddenPresets(trainerId);
      const hidden = body.hidden
        ? [...new Set([...current, params.key])]
        : current.filter((k) => k !== params.key);
      await db.update(trainers).set({ hiddenSchemePresets: hidden }).where(eq(trainers.id, trainerId));
      return { hidden };
    },
    { params: t.Object({ key: t.String() }), body: t.Object({ hidden: t.Boolean() }) }
  )
  /** Rename or rewrite a scheme. Programs built on it keep their own phasing copy. */
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const parsed = PeriodizationSchemeInput.safeParse(body);
      if (!parsed.success) {
        return status(422, { error: "invalid scheme", issues: z.treeifyError(parsed.error) });
      }
      const { name, weeks, description, basedOn } = parsed.data;
      const [updated] = await db
        .update(periodizationSchemes)
        .set({
          name,
          weeks,
          description: description ?? null,
          ...(basedOn !== undefined ? { basedOn } : {}),
          updatedAt: new Date(),
        })
        .where(eq(periodizationSchemes.id, params.id))
        .returning();
      if (!updated) return status(404, { error: "scheme not found" });
      return updated;
    },
    { params: t.Object({ id: t.String() }), body: t.Any() }
  )
  /** Deleting a scheme never touches programs — they carry their own phasing copy. */
  .delete(
    "/:id",
    async ({ params, status }) => {
      const [deleted] = await db
        .delete(periodizationSchemes)
        .where(eq(periodizationSchemes.id, params.id))
        .returning();
      if (!deleted) return status(404, { error: "scheme not found" });
      return status(204);
    },
    { params: t.Object({ id: t.String() }) }
  );
