import { and, eq, gt, isNull } from "drizzle-orm";
import { authSessions, db, trainers } from "@pt/db";

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

/** The signed-in trainer for a cookie token, or null when missing, expired or disabled. */
export async function trainerForToken(token: string | undefined): Promise<SessionTrainer | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: trainers.id, name: trainers.name, email: trainers.email, avatarUrl: trainers.avatarUrl })
    .from(authSessions)
    .innerJoin(trainers, eq(trainers.id, authSessions.trainerId))
    .where(
      and(eq(authSessions.id, await sha256(token)), gt(authSessions.expiresAt, new Date()), isNull(trainers.disabledAt)),
    )
    .limit(1);
  return row ? { ...row, isAdmin: isAdminEmail(row.email) } : null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(authSessions).where(eq(authSessions.id, await sha256(token)));
}

/** Sign a trainer out everywhere (used when the admin disables them). */
export async function deleteTrainerSessions(trainerId: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.trainerId, trainerId));
}
