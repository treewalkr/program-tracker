import { Elysia, t } from "elysia";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { clientHrProfiles, db } from "@pt/db";
import { HrProfileInput, profileZones } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { HrProfileModel } from "../models/hr-profiles";
import { ErrorBody } from "../models/shared";

/**
 * A member's HR profile versions. Each change is a new version (never an edit),
 * so a log's bpm targets stay resolvable from the version in effect on its date.
 * The client id in the path is checked by the ownership guard (`/v1/clients/:id`).
 */
export const hrProfileRoutes = new Elysia({ prefix: "/v1/clients", tags: ["clients"] })
  .use(trainerContext)
  .get(
    "/:id/hr-profiles",
    async ({ params }) =>
      db
        .select()
        .from(clientHrProfiles)
        .where(eq(clientHrProfiles.clientId, params.id))
        .orderBy(asc(clientHrProfiles.version)),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      response: { 200: t.Array(HrProfileModel.dto) },
      detail: { summary: "A member's HR profile versions, oldest first" },
    }
  )
  .post(
    "/:id/hr-profiles",
    async ({ params, body, status }) => {
      // only a custom profile takes a table; a computed method's zones always come from the server
      const parsed = HrProfileInput.safeParse(body.method === "custom" ? body : { ...body, zones: undefined });
      if (!parsed.success) return status(422, { error: "invalid HR profile", issues: z.treeifyError(parsed.error) });
      const input = parsed.data;
      const zones = profileZones(input);
      if (!zones) return status(422, { error: "these inputs don't give zones for this method" });
      const custom = input.method === "custom";
      const row = await db.transaction(async (tx) => {
        // one version number per member (no UNIQUE index — the lock keeps two saves apart)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hr-profile:' || ${params.id}))`);
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(${clientHrProfiles.version}), 0)::int + 1` })
          .from(clientHrProfiles)
          .where(eq(clientHrProfiles.clientId, params.id));
        const [created] = await tx
          .insert(clientHrProfiles)
          .values({
            clientId: params.id,
            version: next,
            effectiveFrom: input.effectiveFrom,
            method: input.method,
            restingHr: input.restingHr ?? null,
            maxHr: input.maxHr ?? null,
            maxHrTestedOn: input.maxHrTestedOn ?? null,
            lthr: input.lthr ?? null,
            zones: custom ? [...zones].sort((a, b) => a.zone - b.zone) : zones,
          })
          .returning();
        return created;
      });
      return status(201, row);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: HrProfileModel.create,
      response: { 201: HrProfileModel.dto, 404: ErrorBody, 422: ErrorBody },
      detail: { summary: "Start a new HR profile version for a member" },
    }
  );
