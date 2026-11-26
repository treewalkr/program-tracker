import { and, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authSessions, db, feedbackItems, impersonations, trainers } from "@pt/db";
import { flagEnabled } from "./flags";

/**
 * Google sign-in for invited trainers.
 *
 * The platform admin (ADMIN_EMAIL) can always sign in; their first sign-in
 * claims the original single-tenant trainer row so existing data stays put.
 * Everyone else needs a trainer row the admin created for their email, and
 * that row must not be disabled. Sessions are opaque random tokens in an
 * httpOnly cookie; the DB keeps only their sha256.
 */

export const SESSION_COOKIE = "pt_session";
export const OAUTH_COOKIE = "pt_oauth";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** The platform admin's Google email (lowercased). */
  adminEmail: string;
}

/** Auth is on unless AUTH_DISABLED=true (tests, local hacking). */
export const authDisabled = () => process.env.AUTH_DISABLED === "true";

/**
 * An in-app path to go back to after sign-in, else "/". Only a plain "/path": never
 * "//host" or "/\host" (browsers read a backslash as "/", so both leave the site), and no
 * control characters (a browser drops a tab, so "/\t/host" would become "//host").
 */
export const safeReturnTo = (v: string | null | undefined): string =>
  v && v.startsWith("/") && !/[\\\u0000-\u001f\u007f]/.test(v) && !v.startsWith("//") ? v : "/";

/**
 * Why AUTH_DISABLED=true must not be honoured here, or null when it's off or this is
 * plainly a local setup. With auth off every request acts as the first trainer, an
 * admin, so a stray env var on a deployed API would open every member's data: the
 * API refuses to start instead (index.ts). Local means a database on localhost or a
 * dotless Docker service name ("postgres"); a hosted database has a dotted host.
 */
export function authBypassProblem(env: Record<string, string | undefined>): string | null {
  if (env.AUTH_DISABLED !== "true") return null;
  if (env.NODE_ENV === "production") return "NODE_ENV is production";
  if (env.GOOGLE_CLIENT_ID?.trim()) return "Google sign-in is configured";
  let host = "";
  try {
    host = new URL(env.DATABASE_URL ?? "").hostname;
  } catch {
    return "DATABASE_URL is missing or unreadable";
  }
  const local = host === "localhost" || host === "::1" || host === "[::1]" || /^127\./.test(host) || (host !== "" && !host.includes("."));
  return local ? null : `DATABASE_URL points at ${host}, not a local database`;
}

/** null when Google sign-in is not configured. */
export function authConfig(): AuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const adminEmail = adminEmailFromEnv();
  if (!clientId || !clientSecret || !redirectUri || !adminEmail) return null;
  return { clientId, clientSecret, redirectUri, adminEmail };
}

/** ADMIN_EMAIL, falling back to the older single-trainer TRAINER_EMAIL. */
export function adminEmailFromEnv(): string | null {
  return (process.env.ADMIN_EMAIL ?? process.env.TRAINER_EMAIL)?.trim().toLowerCase() || null;
}

export const isAdminEmail = (email: string) => email.toLowerCase() === adminEmailFromEnv();

/** Cookies are Secure whenever the app is served over https. */
export const secureCookies = (cfg: AuthConfig | null) => cfg?.redirectUri.startsWith("https://") ?? false;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

export function googleAuthUrl(cfg: AuthConfig, state: string, codeChallenge: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** Code → access token → OIDC userinfo. Server-to-server over TLS, so no id_token verification needed. */
export async function fetchGoogleProfile(cfg: AuthConfig, code: string, codeVerifier: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`google token exchange failed: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new Error(`google userinfo failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: info.email_verified === true,
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}

// ---------------------------------------------------------------------------
// Trainer + sessions
// ---------------------------------------------------------------------------

export type SignInRejection = "unverified" | "not_allowed" | "disabled";

/**
 * Resolve the trainer for a Google profile, or why they can't sign in.
 * Order: linked google_sub → invited (unlinked) row with this email → for
 * the admin only, the original trainer row if still unlinked, else a fresh
 * row. Name/photo refresh on every sign-in.
 */
export async function claimTrainer(
  cfg: AuthConfig,
  profile: GoogleProfile,
): Promise<{ trainerId: string } | { rejection: SignInRejection }> {
  if (!profile.emailVerified) return { rejection: "unverified" };
  const admin = profile.email === cfg.adminEmail;

  const select = () =>
    db.select({ id: trainers.id, disabledAt: trainers.disabledAt, googleSub: trainers.googleSub }).from(trainers);
  const [linked] = await select().where(eq(trainers.googleSub, profile.sub)).limit(1);
  const [invited] = linked ? [] : await select().where(and(eq(trainers.email, profile.email), isNull(trainers.googleSub))).limit(1);
  const [original] =
    linked || invited || !admin ? [] : await select().orderBy(trainers.createdAt).limit(1);
  const target = linked ?? invited ?? (original && !original.googleSub ? original : undefined);

  const patch = {
    googleSub: profile.sub,
    email: profile.email,
    avatarUrl: profile.picture,
    lastSignInAt: new Date(),
    ...(profile.name ? { name: profile.name } : {}),
  };

  if (target) {
    // the admin can't be locked out of their own console
    if (target.disabledAt && !admin) return { rejection: "disabled" };
    await db.update(trainers).set(admin ? { ...patch, disabledAt: null } : patch).where(eq(trainers.id, target.id));
    return { trainerId: target.id };
  }
  if (!admin) return { rejection: "not_allowed" };
  const [created] = await db
    .insert(trainers)
    .values({ ...patch, name: profile.name ?? profile.email })
    .returning({ id: trainers.id });
  return { trainerId: created.id };
}

/** New session for a trainer; returns the raw cookie token. */
export async function createSession(trainerId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSessions).values({ id: await sha256(token), trainerId, expiresAt });
  return { token, expiresAt };
}

