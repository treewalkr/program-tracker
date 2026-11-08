import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, clients, programs } from "@pt/db";
import { trainerContext } from "../lib/trainer-context";
import { toProgramDto } from "./programs";
import {
  BODYWEIGHT_KG_RANGE,
  HEIGHT_CM_RANGE,
  PHONE_MAX,
  birthDateError,
  startedOnError,
} from "@pt/shared";

/** exerciseId → { kg, date } (mirrors shared `OneRepMaxes`). */
const OneRepMaxesBody = t.Record(
  t.String({ minLength: 1 }),
  t.Object({
    kg: t.Number({ exclusiveMinimum: 0, maximum: 600 }),
    date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  }),
  { maxProperties: 200 }
);

/** Optional client email — `""` is accepted and stored as NULL. */
const EmailBody = t.Optional(t.Union([t.String({ format: "email" }), t.Literal(""), t.Null()]));
const normEmail = <B extends { email?: string | null }>(body: B): B =>
  body.email === "" ? { ...body, email: null } : body;

const Day = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const nullable = <T extends Parameters<typeof t.Optional>[0]>(schema: T) => t.Optional(t.Union([schema, t.Null()]));

/** Client basics (all optional). Date ranges depend on today, so they're checked in `basicsError`. */
const BasicsBody = {
  experience: nullable(t.Union([t.Literal("beginner"), t.Literal("intermediate"), t.Literal("advanced")])),
  birthDate: nullable(Day),
  sex: nullable(t.Union([t.Literal("female"), t.Literal("male")])),
  bodyweightKg: nullable(t.Number({ minimum: BODYWEIGHT_KG_RANGE.min, maximum: BODYWEIGHT_KG_RANGE.max })),
  heightCm: nullable(t.Number({ minimum: HEIGHT_CM_RANGE.min, maximum: HEIGHT_CM_RANGE.max })),
  startedOn: nullable(Day),
  phone: nullable(t.String({ maxLength: PHONE_MAX })),
};

/** The latest calendar day anywhere right now (UTC+14), so a client's local "today" is never refused. */
const latestToday = () => new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10);

/** Why the body's dates are out of range, or null. */
const basicsError = (body: { birthDate?: string | null; startedOn?: string | null }): string | null => {
  const today = latestToday();
  return (
    (body.birthDate ? birthDateError(body.birthDate, today) : null) ??
    (body.startedOn ? startedOnError(body.startedOn, today) : null)
  );
};

/** A blank phone is stored as NULL; otherwise trimmed. */
const normPhone = <B extends { phone?: string | null }>(body: B): B =>
  typeof body.phone === "string" ? { ...body, phone: body.phone.trim() || null } : body;

export const clientRoutes = new Elysia({ prefix: "/v1/clients", tags: ["clients"] })
  .use(trainerContext)
  .get("/", async ({ trainerId }) => {
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

      return {
        client,
        currentProgram: current ? toProgramDto(current) : null,
        programs: activeProgram.map(toProgramDto),
      };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const invalid = basicsError(body);
      if (invalid) return status(422, { error: invalid });
      const [created] = await db
        .insert(clients)
        .values({ ...normPhone(normEmail(body)), trainerId })
        .returning();
      return status(201, created);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        email: EmailBody,
        goals: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        limitations: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        sessionsPerWeek: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 7 }), t.Null()])),
        trainingDays: t.Optional(
          t.Union([t.Array(t.Integer({ minimum: 1, maximum: 7 }), { uniqueItems: true }), t.Null()])
        ),
        cardioTarget: t.Optional(
          t.Union([
            t.Object({
              unit: t.Union([t.Literal("minutes"), t.Literal("sessions"), t.Literal("zone_minutes")]),
              value: t.Integer({ minimum: 1, maximum: 10000 }),
            }),
            t.Null(),
          ])
        ),
        cardioDays: t.Optional(
          t.Union([t.Array(t.Integer({ minimum: 1, maximum: 7 }), { uniqueItems: true, maxItems: 7 }), t.Null()])
        ),
        longRunDay: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 7 }), t.Null()])),
        oneRepMaxes: t.Optional(t.Union([OneRepMaxesBody, t.Null()])),
        ...BasicsBody,
      }),
    }
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const invalid = basicsError(body);
      if (invalid) return status(422, { error: invalid });
      const [updated] = await db
        .update(clients)
        .set(normPhone(normEmail(body)))
        .where(eq(clients.id, params.id))
        .returning();
      if (!updated) return status(404, { error: "client not found" });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        email: EmailBody,
        goals: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        limitations: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        sessionsPerWeek: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 7 }), t.Null()])),
        trainingDays: t.Optional(
          t.Union([t.Array(t.Integer({ minimum: 1, maximum: 7 }), { uniqueItems: true }), t.Null()])
        ),
        cardioTarget: t.Optional(
          t.Union([
            t.Object({
              unit: t.Union([t.Literal("minutes"), t.Literal("sessions"), t.Literal("zone_minutes")]),
              value: t.Integer({ minimum: 1, maximum: 10000 }),
            }),
            t.Null(),
          ])
        ),
        cardioDays: t.Optional(
          t.Union([t.Array(t.Integer({ minimum: 1, maximum: 7 }), { uniqueItems: true, maxItems: 7 }), t.Null()])
        ),
        longRunDay: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 7 }), t.Null()])),
        oneRepMaxes: t.Optional(t.Union([OneRepMaxesBody, t.Null()])),
        ...BasicsBody,
        status: t.Optional(t.Union([t.Literal("active"), t.Literal("paused"), t.Literal("archived")])),
      }),
    }
  );
