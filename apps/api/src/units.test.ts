import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { clients, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, createClientSession } from "./lib/client-auth";
import { app } from "./app";
import { getDefaultTrainerId } from "./lib/trainer";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping display unit tests");
}

const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(opts.token ? { cookie: `${CLIENT_COOKIE}=${opts.token}` } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const trainerIds: string[] = [];
afterAll(async () => {
  if (trainerIds.length) await db.delete(trainers).where(inArray(trainers.id, trainerIds));
});

describe.skipIf(!dbUp)("trainer display units", () => {
  test("metric until set; lb/mi saved; a bad document is a 422", async () => {
    const trainerId = await getDefaultTrainerId();
    await db.update(trainers).set({ displayUnits: null }).where(eq(trainers.id, trainerId));
    expect((await call("GET", "/v1/account/units")).body).toEqual({ weight: "kg", distance: "km" });
    const put = await call("PUT", "/v1/account/units", { body: { weight: "lb", distance: "mi" } });
    expect(put.status).toBe(200);
    expect((await call("GET", "/v1/account/units")).body).toEqual({ weight: "lb", distance: "mi" });
    expect((await call("PUT", "/v1/account/units", { body: { weight: "stone", distance: "km" } })).status).toBe(422);
    expect((await call("PUT", "/v1/account/units", { body: { weight: "kg" } })).status).toBe(422);
    expect((await call("PUT", "/v1/account/units", { body: { weight: "kg", distance: "km", extra: 1 } })).status).toBe(422);
    await db.update(trainers).set({ displayUnits: null }).where(eq(trainers.id, trainerId));
  });
});

describe.skipIf(!dbUp)("member display units (portal settings)", () => {
  test("each member sees and saves only their own; 422 and 401 as expected", async () => {
    const [tr] = await db.insert(trainers).values({ name: "ZZ Units", email: `zz-units-${Date.now()}@coach.dev` }).returning();
    trainerIds.push(tr.id);
    const [a, b] = await db
      .insert(clients)
      .values([
        { trainerId: tr.id, name: "ZZ A", portalEnabledAt: new Date() },
        { trainerId: tr.id, name: "ZZ B", portalEnabledAt: new Date() },
      ])
      .returning();
    const ta = (await createClientSession(a.id)).token;
    const tb = (await createClientSession(b.id)).token;
    expect((await call("GET", "/v1/portal/settings", { token: ta })).body).toEqual({ units: { weight: "kg", distance: "km" } });
    const put = await call("PUT", "/v1/portal/settings", { token: ta, body: { units: { weight: "lb", distance: "mi" } } });
    expect(put.body).toEqual({ units: { weight: "lb", distance: "mi" } });
    expect((await call("GET", "/v1/portal/settings", { token: tb })).body.units).toEqual({ weight: "kg", distance: "km" });
    expect((await call("PUT", "/v1/portal/settings", { token: ta, body: { units: { weight: "lb" } } })).status).toBe(422);
    expect((await call("PUT", "/v1/portal/settings", { token: ta, body: {} })).status).toBe(422);
    expect((await call("GET", "/v1/portal/settings")).status).toBe(401);
    expect((await call("PUT", "/v1/portal/settings", { body: { units: { weight: "lb", distance: "mi" } } })).status).toBe(401);
    const [row] = await db.select().from(clients).where(eq(clients.id, a.id));
    expect(row.displayUnits).toEqual({ weight: "lb", distance: "mi" });
  });
});
