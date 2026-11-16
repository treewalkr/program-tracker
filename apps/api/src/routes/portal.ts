import { Elysia, t } from "elysia";
import { z } from "zod";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { clients, db, sessionLogs, trainers } from "@pt/db";
import { addDays, nowOfDate, portalToday, PortalWeekDto } from "@pt/shared";
import {
  CLIENT_COOKIE,
  clientCookieSecure,
  clientForLink,
  createClientSession,
  deleteClientSession,
} from "../lib/client-auth";
import { clientContext } from "../lib/client-context";
import { createSessionLog, deleteSessionLog, refineLogKind, SessionLogFields } from "../lib/log-service";
import { loadPortalWeek, portalWeekContext } from "../lib/portal";
import { ErrorBody } from "../models/shared";

const SEEN_EVERY_MS = 60 * 60 * 1000;

/** A portal log: the trainer's log shape minus who/which program (the session and the
 *  active program say that), always for a planned session, and never "add" beside one. */
const PortalLogInput = SessionLogFields.omit({ clientId: true, programId: true, onDuplicate: true, programSessionId: true })
  .extend({
    programSessionId: z.string().uuid(),
    /** Already logged: 409 (reject) or swap the client's own log (replace). */
    onDuplicate: z.enum(["reject", "replace"]).default("reject"),
    /** The phone's local date: "today" and the block week follow it (within a day of the server's). */
    today: z.string().optional(),
  })
  .superRefine(refineLogKind);

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
  )
  /** The active program's current week (and next, when planned) — a client-safe projection. */
  .get(
    "/week",
    async ({ clientId, query }) => {
      // the phone's date drives the week rollover; one that's off by more than a day is ignored
      const today = portalToday(query.today, Date.now()) ?? portalToday(undefined, Date.now())!;
      return PortalWeekDto.parse(await loadPortalWeek(clientId, nowOfDate(today)));
    },
    {
      query: t.Object({ today: t.Optional(t.String({ maxLength: 10 })) }),
      response: { 200: t.Unsafe<PortalWeekDto>(t.Any()), 401: ErrorBody },
      detail: { summary: "This week and next for the signed-in client" },
    },
  )
  /** Log a session from the portal: current week only, dated today or earlier. */
  .post(
    "/logs",
    async ({ body, status, clientId, trainerId }) => {
      const parsed = PortalLogInput.safeParse(body);
      if (!parsed.success) return status(422, { error: "invalid log", issues: z.treeifyError(parsed.error) });
      const { today: asked, ...input } = parsed.data;
      // "today" is the phone's date (a day either way of the server's); an older app sends none,
      // and keeps the old day of slack
      const today = portalToday(asked, Date.now());
      if (!today) return status(422, { error: "check the date on your phone" });
      const latest = asked ? today : addDays(today, 1);
      const ctx = await portalWeekContext(clientId, nowOfDate(today));
      if (!ctx) return status(422, { error: "no active program" });
      if (!ctx.currentSessionIds.has(input.programSessionId)) {
        return status(422, { error: "only this week's sessions can be logged" });
      }
      if (input.date > latest) return status(422, { error: "date is in the future" });
      // never before the week: an earlier date would move the block's anchor
      if (input.date < ctx.startDate) return status(422, { error: "date is before this week" });

      const result = await createSessionLog({
        trainerId,
        input: { ...input, clientId, programId: ctx.program.id },
        loggedBy: "client",
        replacePolicy: "own",
      });
      switch (result.outcome) {
        case "program_not_found":
        case "program_mismatch":
          return status(422, { error: "no active program" });
        case "unknown_exercises":
          return status(422, { error: "unknown exercises", ids: result.ids });
        case "conflict":
          return status(409, { error: "already logged", existing: result.existing });
      }
      return status(201, {
        id: result.log.id,
        programSessionId: result.log.programSessionId,
        date: result.log.date,
        loggedBy: result.log.loggedBy,
      });
    },
    { body: t.Any(), detail: { summary: "Log a session as the signed-in client" } },
  )
  /** Undo: delete one of the client's own logs, while its session is in this week.
   *  A trainer's log, or anyone else's, is a 404; an earlier week's own log is a 409. */
  .delete(
    "/logs/:id",
    async ({ params, query, status, clientId, trainerId }) => {
      const mine = and(eq(sessionLogs.id, params.id), eq(sessionLogs.clientId, clientId), eq(sessionLogs.loggedBy, "client"));
      const [own] = await db
        .select({ programId: sessionLogs.programId, programSessionId: sessionLogs.programSessionId })
        .from(sessionLogs)
        .where(mine);
      if (!own) return status(404, { error: "log not found" });
      const today = portalToday(query.today, Date.now()) ?? portalToday(undefined, Date.now())!;
      const ctx = await portalWeekContext(clientId, nowOfDate(today));
      const thisWeek = !!ctx && own.programId === ctx.program.id && !!own.programSessionId && ctx.currentSessionIds.has(own.programSessionId);
      if (!thisWeek) return status(409, { error: "only this week's logs can be removed" });
      if (!(await deleteSessionLog(trainerId, mine))) return status(404, { error: "log not found" });
      return status(204);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({ today: t.Optional(t.String({ maxLength: 10 })) }),
      detail: { summary: "Delete one of the client's own logs from this week" },
    },
  );
