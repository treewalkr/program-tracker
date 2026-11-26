import { MEMBER_NOT_FOUND } from "../lib/messages";
import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, clients, programs, type ClientRow } from "@pt/db";
import { trainerContext } from "../lib/trainer-context";
import { toProgramDto } from "./programs";
import { clientDto, trainerDeloadSettings } from "../lib/deload";
import { clientRoster } from "../lib/roster";
import { ClientModel } from "../models/clients";
import { ProgramModel } from "../models/programs";
import { ErrorBody } from "../models/shared";
import { deleteClientSessions, newPortalToken, portalLink } from "../lib/client-auth";
import {
  birthDateError,
  startedOnError,
  DeloadSettings,
  DEFAULT_PAGE_LIMIT,
  PAGE_LIMITS,
  isPageLimit,
  ROSTER_SORTS,
  ROSTER_STATUSES,
} from "@pt/shared";

/** `""` is stored as NULL. */
const normEmail = <B extends { email?: string | null }>(body: B): B =>
  body.email === "" ? { ...body, email: null } : body;

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

/** The trainer's view of a client's portal access. */
const PortalStatus = t.Object({
  enabled: t.Boolean(),
  /** The personal access link; null while the portal is off. */
  link: t.Nullable(t.String()),
  /** The client has signed in with Google at least once. */
  googleLinked: t.Boolean(),
  email: t.Nullable(t.String()),
  lastSeenAt: t.Nullable(t.Date()),
});

const portalStatus = (c: ClientRow) => ({
  enabled: c.portalEnabledAt != null,
  link: c.portalEnabledAt != null && c.portalToken ? portalLink(c.portalToken) : null,
  googleLinked: c.portalGoogleSub != null,
  email: c.email,
  lastSeenAt: c.portalLastSeenAt,
});

/** Everything that switches a client's portal off. `deleteClientSessions` signs them out as well. */
const PORTAL_OFF = { portalEnabledAt: null, portalToken: null, portalGoogleSub: null } as const;

