import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray, like, sql } from "drizzle-orm";
import {
  appSettings,
  authSessions,
  chatMessages,
  clients,
  db,
  emailLog,
  exercises,
  feedbackComments,
  feedbackItems,
  impersonations,
  impersonationWrites,
  programs,
  sessionLogs,
  setLogs,
  trainers,
} from "@pt/db";
import { FEEDBACK_VIEWED_NOTE, feedbackHandle, unpinnedContext, type ProgramWeek } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { claimTrainer, createSession, sha256, SESSION_COOKIE, type AuthConfig, type GoogleProfile } from "./lib/auth";
import { setFlag } from "./lib/flags";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { getDefaultTrainerId } from "./lib/trainer";
import { settleImpersonationWrites } from "./lib/trainer-context";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping impersonation DB tests");
}

const ADMIN = "boss@example.com";
const KAI = "imp-kai@example.com";
const cfg: AuthConfig = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "http://localhost:5173/v1/auth/google/callback",
  adminEmail: ADMIN,
};
const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: "sub-admin",
  email: ADMIN,
  emailVerified: true,
  name: "The Boss",
  picture: null,
  ...over,
});

const call = (method: string, path: string, token?: string, body?: unknown) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
const get = (path: string, token?: string) => call("GET", path, token);

const MIN = 60_000;

