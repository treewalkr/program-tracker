import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { authSessions, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { checkAllowed, claimTrainer, createSession, SESSION_COOKIE, trainerForToken, type AuthConfig, type GoogleProfile } from "./lib/auth";
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

const cfg: AuthConfig = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "http://localhost:5173/v1/auth/google/callback",
  trainerEmail: "coach@example.com",
};

const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: "google-sub-1",
  email: "coach@example.com",
  emailVerified: true,
  name: "Coach Kai",
  picture: "https://example.com/p.png",
  ...over,
});

const get = (path: string, token?: string) =>
  app.handle(
    new Request(`http://localhost${path}`, token ? { headers: { cookie: `${SESSION_COOKIE}=${token}` } } : undefined),
  );

describe("allowlist", () => {
  test("only the verified trainer email gets in", () => {
    expect(checkAllowed(cfg, profile())).toBeNull();
    expect(checkAllowed(cfg, profile({ email: "someone@else.com" }))).toBe("not_allowed");
    expect(checkAllowed(cfg, profile({ emailVerified: false }))).toBe("unverified");
  });
});

describe.skipIf(!dbUp)("google sign-in", () => {
  const env = {
    AUTH_DISABLED: "false",
    GOOGLE_CLIENT_ID: cfg.clientId,
    GOOGLE_CLIENT_SECRET: cfg.clientSecret,
    GOOGLE_REDIRECT_URI: cfg.redirectUri,
    TRAINER_EMAIL: cfg.trainerEmail,
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  beforeAll(() => Object.assign(process.env, env));
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  beforeEach(async () => {
    await db.delete(trainers).where(eq(trainers.email, "coach@example.com"));
    await db.delete(trainers).where(eq(trainers.googleSub, "google-sub-1"));
  });

  test("first sign-in claims the existing default trainer, later ones reuse it", async () => {
    const defaultId = await getDefaultTrainerId();
    const before = await db.select().from(trainers).where(eq(trainers.id, defaultId));
    try {
      const claimed = await claimTrainer(profile());
      expect(claimed).toBe(defaultId);
      expect(await claimTrainer(profile({ name: "Coach K" }))).toBe(defaultId);
      const [row] = await db.select().from(trainers).where(eq(trainers.id, defaultId));
      expect(row.googleSub).toBe("google-sub-1");
      expect(row.name).toBe("Coach K");
    } finally {
      // leave the shared default trainer as other tests expect it
      await db.update(trainers).set({ ...before[0], googleSub: null, avatarUrl: null }).where(eq(trainers.id, defaultId));
    }
  });

  test("guard rejects without a session and lets a live session through", async () => {
    expect((await get("/health")).status).toBe(200);
    expect((await get("/v1/clients")).status).toBe(401);
    expect((await get("/v1/auth/me")).status).toBe(401);

    const trainerId = await getDefaultTrainerId();
    const { token } = await createSession(trainerId);
    expect((await get("/v1/clients", token)).status).toBe(200);
    const me = await (await get("/v1/auth/me", token)).json();
    expect(me.trainer.id).toBe(trainerId);

    await db.delete(authSessions).where(eq(authSessions.trainerId, trainerId));
    expect(await trainerForToken(token)).toBeNull();
    expect((await get("/v1/clients", token)).status).toBe(401);
  });

  test("callback with a mismatched state never signs in", async () => {
    const res = await get("/v1/auth/google/callback?code=x&state=forged");
    expect([302, 303]).toContain(res.status);
    expect(res.headers.get("location")).toBe("/login?error=expired");
  });
});