export const clientRoutes = new Elysia({ prefix: "/v1/clients", tags: ["clients"] })
  .use(trainerContext)
  .get("/", async ({ trainerId }) => {
    const rows = await db.select().from(clients).where(eq(clients.trainerId, trainerId));
    const mine = await trainerDeloadSettings(trainerId);
    return rows.map((c) => clientDto(c, mine));
  }, { response: t.Array(ClientModel.dto) })
  // Before "/:id", so "roster" is never read as a client id.
  .get(
    "/roster",
    ({ query, status, trainerId }) => {
      const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
      if (!isPageLimit(limit)) return status(422, { error: `limit must be one of ${PAGE_LIMITS.join(", ")}` });
      return clientRoster(trainerId, {
        q: query.q,
        status: query.status ?? "all",
        sort: query.sort ?? "name",
        page: query.page ?? 1,
        limit,
      });
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        status: t.Optional(t.UnionEnum(ROSTER_STATUSES)),
        sort: t.Optional(t.UnionEnum(ROSTER_SORTS)),
        page: t.Optional(t.Integer({ minimum: 1 })),
        // A literal union isn't coerced from the query string — checked against PAGE_LIMITS above.
        limit: t.Optional(t.Integer()),
      }),
      detail: { summary: "One page of the client roster with each client's training status" },
    }
  )
  .get(
    "/:id",
    async ({ params, status, trainerId }) => {
      const [client] = await db.select().from(clients).where(eq(clients.id, params.id));
      if (!client) return status(404, { error: MEMBER_NOT_FOUND });

      const activeProgram = await db
        .select()
        .from(programs)
        .where(eq(programs.clientId, client.id));
      const current = activeProgram.find((p) => p.status === "active") ?? null;

      return {
        client: clientDto(client, await trainerDeloadSettings(trainerId)),
        currentProgram: current ? toProgramDto(current) : null,
        programs: activeProgram.map(toProgramDto),
      };
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          client: ClientModel.dto,
          currentProgram: t.Nullable(ProgramModel.dto),
          programs: t.Array(ProgramModel.dto),
        }),
        404: ErrorBody,
      },
    }
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
      return status(201, clientDto(created, await trainerDeloadSettings(trainerId)));
    },
    {
      body: ClientModel.create,
      response: { 201: ClientModel.dto, 422: ErrorBody },
    }
  )
  .patch(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const invalid = basicsError(body);
      if (invalid) return status(422, { error: invalid });
      // Archiving is the delete: it also turns the portal off, in the same write — on the
      // change to archived only, so a later edit of an archived member leaves the portal alone.
      const [before] = await db.select({ status: clients.status }).from(clients).where(eq(clients.id, params.id));
      if (!before) return status(404, { error: MEMBER_NOT_FOUND });
      const archiving = body.status === "archived" && before.status !== "archived";
      const [updated] = await db
        .update(clients)
        .set({ ...normPhone(normEmail(body)), ...(archiving ? PORTAL_OFF : {}) })
        .where(eq(clients.id, params.id))
        .returning();
      if (!updated) return status(404, { error: MEMBER_NOT_FOUND });
      if (archiving) await deleteClientSessions(updated.id);
      return clientDto(updated, await trainerDeloadSettings(trainerId));
    },
    {
      params: t.Object({ id: t.String() }),
      body: ClientModel.update,
      response: { 200: ClientModel.dto, 404: ErrorBody, 422: ErrorBody },
      detail: { summary: "Edit a client; status archived also turns the client portal off" },
    }
  )
  .put(
    "/:id/deload",
    async ({ params, body, status, trainerId }) => {
      const [updated] = await db.update(clients).set({ deloadSettings: body }).where(eq(clients.id, params.id)).returning();
      if (!updated) return status(404, { error: MEMBER_NOT_FOUND });
      return clientDto(updated, await trainerDeloadSettings(trainerId));
    },
    {
      params: t.Object({ id: t.String() }),
      body: DeloadSettings,
      response: { 200: ClientModel.dto, 404: ErrorBody },
      detail: { summary: "Give this client their own deload rule" },
    }
  )
  .delete(
    "/:id/deload",
    async ({ params, status, trainerId }) => {
      const [updated] = await db.update(clients).set({ deloadSettings: null }).where(eq(clients.id, params.id)).returning();
      if (!updated) return status(404, { error: MEMBER_NOT_FOUND });
      return clientDto(updated, await trainerDeloadSettings(trainerId));
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: ClientModel.dto, 404: ErrorBody },
      detail: { summary: "Back to your default deload rule for this client" },
    }
  )
  .get(
    "/:id/portal",
    async ({ params, status }) => {
      const [client] = await db.select().from(clients).where(eq(clients.id, params.id));
      if (!client) return status(404, { error: MEMBER_NOT_FOUND });
      return portalStatus(client);
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: PortalStatus, 404: ErrorBody },
      detail: { summary: "This client's portal access: on/off, the access link, Google and last seen" },
    }
  )
  .post(
    "/:id/portal",
    async ({ params, status }) => {
      const [client] = await db.select().from(clients).where(eq(clients.id, params.id));
      if (!client) return status(404, { error: MEMBER_NOT_FOUND });
      const [updated] = await db
        .update(clients)
        .set({ portalEnabledAt: client.portalEnabledAt ?? new Date(), portalToken: client.portalToken ?? newPortalToken() })
        .where(eq(clients.id, params.id))
        .returning();
      return portalStatus(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: PortalStatus, 404: ErrorBody },
      detail: { summary: "Turn the client portal on (creates the access link)" },
    }
  )
  .post(
    "/:id/portal/reset",
    async ({ params, status }) => {
      const [updated] = await db
        .update(clients)
        .set({ portalToken: newPortalToken() })
        .where(eq(clients.id, params.id))
        .returning();
      if (!updated) return status(404, { error: MEMBER_NOT_FOUND });
      await deleteClientSessions(updated.id);
      return portalStatus(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: PortalStatus, 404: ErrorBody },
      detail: { summary: "New access link; the old one stops working and every portal session signs out" },
    }
  )
  .delete(
    "/:id/portal",
    async ({ params, status }) => {
      const [updated] = await db
        .update(clients)
        .set(PORTAL_OFF)
        .where(eq(clients.id, params.id))
        .returning();
      if (!updated) return status(404, { error: MEMBER_NOT_FOUND });
      await deleteClientSessions(updated.id);
      return portalStatus(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: PortalStatus, 404: ErrorBody },
      detail: { summary: "Turn the client portal off and sign the client out" },
    }
  );
