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
  secureCookies,
  sha256,
  trainerForToken,
} from "../lib/auth";

const OAUTH_TTL_S = 10 * 60;

/** Only same-app paths — never `//evil.com` or absolute URLs. */
const safeReturnTo = (v: string | undefined) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

const loginError = (code: string) => `/login?error=${code}`;

/**
 * Google sign-in for invited trainers. The browser navigates to
 * /v1/auth/google (not Eden — it's a redirect), Google calls back, and the
 * API sets an httpOnly session cookie before sending the trainer home.
 */
export const authRoutes = new Elysia({ prefix: "/v1/auth", tags: ["auth"] })
  .get(
    "/me",
    async ({ cookie, status }) => {
      if (authDisabled()) return { trainer: null, authDisabled: true };
      const trainer = await trainerForToken(cookie[SESSION_COOKIE].value as string | undefined);
      if (!trainer) return status(401, { error: "signed out" });
      return { trainer, authDisabled: false };
    },
    { detail: { summary: "Current signed-in trainer" } },
  )
  .get(
    "/google",
    async ({ cookie, query, redirect }) => {
      const cfg = authConfig();
      if (!cfg) return redirect(loginError("not_configured"));
      const state = randomToken();
      const verifier = randomToken();
      cookie[OAUTH_COOKIE].set({
        value: JSON.stringify({ state, verifier, returnTo: safeReturnTo(query.returnTo) }),
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies(cfg),
        path: "/v1/auth",
        maxAge: OAUTH_TTL_S,
      });
      return redirect(googleAuthUrl(cfg, state, await sha256(verifier)));
    },
    {
      query: t.Object({ returnTo: t.Optional(t.String()) }),
      detail: { summary: "Start Google sign-in (browser redirect)" },
    },
  )
  .get(
    "/google/callback",
    async ({ cookie, query, redirect }) => {
      const cfg = authConfig();
      if (!cfg) return redirect(loginError("not_configured"));

      const raw = cookie[OAUTH_COOKIE].value;
      cookie[OAUTH_COOKIE].remove();
      if (query.error) return redirect(loginError("cancelled"));

      let pending: { state: string; verifier: string; returnTo: string } | null = null;
      try {
        pending = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof pending);
      } catch {
        pending = null;
      }
      if (!pending || !query.code || query.state !== pending.state) return redirect(loginError("expired"));

      let trainerId: string;
      try {
        const profile = await fetchGoogleProfile(cfg, query.code, pending.verifier);
        const claim = await claimTrainer(cfg, profile);
        if ("rejection" in claim) return redirect(loginError(claim.rejection));
        trainerId = claim.trainerId;
      } catch (err) {
        console.error("[auth] google callback failed:", err);
        return redirect(loginError("google_failed"));
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
      await deleteSession(cookie[SESSION_COOKIE].value as string | undefined);
      cookie[SESSION_COOKIE].remove();
      return { ok: true };
    },
    { detail: { summary: "Sign out" } },
  );
