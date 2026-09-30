import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, clients, programs } from "@pt/db";
import { getDefaultTrainerId } from "../lib/trainer";

export const clientRoutes = new Elysia({ prefix: "/v1/clients", tags: ["clients"] })
  .get("/", async () => {
    const trainerId = await getDefaultTrainerId();
    return db.select().from(clients).where(eq(clients.trainerId, trainerId));
  })
  .get(
    "/:id",
    async ({ params, status }) => {
      const [client] = await db.select().from(clients).where(eq(clients.id, params.id));
      if (!client) return status(404, { error: "client not found" });

      const activeProgram = await db
        .select()
        .from(programs)
        .where(eq(programs.clientId, client.id));
      const current = activeProgram.find((p) => p.status === "active") ?? null;

      return { client, currentProgram: current, programs: activeProgram };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/",
    async ({ body, status }) => {
      const trainerId = await getDefaultTrainerId();
      const [created] = await db
        .insert(clients)
        .values({ ...body, trainerId })
        .returning();
      return status(201, created);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        email: t.String({ format: "email" }),
        goals: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        limitations: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        daysPerWeek: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 7 }), t.Null()])),
        trainingDays: t.Optional(
          t.Union([t.Array(t.Integer({ minimum: 1, maximum: 7 }), { uniqueItems: true }), t.Null()])
        ),
      }),
    }
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const [updated] = await db
        .update(clients)
        .set(body)
        .where(eq(clients.id, params.id))
        .returning();
      if (!updated) return status(404, { error: "client not found" });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        goals: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        limitations: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        daysPerWeek: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 7 }), t.Null()])),
        trainingDays: t.Optional(
          t.Union([t.Array(t.Integer({ minimum: 1, maximum: 7 }), { uniqueItems: true }), t.Null()])
        ),
        status: t.Optional(t.Union([t.Literal("active"), t.Literal("paused"), t.Literal("archived")])),
      }),
    }
  );
