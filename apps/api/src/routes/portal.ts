import { Elysia, t } from "elysia";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { clients, db, trainers } from "@pt/db";
import {
  CLIENT_COOKIE,
  clientCookieSecure,
  clientForLink,
  createClientSession,
  deleteClientSession,
} from "../lib/client-auth";
import { clientContext } from "../lib/client-context";
import { ErrorBody } from "../models/shared";

const SEEN_EVERY_MS = 60 * 60 * 1000;

/**
 * The client portal: sign-in by access link, sign-out, and the signed-in
 * client's own view. Mounted before `trainerContext` — a client has no
 * trainer session; `clientContext` scopes every read and write to them.
 */
const portalSignIn = new Elysia({ tags: ["portal"] })
  /** Whose link this is. No side effects — link scanners prefetch GETs. */
  .get(
    "/link/:token",
    async ({ params, status }) => {
      const found = await clientForLink(params.token);
      if (!found) return status(404, { error: "link not found" });
      return { clientFirstName: found.clientFirstName, trainerName: found.trainerName };
    },
    {
      params: t.Object({ token: t.String({ maxLength: 200 }) }),
      response: { 200: t.Object({ clientFirstName: t.String(), trainerName: t.String() }), 404: ErrorBody },
      detail: { summary: "Check a portal access link (no side effects)" },
    },
  )
  /** Open the portal from an access link: sets the client cookie. */
  .post(
    "/link/:token",
    async ({ params, status, cookie }) => {
      const found = await clientForLink(params.token);
      if (!found) return status(404, { error: "link not found" });
      const session = await createClientSession(found.clientId);
      cookie[CLIENT_COOKIE].set({
        value: session.token,
        httpOnly: true,
        sameSite: "lax",
        secure: clientCookieSecure(),
        path: "/",
        expires: session.expiresAt,
      });
      return { ok: true };
    },
    {
      params: t.Object({ token: t.String({ maxLength: 200 }) }),
      response: { 200: t.Object({ ok: t.Boolean() }), 404: ErrorBody },
      detail: { summary: "Sign in to the portal with an access link" },
    },
  )
  .post(
    "/logout",
    async ({ cookie }) => {
      await deleteClientSession(cookie[CLIENT_COOKIE].value as string | undefined);
      cookie[CLIENT_COOKIE].remove();
      return { ok: true };
    },
    { detail: { summary: "Sign out of the portal" } },
  );

export const portalRoutes = new Elysia({ prefix: "/v1/portal", tags: ["portal"] })
  .use(portalSignIn)
  .use(clientContext)
  /** The signed-in client and their trainer; stamps last seen (at most hourly). */
  .get(
    "/me",
    async ({ clientId, status }) => {
      const [row] = await db
        .select({ id: clients.id, name: clients.name, trainerName: trainers.name })
        .from(clients)
        .innerJoin(trainers, eq(trainers.id, clients.trainerId))
        .where(eq(clients.id, clientId));
      if (!row) return status(401, { error: "signed out" });
      const now = new Date();
      await db
        .update(clients)
        .set({ portalLastSeenAt: now })
        .where(
          and(
            eq(clients.id, clientId),
            or(isNull(clients.portalLastSeenAt), lt(clients.portalLastSeenAt, new Date(now.getTime() - SEEN_EVERY_MS))),
          ),
        );
      return { client: { id: row.id, name: row.name }, trainer: { name: row.trainerName } };
    },
    {
      response: {
        200: t.Object({ client: t.Object({ id: t.String(), name: t.String() }), trainer: t.Object({ name: t.String() }) }),
        401: ErrorBody,
      },
      detail: { summary: "The signed-in portal client" },
    },
  );