describe.skipIf(!dbUp)("view as trainer", () => {
  const env = {
    AUTH_DISABLED: "false",
    GOOGLE_CLIENT_ID: cfg.clientId,
    GOOGLE_CLIENT_SECRET: cfg.clientSecret,
    GOOGLE_REDIRECT_URI: cfg.redirectUri,
    ADMIN_EMAIL: ADMIN,
    IMPERSONATION: undefined as string | undefined,
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  let adminId = "";
  let adminBefore: typeof trainers.$inferSelect;
  let kaiId = "";
  let kaiClientId = "";
  let adminClientId = "";

  /** A fresh admin session token. */
  const adminToken = async () => {
    const claim = await claimTrainer(cfg, profile());
    if (!("trainerId" in claim)) throw new Error("admin claim failed");
    return (await createSession(claim.trainerId)).token;
  };

  /** Puts a session into a view of Kai directly (the start route comes later). */
  const actAsKai = async (token: string, over: Partial<typeof authSessions.$inferInsert> = {}) => {
    const [row] = await db.insert(impersonations).values({ adminId, trainerId: kaiId }).returning({ id: impersonations.id });
    await db
      .update(authSessions)
      .set({ actingAsTrainerId: kaiId, actingUntil: new Date(Date.now() + 30 * MIN), impersonationId: row.id, ...over })
      .where(eq(authSessions.id, await sha256(token)));
    return row.id;
  };

  beforeAll(async () => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    adminId = await getDefaultTrainerId();
    [adminBefore] = await db.select().from(trainers).where(eq(trainers.id, adminId));
    await db.delete(trainers).where(eq(trainers.email, KAI));
    const [kai] = await db.insert(trainers).values({ name: "Kai Tan", email: KAI, googleSub: "sub-imp-kai" }).returning();
    kaiId = kai.id;
    const [kc, ac] = await db
      .insert(clients)
      .values([
        { trainerId: kaiId, name: "ZZ Kai's client" },
        { trainerId: adminId, name: "ZZ Admin's client" },
      ])
      .returning();
    kaiClientId = kc.id;
    adminClientId = ac.id;
  });
  afterAll(async () => {
    await db.delete(clients).where(eq(clients.id, adminClientId));
    await db.delete(trainers).where(eq(trainers.email, KAI));
    await db.update(trainers).set(adminBefore).where(eq(trainers.id, adminId));
    await db.delete(appSettings).where(like(appSettings.key, "flag:%"));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  beforeEach(async () => {
    delete process.env.IMPERSONATION;
    await setFlag("impersonation", true, null);
  });

  const clientIds = async (token: string) => ((await (await get("/v1/clients", token)).json()) as { id: string }[]).map((c) => c.id);

  test("a live view scopes every route to the trainer and drops admin rights", async () => {
    const token = await adminToken();
    expect(await clientIds(token)).toContain(adminClientId);
    await actAsKai(token);

    const ids = await clientIds(token);
    expect(ids).toContain(kaiClientId);
    expect(ids).not.toContain(adminClientId);
    expect((await get(`/v1/clients/${adminClientId}`, token)).status).toBe(404);
    expect((await get(`/v1/clients/${kaiClientId}`, token)).status).toBe(200);
    expect((await get("/v1/admin/trainers", token)).status).toBe(403);
    expect(((await (await get("/v1/account/notifications", token)).json()) as { isAdmin: boolean }).isAdmin).toBe(false);
  });

  test("writes answer 403 read-only while viewing; Allow edits lets them through", async () => {
    const token = await adminToken();
    await actAsKai(token);
    const res = await call("POST", "/v1/clients", token, { name: "ZZ Should not exist" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "read-only while viewing as Kai" });
    expect((await call("PATCH", `/v1/clients/${kaiClientId}`, token, { name: "renamed" })).status).toBe(403);
    expect((await call("DELETE", "/v1/account/deload", token)).status).toBe(403);
    expect((await db.select().from(clients).where(eq(clients.name, "ZZ Should not exist"))).length).toBe(0);

    await db
      .update(authSessions)
      .set({ actingWritesUntil: new Date(Date.now() + 10 * MIN) })
      .where(eq(authSessions.id, await sha256(token)));
    const ok = await call("PATCH", `/v1/clients/${kaiClientId}`, token, { name: "ZZ Kai's client" });
    expect(ok.status).toBe(200);
  });

  test("a view past its time falls back to the admin", async () => {
    const token = await adminToken();
    await actAsKai(token, { actingUntil: new Date(Date.now() - 1000) });
    expect(await clientIds(token)).toContain(adminClientId);
    expect((await get("/v1/admin/trainers", token)).status).toBe(200);
  });

  test("turning the flag off (or the env kill switch) ends a view mid-session", async () => {
    const token = await adminToken();
    await actAsKai(token);
    expect(await clientIds(token)).toContain(kaiClientId);

    await setFlag("impersonation", false, null);
    expect(await clientIds(token)).toContain(adminClientId);

    await setFlag("impersonation", true, null);
    process.env.IMPERSONATION = "off";
    expect(await clientIds(token)).toContain(adminClientId);
    delete process.env.IMPERSONATION;
    expect(await clientIds(token)).toContain(kaiClientId);
  });

  test("a view of a disabled trainer falls back to the admin", async () => {
    const token = await adminToken();
    await actAsKai(token);
    await db.update(trainers).set({ disabledAt: new Date() }).where(eq(trainers.id, kaiId));
    try {
      expect(await clientIds(token)).toContain(adminClientId);
    } finally {
      await db.update(trainers).set({ disabledAt: null }).where(eq(trainers.id, kaiId));
    }
  });

  test("a non-admin session with view columns set never sees the other account", async () => {
    const [mo] = await db.insert(trainers).values({ name: "ZZ Mo", email: "imp-mo@example.com" }).returning();
    try {
      const token = (await createSession(mo.id)).token;
      await db
        .update(authSessions)
        .set({ actingAsTrainerId: kaiId, actingUntil: new Date(Date.now() + 30 * MIN) })
        .where(eq(authSessions.id, await sha256(token)));
      expect(await clientIds(token)).not.toContain(kaiClientId);
    } finally {
      await db.delete(trainers).where(eq(trainers.id, mo.id));
    }
  });

  const me = async (token: string) =>
    (await (await get("/v1/auth/me", token)).json()) as {
      trainer: { id: string; isAdmin: boolean };
      impersonator: {
        actor: { id: string };
        trainer: { id: string; name: string };
        ticket: { id: string; handle: string } | null;
        until: string;
        writesUntil: string | null;
        ended: string | null;
      } | null;
      flags: { impersonation: boolean };
    };
  const start = (token: string, body: Record<string, unknown>) => call("POST", "/v1/admin/impersonate", token, body);
  const ticketCtx = unpinnedContext("/clients", { viewport: { width: 1, height: 1, dpr: 1 }, userAgent: "t", appVersion: "t" });

  test("the start route 404s with the flag off, and /auth/me says so", async () => {
    const token = await adminToken();
    await setFlag("impersonation", false, null);
    expect((await start(token, { trainerId: kaiId })).status).toBe(404);
    expect((await me(token)).flags.impersonation).toBe(false);
    await setFlag("impersonation", true, null);
    expect((await me(token)).flags.impersonation).toBe(true);
  });

  test("start from a ticket → /auth/me reports the view → stop returns to the ticket", async () => {
    const [ticket] = await db
      .insert(feedbackItems)
      .values({ trainerId: kaiId, comment: "ZZ imp start", route: `/clients/${kaiClientId}`, context: ticketCtx })
      .returning();
    const kaiToken = (await createSession(kaiId)).token;
    try {
      const emailsBefore = (await db.select().from(emailLog)).length;
      const token = await adminToken();
      const res = await start(token, { trainerId: kaiId, ticketId: ticket.id, reason: "FB check" });
      expect(res.status).toBe(200);
      const started = (await res.json()) as { returnTo: string; until: string };
      expect(started.returnTo).toBe(`/clients/${kaiClientId}`);
      expect(new Date(started.until).getTime() - Date.now()).toBeGreaterThan(29 * MIN);

      const view = await me(token);
      expect(view.trainer).toMatchObject({ id: kaiId, isAdmin: false });
      expect(view.impersonator).toMatchObject({
        actor: { id: adminId },
        trainer: { id: kaiId, name: "Kai Tan" },
        ticket: { id: ticket.id, handle: feedbackHandle(ticket.number) },
        writesUntil: null,
        ended: null,
      });
      // no admin rights while viewing, not even to start another view
      expect((await start(token, { trainerId: kaiId })).status).toBe(403);

      // the one trace: a silent public line, no email, no unread badge for Kai
      const lines = await db.select().from(feedbackComments).where(eq(feedbackComments.itemId, ticket.id));
      expect(lines).toEqual([
        expect.objectContaining({ kind: "reply", authorKind: "system", visibility: "public", silent: true, body: FEEDBACK_VIEWED_NOTE, trainerId: null }),
      ]);
      await settleFeedbackNotifications();
      expect((await db.select().from(emailLog)).length).toBe(emailsBefore);
      expect(((await (await get("/v1/feedback/unread", kaiToken)).json()) as { count: number }).count).toBe(0);
      const thread = ((await (await get(`/v1/feedback/${ticket.id}`, kaiToken)).json()) as { thread: { body: string }[] }).thread;
      expect(thread.map((c) => c.body)).toEqual([FEEDBACK_VIEWED_NOTE]);

      const [audit] = await db.select().from(impersonations).where(eq(impersonations.ticketId, ticket.id));
      expect(audit).toMatchObject({ adminId, trainerId: kaiId, reason: "FB check", endedAt: null });

      const stop = await call("POST", "/v1/auth/impersonate/stop", token);
      expect(stop.status).toBe(200);
      expect(await stop.json()).toEqual({ returnTo: `/feedback#${feedbackHandle(ticket.number)}` });
      const after = await me(token);
      expect(after.trainer).toMatchObject({ id: adminId, isAdmin: true });
      expect(after.impersonator).toBeNull();
      const [closed] = await db.select().from(impersonations).where(eq(impersonations.id, audit.id));
      expect(closed.endedBy).toBe("stop");
      expect(closed.endedAt).not.toBeNull();
    } finally {
      await db.delete(feedbackItems).where(eq(feedbackItems.id, ticket.id));
    }
  });

  test("start refuses yourself, a disabled or unknown trainer, and someone else's ticket", async () => {
    const token = await adminToken();
    expect((await start(token, { trainerId: adminId })).status).toBe(409);
    expect((await start(token, { trainerId: crypto.randomUUID() })).status).toBe(404);
    expect((await start(token, { trainerId: "not-a-uuid" })).status).toBe(422);
    expect((await start(token, { trainerId: kaiId, reason: "x".repeat(501) })).status).toBe(422);
    const [adminTicket] = await db
      .insert(feedbackItems)
      .values({ trainerId: adminId, comment: "ZZ admin's own", route: "/", context: ticketCtx })
      .returning();
    try {
      expect((await start(token, { trainerId: kaiId, ticketId: adminTicket.id })).status).toBe(422);
    } finally {
      await db.delete(feedbackItems).where(eq(feedbackItems.id, adminTicket.id));
    }
    await db.update(trainers).set({ disabledAt: new Date() }).where(eq(trainers.id, kaiId));
    try {
      expect((await start(token, { trainerId: kaiId })).status).toBe(409);
    } finally {
      await db.update(trainers).set({ disabledAt: null }).where(eq(trainers.id, kaiId));
    }
    // a view from the trainers table posts nothing and opens on the home page
    const res = await start(token, { trainerId: kaiId });
    expect(await res.json()).toMatchObject({ returnTo: "/" });
    expect(await (await call("POST", "/v1/auth/impersonate/stop", token)).json()).toEqual({ returnTo: "/admin" });
  });

  test("an expired view reports ended; stop records why", async () => {
    const token = await adminToken();
    const id = await actAsKai(token, { actingUntil: new Date(Date.now() - 1000) });
    const view = await me(token);
    expect(view.trainer.id).toBe(adminId);
    expect(view.impersonator).toMatchObject({ trainer: { id: kaiId }, ended: "expired" });
    await call("POST", "/v1/auth/impersonate/stop", token);
    const [row] = await db.select().from(impersonations).where(eq(impersonations.id, id));
    expect(row.endedBy).toBe("expired");
    expect((await me(token)).impersonator).toBeNull();
  });

  test("the admin's feature flags list and toggle", async () => {
    const token = await adminToken();
    const list = (await (await get("/v1/admin/flags", token)).json()) as { flags: { name: string; enabled: boolean }[] };
    expect(list.flags).toEqual([expect.objectContaining({ name: "impersonation", enabled: true })]);
    const off = await call("PUT", "/v1/admin/flags/impersonation", token, { on: false });
    expect(await off.json()).toMatchObject({ name: "impersonation", enabled: false, stored: false });
    expect((await call("PUT", "/v1/admin/flags/nope", token, { on: true })).status).toBe(422);
    const kaiToken = (await createSession(kaiId)).token;
    expect((await call("PUT", "/v1/admin/flags/impersonation", kaiToken, { on: true })).status).toBe(403);
  });

  test("Allow edits needs the first name; writes are then recorded, and Lock ends them", async () => {
    const token = await adminToken();
    await start(token, { trainerId: kaiId });
    const allow = (confirm: string) => call("POST", "/v1/auth/impersonate/allow-edits", token, { confirm });
    expect((await allow("Kai Tan")).status).toBe(422);
    expect((await allow("someone")).status).toBe(422);
    const ok = await allow(" kai ");
    expect(ok.status).toBe(200);
    const { writesUntil } = (await ok.json()) as { writesUntil: string };
    const view = (await me(token)).impersonator!;
    expect(view.writesUntil).toBe(writesUntil);
    expect(new Date(writesUntil).getTime()).toBeLessThanOrEqual(new Date(view.until).getTime());
    expect(new Date(writesUntil).getTime() - Date.now()).toBeGreaterThan(9 * MIN);

    expect((await call("PATCH", `/v1/clients/${kaiClientId}`, token, { name: "ZZ Kai's client" })).status).toBe(200);
    expect((await call("PATCH", `/v1/clients/${crypto.randomUUID()}`, token, { name: "x" })).status).toBe(404);
    await settleImpersonationWrites();
    const writes = await db
      .select({ method: impersonationWrites.method, route: impersonationWrites.route, status: impersonationWrites.status })
      .from(impersonationWrites)
      .innerJoin(impersonations, eq(impersonations.id, impersonationWrites.impersonationId))
      .where(eq(impersonations.adminId, adminId));
    expect(writes).toEqual(
      expect.arrayContaining([
        { method: "PATCH", route: "/v1/clients/:id", status: 200 },
        { method: "PATCH", route: "/v1/clients/:id", status: 404 },
      ]),
    );

    expect((await call("POST", "/v1/auth/impersonate/lock", token)).status).toBe(200);
    expect((await me(token)).impersonator!.writesUntil).toBeNull();
    expect((await call("PATCH", `/v1/clients/${kaiClientId}`, token, { name: "x" })).status).toBe(403);
    await call("POST", "/v1/auth/impersonate/stop", token);
    expect((await allow("Kai")).status).toBe(409);
  });

  test("no email leaves while viewing, even with edits allowed", async () => {
    const ENV = { RESEND_API_KEY: "re_test", EMAIL_FROM: "PT <fb@pinroj.com>", APP_URL: "https://pt.test" };
    const savedEnv = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
    const origFetch = globalThis.fetch;
    const sent: string[] = [];
    Object.assign(process.env, ENV);
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("resend.com")) {
        sent.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      }
      return origFetch(input, init);
    }) as typeof fetch;
    const [ticket] = await db
      .insert(feedbackItems)
      .values({ trainerId: kaiId, comment: "ZZ imp email", route: "/", context: ticketCtx })
      .returning();
    try {
      const token = await adminToken();
      await start(token, { trainerId: kaiId, ticketId: ticket.id });
      await call("POST", "/v1/auth/impersonate/allow-edits", token, { confirm: "Kai" });
      expect((await call("POST", `/v1/feedback/${ticket.id}/comments`, token, { body: "as Kai" })).status).toBeLessThan(300);
      await settleFeedbackNotifications();
      expect(sent).toEqual([]);

      // control: the same admin, no longer viewing, replying to Kai's ticket does email Kai
      await call("POST", "/v1/auth/impersonate/stop", token);
      expect((await call("POST", `/v1/feedback/${ticket.id}/comments`, token, { body: "as admin" })).status).toBeLessThan(300);
      await settleFeedbackNotifications();
      expect(sent.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = origFetch;
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await db.delete(feedbackItems).where(eq(feedbackItems.id, ticket.id));
    }
  });

  /**
   * No page load writes while the admin looks: every trainer GET route, called
   * during a view of a trainer with real data, leaves every table as it was.
   * A new GET that writes on load (seeding, marking read…) fails this test.
   */
  test("every trainer GET leaves every table unchanged during a view", async () => {
    // a trainer with data to show, and nothing seeded yet (chains, session types)
    const [ex] = await db
      .insert(exercises)
      .values({ trainerId: kaiId, name: "ZZ Imp squat", primaryMuscleGroup: "quads", equipment: "barbell" })
      .returning();
    const week = (n: number): ProgramWeek => ({
      week: n,
      sessions: [
        {
          id: crypto.randomUUID(),
          name: `Lower ${n}`,
          seq: 1,
          weekday: 1,
          order: 0,
          kind: "exercises",
          exercises: [
            { id: crypto.randomUUID(), exerciseId: ex.id, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
          ],
        },
      ],
    });
    const [program] = await db
      .insert(programs)
      .values({
        trainerId: kaiId,
        clientId: kaiClientId,
        name: "ZZ Imp block",
        status: "active",
        sessions: [1, 2, 3, 4].map(week),
        activatedAt: new Date(Date.now() - 15 * 86_400_000),
      })
      .returning();
    const today = new Date().toISOString().slice(0, 10);
    const [log] = await db
      .insert(sessionLogs)
      .values({ clientId: kaiClientId, programId: program.id, date: today })
      .returning();
    await db.insert(setLogs).values({ sessionLogId: log.id, exerciseId: ex.id, setNumber: 1, reps: 5 });
    const ctx = unpinnedContext("/clients", { viewport: { width: 1, height: 1, dpr: 1 }, userAgent: "t", appVersion: "t" });
    const [ticket] = await db
      .insert(feedbackItems)
      .values({ trainerId: kaiId, comment: "ZZ imp ticket", route: "/clients", context: ctx })
      .returning();
    await db.insert(chatMessages).values({ trainerId: kaiId, clientId: kaiClientId, role: "trainer", content: "hi" });

    const token = await adminToken();
    await actAsKai(token);

    const ids: Record<string, string> = {
      clientId: kaiClientId,
      programId: program.id,
      id: crypto.randomUUID(),
      attachmentId: crypto.randomUUID(),
      signalId: "x",
    };
    /** The id a `:param` stands for on this route. */
    const idFor = (path: string, param: string) => {
      if (param !== "id") return ids[param] ?? crypto.randomUUID();
      if (path.startsWith("/v1/clients/")) return kaiClientId;
      if (path.startsWith("/v1/programs/")) return program.id;
      if (path.startsWith("/v1/feedback/")) return ticket.id;
      if (path.startsWith("/v1/exercises/")) return ex.id;
      return crypto.randomUUID();
    };
    const query = `clientId=${kaiClientId}&subjectIds=${program.id}&programId=${program.id}`;
    const OUTSIDE = /^\/v1\/(auth|public|email|agent|portal|me)\b|^\/v1\/meta$|^\/(health|openapi)/;
    const routes = app.routes.filter((r) => r.method === "GET" && r.path.startsWith("/v1/") && !OUTSIDE.test(r.path));
    expect(routes.length).toBeGreaterThan(40);

    const tables = (await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('request_logs', '__drizzle_migrations')
      order by table_name`)).map((r) => r.table_name);
    /** One fingerprint per table: every row, as text, hashed. */
    const snapshot = async () => {
      const out: Record<string, string> = {};
      for (const t of tables) {
        const [row] = await db.execute<{ h: string | null }>(
          sql`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${sql.identifier(t)} x`,
        );
        out[t] = row.h ?? "";
      }
      return out;
    };

    try {
      const before = await snapshot();
      const statuses: string[] = [];
      for (const r of routes) {
        const path = r.path.replace(/:(\w+)/g, (_, p: string) => idFor(r.path, p));
        const res = await get(`${path}?${query}`, token);
        await res.arrayBuffer();
        statuses.push(`${res.status} ${r.path}`);
        expect(res.status, `${r.path} answered ${res.status}`).toBeLessThan(500);
      }
      // the sweep really reached the seeding routes as Kai
      expect(statuses).toContain("200 /v1/chains/");
      expect(statuses).toContain("200 /v1/session-types/");
      expect(statuses).toContain("200 /v1/feedback/:id");
      expect(await snapshot()).toEqual(before);

      // and the seeded defaults still came back, unsaved
      const types = (await (await get("/v1/session-types", token)).json()) as unknown[];
      expect(types.length).toBeGreaterThan(0);
      const { chains } = (await (await get("/v1/chains", token)).json()) as { chains: unknown[] };
      expect(chains.length).toBeGreaterThan(0);
    } finally {
      await db.delete(feedbackItems).where(eq(feedbackItems.id, ticket.id));
      await db.delete(programs).where(eq(programs.id, program.id));
      await db.delete(exercises).where(inArray(exercises.id, [ex.id]));
    }
  });
});
