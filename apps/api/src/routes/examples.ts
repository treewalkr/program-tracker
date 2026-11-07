import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, programExamples, programs } from "@pt/db";
import { ProgramExampleInput, ProgramExamplePatch } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { toProgramDto } from "./programs";

/** Example rows always travel with the live program they reference. */
async function listJoined(trainerId: string, programId?: string) {
  const where = programId
    ? and(eq(programExamples.trainerId, trainerId), eq(programExamples.programId, programId))
    : eq(programExamples.trainerId, trainerId);
  const rows = await db
    .select({ example: programExamples, program: programs })
    .from(programExamples)
    .innerJoin(programs, eq(programExamples.programId, programs.id))
    .where(where)
    .orderBy(desc(programExamples.createdAt));
  return rows.map(({ example, program }) => ({
    ...example,
    program: toProgramDto(program),
  }));
}

async function findJoined(id: string) {
  const [row] = await db
    .select({ example: programExamples, program: programs })
    .from(programExamples)
    .innerJoin(programs, eq(programExamples.programId, programs.id))
    .where(eq(programExamples.id, id));
  if (!row) return null;
  return { ...row.example, program: toProgramDto(row.program) };
}

export const exampleRoutes = new Elysia({ prefix: "/v1/examples", tags: ["examples"] })
  .use(trainerContext)
  .get(
    "/",
    async ({ query, trainerId }) => {
      return { examples: await listJoined(trainerId, query.programId) };
    },
    { query: t.Object({ programId: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const parsed = ProgramExampleInput.safeParse(body);
      if (!parsed.success) {
        return status(422, {
          error: "invalid example",
          issues: z.treeifyError(parsed.error),
        });
      }

      const [programRow] = await db.select().from(programs).where(eq(programs.id, parsed.data.programId));
      if (!programRow) return status(404, { error: "program not found" });

      const [existing] = await db
        .select()
        .from(programExamples)
        .where(eq(programExamples.programId, parsed.data.programId));
      if (existing) return status(409, { error: "program is already marked as an example" });

      // examples keep "daysPerWeek" = lifting sessions per week; default from week 1
      // (cardio excluded), floored at 1 for a cardio-only week, capped by the field's max 7
      const liftingInWeek1 = programRow.sessions[0].sessions.filter((s) => s.kind !== "cardio").length;
      const daysPerWeek = parsed.data.daysPerWeek ?? Math.min(7, Math.max(1, liftingInWeek1));

      const [created] = await db
        .insert(programExamples)
        .values({ trainerId, ...parsed.data, daysPerWeek })
        .returning();
      const joined = created ? await findJoined(created.id) : null;
      return status(201, joined);
    },
    { body: t.Any() },
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const parsed = ProgramExamplePatch.safeParse(body);
      if (!parsed.success) {
        return status(422, {
          error: "invalid example",
          issues: z.treeifyError(parsed.error),
        });
      }
      const [updated] = await db
        .update(programExamples)
        .set(parsed.data)
        .where(eq(programExamples.id, params.id))
        .returning();
      if (!updated) return status(404, { error: "example not found" });
      return status(200, await findJoined(params.id));
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Any(),
    },
  )
  .delete(
    "/:id",
    async ({ params, status }) => {
      const [deleted] = await db
        .delete(programExamples)
        .where(eq(programExamples.id, params.id))
        .returning();
      if (!deleted) return status(404, { error: "example not found" });
      return status(204);
    },
    { params: t.Object({ id: t.String() }) },
  );
