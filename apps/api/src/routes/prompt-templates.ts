import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, promptTemplates } from "@pt/db";
import { InstructionTemplateInput } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";

export const promptTemplateRoutes = new Elysia({ prefix: "/v1/ai/prompt-templates", tags: ["prompt-templates"] })
  .use(trainerContext)
  .get("/", async ({ trainerId }) => {
    const rows = await db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.trainerId, trainerId))
      .orderBy(asc(promptTemplates.createdAt));
    return { templates: rows };
  })
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const parsed = InstructionTemplateInput.safeParse(body);
      if (!parsed.success) {
        return status(422, {
          error: "invalid template",
          issues: z.treeifyError(parsed.error),
        });
      }
      const [created] = await db
        .insert(promptTemplates)
        .values({ trainerId, ...parsed.data })
        .returning();
      return status(201, created);
    },
    { body: t.Any() }
  )
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const parsed = InstructionTemplateInput.safeParse(body);
      if (!parsed.success) {
        return status(422, {
          error: "invalid template",
          issues: z.treeifyError(parsed.error),
        });
      }
      const [updated] = await db
        .update(promptTemplates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(promptTemplates.id, params.id))
        .returning();
      if (!updated) return status(404, { error: "template not found" });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Any(),
    }
  )
  .delete(
    "/:id",
    async ({ params, status }) => {
      const [deleted] = await db
        .delete(promptTemplates)
        .where(eq(promptTemplates.id, params.id))
        .returning();
      if (!deleted) return status(404, { error: "template not found" });
      return status(204);
    },
    { params: t.Object({ id: t.String() }) }
  );
