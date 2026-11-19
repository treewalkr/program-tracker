import { Elysia, t } from "elysia";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  authConfig,
  authDisabled,
  claimTrainer,
  createSession,
  deleteSession,
  fetchGoogleProfile,
  googleAuthUrl,
  randomToken,
  resolveSession,
  secureCookies,
  sha256,
} from "../lib/auth";
import { flagEnabled } from "../lib/flags";
import { allowEdits, impersonatorOf, lockEdits, stopView } from "../lib/impersonation";
import { ImpersonationModel } from "../models/impersonation";
import { CLIENT_COOKIE, claimClient, clientCookieSecure, createClientSession } from "../lib/client-auth";

const OAUTH_TTL_S = 10 * 60;

/** Only same-app paths — never `//evil.com` or absolute URLs. */
const safeReturnTo = (v: string | undefined) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

/** A client only comes back to a portal page: `/me…`, optionally under a `/en` or `/th` language prefix. */
const clientReturnTo = (v: string | undefined) => {
  const path = safeReturnTo(v);
  return /^\/(?:(?:en|th)\/)?me(?:[/?#]|$)/.test(path) ? path : "/me";
};

/** The `/en` or `/th` a return path starts with, so a failed sign-in stays in the visitor's language. */
const langOf = (path: string | undefined) => (path && /^\/(en|th)(?=[/?#]|$)/.exec(path)?.[0]) || "";

const loginError = (code: string, back?: string) => `${langOf(back)}/login?error=${code}`;
/** The client portal's sign-in page — a client never sees the trainer login. */
const clientLoginError = (code: string, back?: string) => `${langOf(back)}/me/login?error=${code}`;

/** Who is signing in: a trainer (default) or a portal client. Rides in the OAuth cookie. */
type SignInAs = "trainer" | "client";

/**
 * Google sign-in for invited trainers. The browser navigates to
 * /v1/auth/google (not Eden — it's a redirect), Google calls back, and the
 * API sets an httpOnly session cookie before sending the trainer home.
 */
export const authRoutes = new Elysia({ prefix: "/v1/auth", tags: ["auth"] })
  .get(
    "/me",
    async ({ cookie, status }) => {
      if (authDisabled()) return { trainer: null, authDisabled: true, impersonator: null, flags: { impersonation: false } };
      const session = await resolveSession(cookie[SESSION_COOKIE].value as string | undefined);
      if (!session) return status(401, { error: "signed out" });
      const live = session.view && !session.ended ? session.view : null;
      return {
        // the trainer whose app this is: the viewed one during a live view
        trainer: live ? { ...live.trainer, isAdmin: false } : session.actor,
        authDisabled: false,
        /** Who is really looking, during (or just after) a view as this trainer. */
        impersonator: impersonatorOf(session),
        /** Admin-only switches the web needs to show or hide whole features. */
        flags: { impersonation: session.actor.isAdmin && (await flagEnabled("impersonation")) },
      };
    },
    { detail: { summary: "Current signed-in trainer (and who is viewing as them)" } },
  )
  /**
   * End a view as a trainer. Here, not under /v1/admin: it reads the raw session,
   * so it works while the admin is the trainer (no admin rights, read-only).
   */
  .post(
    "/impersonate/stop",
    async ({ cookie, status }) => {
      const session = await resolveSession(cookie[SESSION_COOKIE].value as string | undefined);
      if (!session) return status(401, { error: "signed out" });
      return stopView(session);
    },
    {
      response: { 200: ImpersonationModel.stopped, 401: t.Object({ error: t.String() }) },
      detail: { summary: "Stop viewing as a trainer" },
    },
  )
  /** Allow edits for 10 minutes (never past the view): writes go through, each one recorded. Emails still never send. */
  .post(
    "/impersonate/allow-edits",
    async ({ body, cookie, status }) => {
      const session = await resolveSession(cookie[SESSION_COOKIE].value as string | undefined);
      if (!session) return status(401, { error: "signed out" });
      const out = await allowEdits(session, body.confirm);
      if ("error" in out) return status(out.status, { error: out.error });
      return { writesUntil: out.writesUntil.toISOString() };
    },
    {
      body: ImpersonationModel.allowEdits,
      response: {
        200: ImpersonationModel.editsAllowed,
        401: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        422: t.Object({ error: t.String() }),
      },
      detail: { summary: "Allow edits during a view as a trainer (type their first name)" },
    },
  )
  .post(
    "/impersonate/lock",
    async ({ cookie, status }) => {
      const session = await resolveSession(cookie[SESSION_COOKIE].value as string | undefined);
      if (!session) return status(401, { error: "signed out" });
      await lockEdits(session);
      return { ok: true };
    },
    { detail: { summary: "Back to read-only during a view as a trainer" } },
  )
  .get(
    "/google",
    async ({ cookie, query, redirect }) => {
      const as: SignInAs = query.as === "client" ? "client" : "trainer";
      const returnTo = as === "client" ? clientReturnTo(query.returnTo) : safeReturnTo(query.returnTo);
      const cfg = authConfig();
      if (!cfg) return redirect((as === "client" ? clientLoginError : loginError)("not_configured", returnTo));
      const state = randomToken();
      const verifier = randomToken();
      cookie[OAUTH_COOKIE].set({
        value: JSON.stringify({ state, verifier, returnTo, as }),
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies(cfg),
        path: "/v1/auth",
        maxAge: OAUTH_TTL_S,
      });
      return redirect(googleAuthUrl(cfg, state, await sha256(verifier)));
    },
    {
      query: t.Object({
        returnTo: t.Optional(t.String()),
        /** `client` signs a portal client in (same Google app and callback); its `returnTo` must be a portal page. */
        as: t.Optional(t.String()),
      }),
      detail: { summary: "Start Google sign-in (browser redirect); `?as=client` for the client portal" },
    },
  )
  .get(
    "/google/callback",
    async ({ cookie, query, redirect }) => {
      const cfg = authConfig();
      if (!cfg) return redirect(loginError("not_configured"));

      const raw = cookie[OAUTH_COOKIE].value;
      cookie[OAUTH_COOKIE].remove();
      let pending: { state: string; verifier: string; returnTo: string; as?: SignInAs } | null = null;
      try {
        pending = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof pending);
      } catch {
        pending = null;
      }
      // a client's failures land on the portal's sign-in page, a trainer's on /login
      const fail = (code: string) => (pending?.as === "client" ? clientLoginError : loginError)(code, pending?.returnTo);
      if (query.error) return redirect(fail("cancelled"));
      if (!pending || !query.code || query.state !== pending.state) return redirect(fail("expired"));

      if (pending.as === "client") {
        let clientId: string;
        try {
          const profile = await fetchGoogleProfile(cfg, query.code, pending.verifier);
          const claim = await claimClient(profile);
          if ("rejection" in claim) return redirect(fail(claim.rejection));
          clientId = claim.clientId;
        } catch (err) {
          console.error("[auth] client google callback failed:", err);
          return redirect(fail("google_failed"));
        }
        const session = await createClientSession(clientId);
        cookie[CLIENT_COOKIE].set({
          value: session.token,
          httpOnly: true,
          sameSite: "lax",
          secure: clientCookieSecure(),
          path: "/",
          expires: session.expiresAt,
        });
        return redirect(clientReturnTo(pending.returnTo));
      }

      let trainerId: string;
      try {
        const profile = await fetchGoogleProfile(cfg, query.code, pending.verifier);
        const claim = await claimTrainer(cfg, profile);
        if ("rejection" in claim) return redirect(fail(claim.rejection));
        trainerId = claim.trainerId;
      } catch (err) {
        console.error("[auth] google callback failed:", err);
        return redirect(fail("google_failed"));
      }

      const session = await createSession(trainerId);
      cookie[SESSION_COOKIE].set({
        value: session.token,
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies(cfg),
        path: "/",
        expires: session.expiresAt,
      });
      return redirect(safeReturnTo(pending.returnTo));
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
      detail: { summary: "Google OAuth callback" },
    },
  )
  .post(
    "/logout",
    async ({ cookie }) => {
      const token = cookie[SESSION_COOKIE].value as string | undefined;
      // signing out mid-view closes its audit row too
      const session = await resolveSession(token);
      if (session?.view) await stopView(session);
      await deleteSession(token);
      cookie[SESSION_COOKIE].remove();
      return { ok: true };
    },
    { detail: { summary: "Sign out" } },
  );
