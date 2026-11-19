import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { appSettings, authSessions, clients, db, exercises, impersonations, programs, sessionLogs, setLogs, trainers } from "@pt/db";
import { localDateOf } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { claimTrainer, createSession, sha256, SESSION_COOKIE, type AuthConfig } from "./lib/auth";
import { setFlag } from "./lib/flags";
import { getDefaultTrainerId } from "./lib/trainer";
import { createDashboardYoga } from "./graphql/schema";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping GraphQL tests");
}

const DASHBOARD = `{ dashboard {
  client { id name status sessionsPerWeek cardioTarget createdAt }
  currentProgram { id clientId name status weeks activatedAt startsOn createdAt }
  logs { id programId programSessionId date kind cardio sets { exerciseId type weightKg reps } }
  portalLink
} }`;

const gqlUrl = (query: string) => `http://local/v1/graphql?query=${encodeURIComponent(query)}`;
const gql = async (query: string, init: RequestInit = {}) => {
  const res = await app.handle(new Request(gqlUrl(query), { headers: { accept: "application/json" }, ...init }));
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};
const rest = async (path: string) => (await app.handle(new Request(`http://local${path}`))).json() as Promise<any[]>;

describe.skipIf(!dbUp)("GraphQL dashboard", () => {
  const tok = `gql${crypto.randomUUID().slice(0, 8)}`;
  const DAY = 86_400_000;
  const day = (ago: number) => localDateOf(Date.now() - ago * DAY);
  const ids: Record<string, string> = {};
  let activeId = "";
  const rowOf = (rows: any[], id: string) => rows.find((r) => r.client.id === id);

  beforeAll(async () => {
    const me = await getDefaultTrainerId();
    for (const name of ["Ada", "Bea"]) {
      const [c] = await db.insert(clients).values({ trainerId: me, name: `${name} ${tok}` }).returning();
      ids[name] = c.id;
    }
    await db.update(clients).set({ portalEnabledAt: new Date(), portalToken: `tok-${tok}` }).where(eq(clients.id, ids.Ada));
    const weeks = [{ week: 1, sessions: [] }] as never;
    const [active] = await db
      .insert(programs)
      .values({ trainerId: me, clientId: ids.Ada, name: "Current block", status: "active", sessions: weeks })
      .returning();
    activeId = active.id;
    const logs = await db
      .insert(sessionLogs)
      .values(Array.from({ length: 201 }, (_, i) => ({ clientId: ids.Ada, programId: activeId, date: day(i + 1) })))
      .returning();
    const [ex] = await db.select().from(exercises).limit(1);
    await db
      .insert(setLogs)
      .values([1, 2].map((setNumber) => ({ sessionLogId: logs[0].id, exerciseId: ex.id, setNumber, reps: 5, weightKg: "100.5" })));
  });
  afterAll(async () => {
    // logs and sets go with their client (cascade)
    await db.delete(programs).where(inArray(programs.clientId, Object.values(ids)));
    await db.delete(clients).where(inArray(clients.id, Object.values(ids)));
  });

  test("the same clients, programs, logs (200 cap) and portal links as GET /v1/clients/overview", async () => {
    const { status, body } = await gql(DASHBOARD);
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    const rows = body.data.dashboard as any[];
    const restRows = await rest("/v1/clients/overview");
    expect(rows.map((r) => r.client.id).sort()).toEqual(restRows.map((r) => r.client.id).sort());
    for (const r of restRows) {
      const g = rowOf(rows, r.client.id);
      expect(g.portalLink).toBe(r.portalLink);
      expect(g.currentProgram?.id ?? null).toBe(r.currentProgram?.id ?? null);
      expect(g.logs.map((l: any) => l.id)).toEqual(r.logs.map((l: any) => l.id));
      // every field the query asked for reads the same as REST
      expect(g.client).toEqual({
        id: r.client.id,
        name: r.client.name,
        status: r.client.status,
        sessionsPerWeek: r.client.sessionsPerWeek,
        cardioTarget: r.client.cardioTarget,
        createdAt: r.client.createdAt,
      });
    }
    const ada = rowOf(rows, ids.Ada);
    expect(ada.logs).toHaveLength(200);
    expect(ada.portalLink).toEndWith(`tok-${tok}`);
    expect(ada.currentProgram).toMatchObject({ id: activeId, name: "Current block", status: "active", weeks: [{ week: 1, sessions: [] }] });
    expect(ada.logs[0]).toMatchObject({ date: day(1), kind: "exercises", cardio: null, programSessionId: null });
    expect(ada.logs[0].sets).toEqual([
      expect.objectContaining({ type: "working", weightKg: 100.5, reps: 5 }),
      expect.objectContaining({ type: "working", weightKg: 100.5, reps: 5 }),
    ]);
    expect(rowOf(rows, ids.Bea)).toMatchObject({ currentProgram: null, logs: [], portalLink: null });
  });

  test("only the requested fields come back", async () => {
    const { body } = await gql("{ dashboard { client { name } portalLink } }");
    expect(body.data.dashboard.length).toBeGreaterThan(1);
    for (const r of body.data.dashboard) {
      expect(Object.keys(r)).toEqual(["client", "portalLink"]);
      expect(Object.keys(r.client)).toEqual(["name"]);
    }
  });

  test("GET only: a POST is not a route", async () => {
    const res = await app.handle(
      new Request("http://local/v1/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ dashboard { portalLink } }" }),
      })
    );
    expect([404, 405]).toContain(res.status);
  });

  test("introspection works in dev, is refused in production", async () => {
    const q = "{ __schema { queryType { name } } }";
    const dev = await gql(q);
    expect(dev.body.data.__schema.queryType.name).toBe("Query");
    const prod = createDashboardYoga(true);
    const res = await prod.fetch(new Request(gqlUrl(q), { headers: { accept: "application/json" } }), { trainerId: "x" });
    const body = (await res.json()) as any;
    expect(body.data).toBeUndefined();
    expect(body.errors[0].message).toContain("introspection");
  });

  describe("signed in", () => {
    const ADMIN = "gql-boss@example.com";
    const KAI = "gql-kai@example.com";
    const cfg: AuthConfig = { clientId: "cid", clientSecret: "secret", redirectUri: "http://localhost/cb", adminEmail: ADMIN };
    const env = { AUTH_DISABLED: "false", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: cfg.redirectUri, ADMIN_EMAIL: ADMIN };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    let adminId = "";
    let adminBefore: typeof trainers.$inferSelect;
    let kaiId = "";
    let kaiClientId = "";

    beforeAll(async () => {
      Object.assign(process.env, env);
      adminId = await getDefaultTrainerId();
      [adminBefore] = await db.select().from(trainers).where(eq(trainers.id, adminId));
      await db.delete(trainers).where(eq(trainers.email, KAI));
      const [kai] = await db.insert(trainers).values({ name: "Kai Gql", email: KAI, googleSub: "sub-gql-kai" }).returning();
      kaiId = kai.id;
      [{ id: kaiClientId }] = await db.insert(clients).values({ trainerId: kaiId, name: `Kai's ${tok}` }).returning();
      await setFlag("impersonation", true, null);
    });
    afterAll(async () => {
      await db.delete(trainers).where(eq(trainers.email, KAI));
      await db.update(trainers).set(adminBefore).where(eq(trainers.id, adminId));
      await db.delete(appSettings).where(like(appSettings.key, "flag:%"));
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    test("signed out → 401", async () => {
      expect((await gql("{ dashboard { portalLink } }")).status).toBe(401);
    });

    test("a read-only view as a trainer reads that trainer's dashboard", async () => {
      const claim = await claimTrainer(cfg, { sub: "sub-gql-admin", email: ADMIN, emailVerified: true, name: "Boss", picture: null });
      if (!("trainerId" in claim)) throw new Error("admin claim failed");
      const { token } = await createSession(claim.trainerId);
      const [view] = await db.insert(impersonations).values({ adminId, trainerId: kaiId }).returning({ id: impersonations.id });
      await db
        .update(authSessions)
        .set({ actingAsTrainerId: kaiId, actingUntil: new Date(Date.now() + 30 * 60_000), impersonationId: view.id })
        .where(eq(authSessions.id, await sha256(token)));
      const { status, body } = await gql("{ dashboard { client { id } } }", {
        headers: { accept: "application/json", cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(status).toBe(200);
      expect(body.data.dashboard.map((r: any) => r.client.id)).toEqual([kaiClientId]);
    });
  });
});
