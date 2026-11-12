import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { appSettings, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { claimTrainer, createSession, SESSION_COOKIE, type AuthConfig } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ key: appSettings.key }).from(appSettings).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping login theme DB tests");
}

const ADMIN = "boss@example.com";
const TRAINER = "lt-kai@example.com";
const cfg: AuthConfig = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "http://localhost:5173/v1/auth/google/callback",
  adminEmail: ADMIN,
};

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
const readTheme = async () => (await call("GET", "/v1/public/login-theme")).json();

describe.skipIf(!dbUp)("login theme", () => {
  const env = {
    AUTH_DISABLED: "false",
    GOOGLE_CLIENT_ID: cfg.clientId,
    GOOGLE_CLIENT_SECRET: cfg.clientSecret,
    GOOGLE_REDIRECT_URI: cfg.redirectUri,
    ADMIN_EMAIL: ADMIN,
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  let defaultBefore: typeof trainers.$inferSelect;
  let admin = "";
  let kai = "";

  beforeAll(async () => {
    Object.assign(process.env, env);
    const defaultId = await getDefaultTrainerId();
    [defaultBefore] = await db.select().from(trainers).where(eq(trainers.id, defaultId));
    const claim = await claimTrainer(cfg, { sub: "sub-admin", email: ADMIN, emailVerified: true, name: "The Boss", picture: null });
    if (!("trainerId" in claim)) throw new Error("admin claim failed");
    admin = (await createSession(claim.trainerId)).token;
    const [row] = await db.insert(trainers).values({ name: "Kai", email: TRAINER }).returning();
    kai = (await createSession(row.id)).token;
  });
  afterAll(async () => {
    await db.delete(appSettings).where(eq(appSettings.key, "login_theme"));
    await db.update(trainers).set(defaultBefore).where(eq(trainers.id, defaultBefore.id));
    await db.delete(trainers).where(inArray(trainers.email, [TRAINER]));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  beforeEach(async () => {
    await db.delete(appSettings).where(eq(appSettings.key, "login_theme"));
  });

  test("signed out, unset → the classic default", async () => {
    const res = await call("GET", "/v1/public/login-theme");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ variant: "classic", accent: "green" });
  });

  test("a malformed stored value falls back per field", async () => {
    await db.insert(appSettings).values({ key: "login_theme", value: { variant: "neon", accent: "blue" } });
    expect(await readTheme()).toEqual({ variant: "classic", accent: "blue" });
  });

  test("the admin saves a theme; the public read returns it and the row records who", async () => {
    const res = await call("PUT", "/v1/admin/login-theme", admin, { variant: "split", accent: "purple" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ variant: "split", accent: "purple" });
    expect(await readTheme()).toEqual({ variant: "split", accent: "purple" });

    // saving again updates in place
    await call("PUT", "/v1/admin/login-theme", admin, { variant: "bold", accent: "orange" });
    expect(await readTheme()).toEqual({ variant: "bold", accent: "orange" });
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, "login_theme"));
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedBy).toBe(defaultBefore.id);
  });

  test("only the admin can write it", async () => {
    expect((await call("PUT", "/v1/admin/login-theme", kai, { variant: "bold", accent: "blue" })).status).toBe(403);
    expect((await call("PUT", "/v1/admin/login-theme", undefined, { variant: "bold", accent: "blue" })).status).toBe(401);
    expect(await readTheme()).toEqual({ variant: "classic", accent: "green" });
  });

  test("rejects unknown variants and free hex accents", async () => {
    for (const body of [{ variant: "neon", accent: "green" }, { variant: "bold", accent: "#ff00ff" }, { variant: "bold" }, {}]) {
      expect((await call("PUT", "/v1/admin/login-theme", admin, body)).status).toBe(422);
    }
    expect(await readTheme()).toEqual({ variant: "classic", accent: "green" });
  });

  test("copy overrides are not a thing: extra fields are dropped, never stored", async () => {
    const res = await call("PUT", "/v1/admin/login-theme", admin, { variant: "minimal", accent: "blue", headline: "x".repeat(5000) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ variant: "minimal", accent: "blue" });
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "login_theme"));
    expect(row.value).toEqual({ variant: "minimal", accent: "blue" });
  });
});