export interface SessionTrainer {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

/** Why a view that is still on the session no longer applies. */
export type ViewEnded = "expired" | "flag_off" | "disabled";

/** "View as trainer" state stored on a session (live or not). */
export interface ActingView {
  impersonationId: string | null;
  trainer: { id: string; name: string; email: string; avatarUrl: string | null };
  ticket: { id: string; number: number; route: string } | null;
  until: Date;
  /** Allow-edits unlock; writes go through while this is in the future. */
  writesUntil: Date | null;
}

export interface ResolvedSession {
  /** sha256 of the cookie token = `auth_sessions.id`. */
  sessionId: string;
  /** Who is really signed in. */
  actor: SessionTrainer;
  /** The view stored on the session, live or ended; null when not viewing as anyone. */
  view: ActingView | null;
  /** null while the view is live (or there is none); else why it stopped applying. */
  ended: ViewEnded | null;
}

const actingTrainers = alias(trainers, "acting_trainer");

/**
 * The session behind a cookie token, with any "view as trainer" on it, or null
 * when missing, expired or the signed-in trainer is disabled. Never writes:
 * a view past its time, with the flag off, on a disabled trainer or by someone
 * who is no longer the admin just reports `ended` and stops applying.
 */
export async function resolveSession(token: string | undefined, now = new Date()): Promise<ResolvedSession | null> {
  if (!token) return null;
  const sessionId = await sha256(token);
  const [row] = await db
    .select({
      actor: { id: trainers.id, name: trainers.name, email: trainers.email, avatarUrl: trainers.avatarUrl },
      actingUntil: authSessions.actingUntil,
      actingWritesUntil: authSessions.actingWritesUntil,
      impersonationId: authSessions.impersonationId,
      acting: {
        id: actingTrainers.id,
        name: actingTrainers.name,
        email: actingTrainers.email,
        avatarUrl: actingTrainers.avatarUrl,
        disabledAt: actingTrainers.disabledAt,
      },
      ticket: { id: feedbackItems.id, number: feedbackItems.number, route: feedbackItems.route },
    })
    .from(authSessions)
    .innerJoin(trainers, eq(trainers.id, authSessions.trainerId))
    .leftJoin(actingTrainers, eq(actingTrainers.id, authSessions.actingAsTrainerId))
    .leftJoin(impersonations, eq(impersonations.id, authSessions.impersonationId))
    .leftJoin(feedbackItems, eq(feedbackItems.id, impersonations.ticketId))
    .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, now), isNull(trainers.disabledAt)))
    .limit(1);
  if (!row) return null;
  const actor = { ...row.actor, isAdmin: isAdminEmail(row.actor.email) };
  if (!row.acting?.id || !row.actingUntil) return { sessionId, actor, view: null, ended: null };
  const { disabledAt, ...acting } = row.acting;
  const view: ActingView = {
    impersonationId: row.impersonationId,
    trainer: acting,
    ticket: row.ticket?.id ? row.ticket : null,
    until: row.actingUntil,
    writesUntil: row.actingWritesUntil,
  };
  const ended: ViewEnded | null = !(await flagEnabled("impersonation"))
    ? "flag_off"
    : disabledAt
      ? "disabled"
      : !actor.isAdmin || row.actingUntil <= now
        ? "expired"
        : null;
  return { sessionId, actor, view, ended };
}

/** Writes go through during a live view only while Allow edits is on. */
export const viewWritable = (view: ActingView, now = new Date()) =>
  view.writesUntil !== null && view.writesUntil > now && view.until > now;

/** The trainer whose account the session sees: the viewed trainer during a live view, else the signed-in one. */
export async function trainerForToken(token: string | undefined): Promise<SessionTrainer | null> {
  const session = await resolveSession(token);
  if (!session) return null;
  return session.view && !session.ended ? { ...session.view.trainer, isAdmin: false } : session.actor;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(authSessions).where(eq(authSessions.id, await sha256(token)));
}

/** Sign a trainer out everywhere (used when the admin disables them). */
export async function deleteTrainerSessions(trainerId: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.trainerId, trainerId));
}
