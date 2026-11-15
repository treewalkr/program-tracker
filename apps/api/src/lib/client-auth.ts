import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { clientSessions, clients, db, trainers } from "@pt/db";
import { authConfig, randomToken, secureCookies, sha256 } from "./auth";
import { appUrl } from "./email-links";

/**
 * Client portal sign-in. A trainer turns the portal on per client; the client
 * then signs in with Google (their `clients.email` is the invite) or with a
 * reusable access link (`clients.portal_token`). Sessions mirror the trainer's
 * `auth_sessions`: an opaque token in the httpOnly `pt_client` cookie, its
 * sha256 in `client_sessions`. A separate cookie, so a trainer can try their
 * client's view in the same browser.
 */

export const CLIENT_COOKIE = "pt_client";
export const CLIENT_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Secure whenever the app is served over https — with or without Google configured. */
export const clientCookieSecure = () => secureCookies(authConfig()) || appUrl().startsWith("https://");

/** The client's personal access link. */
export const portalLink = (token: string) => `${appUrl()}/me/link/${encodeURIComponent(token)}`;

/** A client can use the portal while it's on, they aren't archived, and their trainer isn't disabled. */
const portalOpen = and(isNotNull(clients.portalEnabledAt), ne(clients.status, "archived"), isNull(trainers.disabledAt));

/** New portal session for a client; returns the raw cookie token. */
export async function createClientSession(clientId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + CLIENT_SESSION_TTL_MS);
  await db.insert(clientSessions).values({ id: await sha256(token), clientId, expiresAt });
  return { token, expiresAt };
}

export interface SessionClient {
  clientId: string;
  trainerId: string;
}

/** The signed-in client for a cookie token, or null when missing, expired, or the portal is closed to them. */
export async function clientForToken(token: string | undefined): Promise<SessionClient | null> {
  if (!token) return null;
  const [row] = await db
    .select({ clientId: clients.id, trainerId: clients.trainerId })
    .from(clientSessions)
    .innerJoin(clients, eq(clients.id, clientSessions.clientId))
    .innerJoin(trainers, eq(trainers.id, clients.trainerId))
    .where(and(eq(clientSessions.id, await sha256(token)), gt(clientSessions.expiresAt, new Date()), portalOpen))
    .limit(1);
  return row ?? null;
}

export async function deleteClientSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(clientSessions).where(eq(clientSessions.id, await sha256(token)));
}

/** Sign a client out everywhere (link reset, portal off). */
export async function deleteClientSessions(clientId: string): Promise<void> {
  await db.delete(clientSessions).where(eq(clientSessions.clientId, clientId));
}

/** Who an access link opens the portal for, or null when the token is unknown or the portal is closed. */
export async function clientForLink(
  token: string
): Promise<{ clientId: string; clientFirstName: string; trainerName: string } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ clientId: clients.id, name: clients.name, trainerName: trainers.name })
    .from(clients)
    .innerJoin(trainers, eq(trainers.id, clients.trainerId))
    .where(and(eq(clients.portalToken, token), portalOpen))
    .limit(1);
  return row ? { clientId: row.clientId, clientFirstName: firstName(row.name), trainerName: row.trainerName } : null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** A fresh access-link secret. */
export const newPortalToken = randomToken;
