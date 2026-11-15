import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { clientSessions, clients, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, createClientSession, deleteClientSessions } from "./lib/client-auth";
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
