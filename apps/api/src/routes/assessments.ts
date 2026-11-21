import { Elysia, t } from "elysia";
import { and, asc, eq } from "drizzle-orm";
import { assessments, clients, db } from "@pt/db";
import { estimateVo2, type Vo2Protocol } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { AssessmentModel } from "../models/assessments";
import { ErrorBody } from "../models/shared";

const params = t.Object({ id: t.String({ format: "uuid" }) });
const itemParams = t.Object({ id: t.String({ format: "uuid" }), assessmentId: t.String({ format: "uuid" }) });

/** The member facts a protocol may need (sex, birth date), as recorded now. */
async function memberOf(clientId: string) {
  const [c] = await db.select({ sex: clients.sex, birthDate: clients.birthDate }).from(clients).where(eq(clients.id, clientId));
  return c ?? {};
}

/** Compute on the server — a client-sent result is never stored. */
async function compute(clientId: string, protocol: Vo2Protocol, inputs: unknown, testedOn: string) {
  return estimateVo2(protocol, inputs, await memberOf(clientId), testedOn);
}

/**
 * VO₂max field tests for a member. The result and formula version always come
 * from the shared formulas; the client id in the path is checked by the
 * ownership guard, and the assessment must belong to that member.
 */
export const assessmentRoutes = new Elysia({ prefix: "/v1/clients", tags: ["clients"] })
  .use(trainerContext)
  .get(
    "/:id/assessments",
    async ({ params }) =>
      db.select().from(assessments).where(eq(assessments.clientId, params.id)).orderBy(asc(assessments.testedOn), asc(assessments.createdAt)),
    { params, response: { 200: t.Array(AssessmentModel.dto) }, detail: { summary: "A member's VO₂max tests, oldest first" } }
  )
  .post(
    "/:id/assessments",
    async ({ params, body, status }) => {
      const result = await compute(params.id, body.protocol, body.inputs, body.testedOn);
      if (!result.ok) return status(422, { error: result.error });
      const [row] = await db
        .insert(assessments)
        .values({
          clientId: params.id,
          protocol: body.protocol,
          formulaVersion: result.formulaVersion,
          testedOn: body.testedOn,
          inputs: body.inputs,
          result: result.value,
          notes: body.notes?.trim() || null,
        })
        .returning();
      return status(201, row);
    },
    {
      params,
      body: AssessmentModel.create,
      response: { 201: AssessmentModel.dto, 404: ErrorBody, 422: ErrorBody },
      detail: { summary: "Record a VO₂max field test (the server computes the estimate)" },
    }
  )
  .patch(
    "/:id/assessments/:assessmentId",
    async ({ params, body, status }) => {
      const [existing] = await db
        .select()
        .from(assessments)
        .where(and(eq(assessments.id, params.assessmentId), eq(assessments.clientId, params.id)));
      if (!existing) return status(404, { error: "assessment not found" });
      const protocol = body.protocol ?? existing.protocol;
      const testedOn = body.testedOn ?? existing.testedOn;
      const inputs = body.inputs ?? existing.inputs;
      const result = await compute(params.id, protocol, inputs, testedOn);
      if (!result.ok) return status(422, { error: result.error });
      const [row] = await db
        .update(assessments)
        .set({
          protocol,
          testedOn,
          inputs,
          result: result.value,
          formulaVersion: result.formulaVersion,
          ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, existing.id))
        .returning();
      return row;
    },
    {
      params: itemParams,
      body: AssessmentModel.update,
      response: { 200: AssessmentModel.dto, 404: ErrorBody, 422: ErrorBody },
      detail: { summary: "Edit a VO₂max test (recomputed by the server)" },
    }
  )
  .delete(
    "/:id/assessments/:assessmentId",
    async ({ params, status }) => {
      const [gone] = await db
        .delete(assessments)
        .where(and(eq(assessments.id, params.assessmentId), eq(assessments.clientId, params.id)))
        .returning({ id: assessments.id });
      if (!gone) return status(404, { error: "assessment not found" });
      return status(204);
    },
    { params: itemParams, detail: { summary: "Delete a VO₂max test" } }
  );
