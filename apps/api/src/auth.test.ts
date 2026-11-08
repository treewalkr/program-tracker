import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { clients, db, exercises, programs, trainers } from "@pt/db";
import type { ProgramWeek } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { claimTrainer, createSession, SESSION_COOKIE, trainerForToken, type AuthConfig, type GoogleProfile } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping auth DB tests");
}

const ADMIN = "boss@example.com";
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
  picture: "https://example.com/p.png",
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

const TEST_EMAILS = ["kai@example.com", "mo@example.com", "nobody@example.com"];

describe.skipIf(!dbUp)("trainer accounts", () => {
  const env = {
    AUTH_DISABLED: "false",
    GOOGLE_CLIENT_ID: cfg.clientId,
    GOOGLE_CLIENT_SECRET: cfg.clientSecret,
    GOOGLE_REDIRECT_URI: cfg.redirectUri,
    ADMIN_EMAIL: ADMIN,
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  let defaultId = "";
  let defaultBefore: typeof trainers.$inferSelect;

  beforeAll(async () => {
    Object.assign(process.env, env);
    defaultId = await getDefaultTrainerId();
    [defaultBefore] = await db.select().from(trainers).where(eq(trainers.id, defaultId));
  });
  afterAll(async () => {
    await db.update(trainers).set(defaultBefore).where(eq(trainers.id, defaultId));
    await db.delete(trainers).where(inArray(trainers.email, TEST_EMAILS));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  beforeEach(async () => {
    await db.delete(trainers).where(inArray(trainers.email, TEST_EMAILS));
  });

  /** Signs the admin in for real: claims the default trainer row. */
  const adminToken = async () => {
    const claim = await claimTrainer(cfg, profile());
    if (!("trainerId" in claim)) throw new Error("admin claim failed");
    expect(claim.trainerId).toBe(defaultId);
    return (await createSession(claim.trainerId)).token;
  };

  test("admin claims the original trainer row; strangers and unverified emails are refused", async () => {
    expect(await claimTrainer(cfg, profile())).toEqual({ trainerId: defaultId });
    expect(await claimTrainer(cfg, profile({ name: "Boss 2" }))).toEqual({ trainerId: defaultId });
    expect(await claimTrainer(cfg, profile({ sub: "x", email: "nobody@example.com" }))).toEqual({ rejection: "not_allowed" });
    expect(await claimTrainer(cfg, profile({ sub: "y", emailVerified: false }))).toEqual({ rejection: "unverified" });
  });

  test("admin adds a trainer; that email can then sign in, and only sees its own data", async () => {
    const admin = await adminToken();
    const added = await call("POST", "/v1/admin/trainers", admin, { name: "Kai", email: "Kai@Example.com" });
    expect(added.status).toBe(201);
    const kai = (await added.json()) as { id: string };
    expect(kai).toMatchObject({ email: "kai@example.com", access: "invited", isAdmin: false });
    expect((await call("POST", "/v1/admin/trainers", admin, { name: "Kai", email: "kai@example.com" })).status).toBe(409);

    const claim = await claimTrainer(cfg, profile({ sub: "sub-kai", email: "kai@example.com", name: "Kai K" }));
    expect(claim).toEqual({ trainerId: kai.id });
    const kaiToken = (await createSession(kai.id)).token;
    expect(((await (await get("/v1/auth/me", kaiToken)).json()) as { trainer: unknown }).trainer).toMatchObject({ id: kai.id, isAdmin: false });

    // the admin's clients are invisible to Kai, by list and by id
    const [adminClient] = await db
      .insert(clients)
      .values({ trainerId: defaultId, name: "Admin's client", email: "c@example.com" })
      .returning();
    const list = (await (await get("/v1/clients", kaiToken)).json()) as { id: string }[];
    expect(list.map((c) => c.id)).not.toContain(adminClient.id);
    expect((await get(`/v1/clients/${adminClient.id}`, kaiToken)).status).toBe(404);
    expect((await get(`/v1/ai/chat?clientId=${adminClient.id}`, kaiToken)).status).toBe(404);
    expect((await get(`/v1/clients/${adminClient.id}`, admin)).status).toBe(200);

    // and the console is admin-only
    expect((await get("/v1/admin/trainers", kaiToken)).status).toBe(403);
    await db.delete(clients).where(eq(clients.id, adminClient.id));
  });

  test("the admin's client directory lists every trainer's clients, without contact details; trainers get 403", async () => {
    const admin = await adminToken();
    const kai = (await (await call("POST", "/v1/admin/trainers", admin, { name: "Kai", email: "kai@example.com" })).json()) as { id: string };
    const kaiToken = (await createSession(kai.id)).token;
    const [mine, theirs] = await db
      .insert(clients)
      .values([
        { trainerId: defaultId, name: "ZZ Admin client", email: "a@example.com", startedOn: "2026-03-02" },
        { trainerId: kai.id, name: "ZZ Kai client", email: "k@example.com", goals: "secret goal" },
      ])
      .returning();
    try {
      const res = await get("/v1/admin/clients", admin);
      expect(res.status).toBe(200);
      const { clients: rows } = (await res.json()) as { clients: Record<string, unknown>[] };
      const a = rows.find((r) => r.id === mine.id);
      const k = rows.find((r) => r.id === theirs.id);
      expect(a).toMatchObject({ name: "ZZ Admin client", clientSince: "2026-03-02", lastSessionAt: null, trainer: { id: defaultId } });
      expect(k).toMatchObject({ name: "ZZ Kai client", status: "active", trainer: { id: kai.id, name: "Kai", access: "invited" } });
      expect(k?.clientSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const field of ["email", "phone", "goals", "limitations", "oneRepMaxes"]) expect(k).not.toHaveProperty(field);

      expect((await get("/v1/admin/clients", kaiToken)).status).toBe(403);
    } finally {
      await db.delete(clients).where(inArray(clients.id, [mine.id, theirs.id]));
    }
  });

  test("the admin's client directory shows each client's active programme and block week", async () => {
    const admin = await adminToken();
    const kai = (await (await call("POST", "/v1/admin/trainers", admin, { name: "Kai", email: "kai@example.com" })).json()) as { id: string };
    const [client] = await db
      .insert(clients)
      .values({ trainerId: kai.id, name: "ZZ Kai programmed", email: "p@example.com", birthDate: "1990-01-01", goals: "secret goal" })
      .returning();
    const [ex] = await db
      .insert(exercises)
      .values({ trainerId: kai.id, name: "ZZ Kai squat", primaryMuscleGroup: "quads", equipment: "barbell" })
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
          kind: "lifting",
          exercises: [{ id: crypto.randomUUID(), exerciseId: ex.id, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    });
    // activated 15 days ago → week 3 of 4
    const [program] = await db
      .insert(programs)
      .values({
        trainerId: kai.id,
        clientId: client.id,
        name: "ZZ Strength block",
        status: "active",
        sessions: [1, 2, 3, 4].map(week),
        activatedAt: new Date(Date.now() - 15 * 86_400_000),
      })
      .returning();
    try {
      const { clients: rows } = (await (await get("/v1/admin/clients", admin)).json()) as { clients: Record<string, unknown>[] };
      expect(rows.find((r) => r.id === client.id)?.programme).toEqual({ id: program.id, name: "ZZ Strength block", week: 3, of: 4, over: false });
    } finally {
      await db.delete(programs).where(eq(programs.id, program.id));
      await db.delete(exercises).where(eq(exercises.id, ex.id));
      await db.delete(clients).where(eq(clients.id, client.id));
    }
  });

  test("disabling a trainer signs them out and blocks the next sign-in", async () => {
    const admin = await adminToken();
    const mo = (await (await call("POST", "/v1/admin/trainers", admin, { name: "Mo", email: "mo@example.com" })).json()) as { id: string };
    await claimTrainer(cfg, profile({ sub: "sub-mo", email: "mo@example.com" }));
    const moToken = (await createSession(mo.id)).token;
    expect((await get("/v1/clients", moToken)).status).toBe(200);

    const off = await call("PATCH", `/v1/admin/trainers/${mo.id}`, admin, { disabled: true });
    expect(((await off.json()) as { access: string }).access).toBe("disabled");
    expect(await trainerForToken(moToken)).toBeNull();
    expect((await get("/v1/clients", moToken)).status).toBe(401);
    expect(await claimTrainer(cfg, profile({ sub: "sub-mo", email: "mo@example.com" }))).toEqual({ rejection: "disabled" });

    expect((await call("PATCH", `/v1/admin/trainers/${mo.id}`, admin, { disabled: false })).status).toBe(200);
    expect(await claimTrainer(cfg, profile({ sub: "sub-mo", email: "mo@example.com" }))).toEqual({ trainerId: mo.id });

    // used accounts can't be deleted; the admin can't be disabled
    expect((await call("DELETE", `/v1/admin/trainers/${mo.id}`, admin)).status).toBe(409);
    expect((await call("PATCH", `/v1/admin/trainers/${defaultId}`, admin, { disabled: true })).status).toBe(409);
  });

  test("an unused invite can be removed", async () => {
    const admin = await adminToken();
    const kai = (await (await call("POST", "/v1/admin/trainers", admin, { name: "Kai", email: "kai@example.com" })).json()) as { id: string };
    expect((await call("DELETE", `/v1/admin/trainers/${kai.id}`, admin)).status).toBe(204);
    expect(await claimTrainer(cfg, profile({ sub: "sub-kai", email: "kai@example.com" }))).toEqual({ rejection: "not_allowed" });
  });

  test("no session → 401 everywhere but health and auth; forged callback state never signs in", async () => {
    expect((await get("/health")).status).toBe(200);
    expect((await get("/v1/clients")).status).toBe(401);
    expect((await get("/v1/admin/trainers")).status).toBe(401);
    expect((await get("/v1/auth/me")).status).toBe(401);
    const res = await get("/v1/auth/google/callback?code=x&state=forged");
    expect(res.headers.get("location")).toBe("/login?error=expired");
  });
});
