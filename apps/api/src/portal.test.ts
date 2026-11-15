import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { clientSessions, clients, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, claimClient, createClientSession, deleteClientSessions } from "./lib/client-auth";
import type { GoogleProfile } from "./lib/auth";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping portal tests");
}

/** A request as a portal client (cookie) — never a trainer session. */
const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(opts.token ? { cookie: `${CLIENT_COOKIE}=${opts.token}` } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text, setCookie: res.headers.get("set-cookie") };
};

const RUN = `portal-${Date.now()}`;

describe.skipIf(!dbUp)("portal sign-in by access link", () => {
  let trainerId = "";
  let clientId = "";
  const token = `${RUN}-link`;

  beforeAll(async () => {
    const [tr] = await db.insert(trainers).values({ name: "Coach Ploy", email: `${RUN}@coach.dev` }).returning();
    trainerId = tr.id;
    const [c] = await db
      .insert(clients)
      .values({ trainerId, name: "Nok Saetang", portalEnabledAt: new Date(), portalToken: token })
      .returning();
    clientId = c.id;
  });
  afterAll(async () => {
    await db.delete(trainers).where(inArray(trainers.id, [trainerId]));
  });

  test("GET on the link only names who it's for — no session, no cookie", async () => {
    const r = await call("GET", `/v1/portal/link/${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ clientFirstName: "Nok", trainerName: "Coach Ploy" });
    expect(r.setCookie).toBeNull();
    expect(await db.select().from(clientSessions).where(eq(clientSessions.clientId, clientId))).toHaveLength(0);
    expect((await call("GET", "/v1/portal/link/nope")).status).toBe(404);
  });

  test("POST on the link sets the client cookie; /me then knows the client", async () => {
    const r = await call("POST", `/v1/portal/link/${token}`);
    expect(r.status).toBe(200);
    expect(r.setCookie).toContain(`${CLIENT_COOKIE}=`);
    expect(r.setCookie?.toLowerCase()).toContain("httponly");
    const cookieToken = /pt_client=([^;]+)/.exec(r.setCookie ?? "")![1];
    const me = await call("GET", "/v1/portal/me", { token: cookieToken });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ client: { id: clientId, name: "Nok Saetang" }, trainer: { name: "Coach Ploy" } });
    const [row] = await db.select().from(clients).where(eq(clients.id, clientId));
    expect(row.portalLastSeenAt).not.toBeNull();
  });

  test("no cookie or a bad cookie is 401, even with AUTH_DISABLED", async () => {
    expect(process.env.AUTH_DISABLED).toBe("true");
    expect((await call("GET", "/v1/portal/me")).status).toBe(401);
    expect((await call("GET", "/v1/portal/me", { token: "garbage" })).status).toBe(401);
  });

  test("a trainer session cookie is not a client session", async () => {
    const res = await app.handle(new Request("http://localhost/v1/portal/me", { headers: { cookie: "pt_session=whatever" } }));
    expect(res.status).toBe(401);
  });

  test("logout ends the session", async () => {
    const { token: t } = await createClientSession(clientId);
    expect((await call("GET", "/v1/portal/me", { token: t })).status).toBe(200);
    expect((await call("POST", "/v1/portal/logout", { token: t })).status).toBe(200);
    expect((await call("GET", "/v1/portal/me", { token: t })).status).toBe(401);
  });

  test("signing out everywhere kills every session", async () => {
    const a = (await createClientSession(clientId)).token;
    const b = (await createClientSession(clientId)).token;
    await deleteClientSessions(clientId);
    expect((await call("GET", "/v1/portal/me", { token: a })).status).toBe(401);
    expect((await call("GET", "/v1/portal/me", { token: b })).status).toBe(401);
  });

  test("portal off, archived client, or disabled trainer: link 404, sessions 401", async () => {
    const t = (await createClientSession(clientId)).token;
    const check = async (expected: "open" | "closed") => {
      const me = await call("GET", "/v1/portal/me", { token: t });
      const link = await call("GET", `/v1/portal/link/${token}`);
      if (expected === "open") {
        expect(me.status).toBe(200);
        expect(link.status).toBe(200);
      } else {
        expect(me.status).toBe(401);
        expect(link.status).toBe(404);
        expect((await call("POST", `/v1/portal/link/${token}`)).status).toBe(404);
      }
    };
    await check("open");
    await db.update(clients).set({ portalEnabledAt: null }).where(eq(clients.id, clientId));
    await check("closed");
    await db.update(clients).set({ portalEnabledAt: new Date(), status: "archived" }).where(eq(clients.id, clientId));
    await check("closed");
    await db.update(clients).set({ status: "active" }).where(eq(clients.id, clientId));
    await db.update(trainers).set({ disabledAt: new Date() }).where(eq(trainers.id, trainerId));
    await check("closed");
    await db.update(trainers).set({ disabledAt: null }).where(eq(trainers.id, trainerId));
    await check("open");
  });
});

describe.skipIf(!dbUp)("portal Google sign-in", () => {
  const RUN_G = `${RUN}-g`;
  const ids: string[] = [];
  const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
    sub: `${RUN_G}-sub`,
    email: `${RUN_G}@client.dev`,
    emailVerified: true,
    name: "Fon",
    picture: null,
    ...over,
  });
  let trainerA = "";
  let trainerB = "";

  beforeAll(async () => {
    const [a] = await db.insert(trainers).values({ name: "Coach A", email: `${RUN_G}-a@coach.dev` }).returning();
    const [b] = await db.insert(trainers).values({ name: "Coach B", email: `${RUN_G}-b@coach.dev` }).returning();
    trainerA = a.id;
    trainerB = b.id;
    ids.push(a.id, b.id);
  });
  afterAll(async () => {
    await db.delete(trainers).where(inArray(trainers.id, ids));
  });

  test("matches by email (case-insensitive) only while the portal is on, then links the Google sub", async () => {
    const [c] = await db
      .insert(clients)
      .values({ trainerId: trainerA, name: "Fon", email: `${RUN_G}@Client.dev` })
      .returning();
    expect(await claimClient(profile())).toEqual({ rejection: "not_allowed" });
    expect(await claimClient(profile({ emailVerified: false }))).toEqual({ rejection: "unverified" });
    await db.update(clients).set({ portalEnabledAt: new Date() }).where(eq(clients.id, c.id));
    expect(await claimClient(profile())).toEqual({ clientId: c.id });
    const [row] = await db.select().from(clients).where(eq(clients.id, c.id));
    expect(row.portalGoogleSub).toBe(`${RUN_G}-sub`);
    // linked: the sub signs in even after the email changes
    await db.update(clients).set({ email: "changed@client.dev" }).where(eq(clients.id, c.id));
    expect(await claimClient(profile({ email: "other@gmail.com" }))).toEqual({ clientId: c.id });
    // a different Google account with the old email doesn't take over the linked client
    expect(await claimClient(profile({ sub: "someone-else" }))).toEqual({ rejection: "not_allowed" });
    await db.delete(clients).where(eq(clients.id, c.id));
  });

  test("two trainers invited the same email: the most recently enabled wins", async () => {
    const email = `${RUN_G}-twice@client.dev`;
    const [older] = await db
      .insert(clients)
      .values({ trainerId: trainerA, name: "Twice", email, portalEnabledAt: new Date(Date.now() - 86400_000) })
      .returning();
    const [newer] = await db
      .insert(clients)
      .values({ trainerId: trainerB, name: "Twice", email, portalEnabledAt: new Date() })
      .returning();
    expect(await claimClient(profile({ sub: `${RUN_G}-twice`, email }))).toEqual({ clientId: newer.id });
    expect(older.id).not.toBe(newer.id);
  });

  test("?as=client keeps the trainer callback and remembers who is signing in", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "cid",
      GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_REDIRECT_URI: "http://localhost:5173/v1/auth/google/callback",
      ADMIN_EMAIL: "boss@example.com",
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const res = await app.handle(new Request("http://localhost/v1/auth/google?as=client"));
      expect(res.status).toBe(302);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.searchParams.get("redirect_uri")).toBe(env.GOOGLE_REDIRECT_URI);
      const oauth = decodeURIComponent(/pt_oauth=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1]);
      expect(JSON.parse(oauth)).toMatchObject({ as: "client", returnTo: "/me" });
      // a cancelled client sign-in lands on the portal's sign-in page
      const cb = await app.handle(
        new Request("http://localhost/v1/auth/google/callback?error=access_denied", {
          headers: { cookie: `pt_oauth=${encodeURIComponent(oauth)}` },
        }),
      );
      expect(cb.headers.get("location")).toBe("/me/login?error=cancelled");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
