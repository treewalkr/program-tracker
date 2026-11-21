import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { clients, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping HR profile tests");
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const cleanup: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const fn of cleanup.reverse()) await fn();
});

describe.skipIf(!dbUp)("member HR profiles", () => {
  let clientId = "";
  let programId = "";
  const runId = crypto.randomUUID();

  test("setup", async () => {
    const c = await call("POST", "/v1/clients", { name: "ZZ HR", sessionsPerWeek: 1 });
    clientId = c.body.id;
    cleanup.push(() => db.delete(clients).where(eq(clients.id, clientId)));
    const p = await call("POST", "/v1/programs", {
      name: "ZZ HR block",
      clientId,
      weeks: [{ week: 1, sessions: [{ id: runId, name: "Easy", seq: 1, order: 0, kind: "cardio", exercises: [], cardio: { modality: "Running", durationMin: 40, hrZone: 2 } }] }],
    });
    programId = p.body.id;
  });

  test("a new profile is version 1 with server-computed Karvonen zones", async () => {
    const r = await call("POST", `/v1/clients/${clientId}/hr-profiles`, {
      effectiveFrom: "2026-10-01",
      method: "karvonen",
      restingHr: 58,
      maxHr: 188,
      maxHrTestedOn: "2026-09-20",
      // a client-sent table is ignored for a computed method
      zones: [{ zone: 1, min: 1, max: 2 }],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ clientId, version: 1, effectiveFrom: "2026-10-01", method: "karvonen", restingHr: 58, maxHr: 188 });
    expect(r.body.zones[1]).toEqual({ zone: 2, min: 136, max: 148 });
  });

  test("a change is a new version; GET lists them oldest first", async () => {
    const r = await call("POST", `/v1/clients/${clientId}/hr-profiles`, { effectiveFrom: "2026-11-10", method: "hrmax", maxHr: 186 });
    expect(r.status).toBe(201);
    expect(r.body.version).toBe(2);
    const list = await call("GET", `/v1/clients/${clientId}/hr-profiles`);
    expect(list.status).toBe(200);
    expect(list.body.map((p: any) => p.version)).toEqual([1, 2]);
  });

  test("a log resolves bpm from the version in effect on its date", async () => {
    const at = async (date: string) =>
      (
        await call("POST", "/v1/logs/sessions", {
          clientId,
          programId,
          programSessionId: runId,
          date,
          kind: "cardio",
          cardio: { modality: "Running", durationSec: 2400, rpe: 3 },
          sets: [],
          onDuplicate: "add",
        })
      ).body.prescription;
    expect((await at("2026-09-30")).hrProfileVersion).toBeUndefined();
    expect((await at("2026-11-09")).hrProfileVersion).toBe(1);
    const late = await at("2026-11-10");
    expect(late.hrProfileVersion).toBe(2);
    expect(late.zonesBpm[1]).toEqual({ zone: 2, min: 112, max: 129 });
  });

  test("custom zones are kept as entered when they're clean", async () => {
    const zones = [
      { zone: 1, min: 100, max: 119 },
      { zone: 2, min: 120, max: 139 },
      { zone: 3, min: 140, max: 154 },
      { zone: 4, min: 155, max: 169 },
      { zone: 5, min: 170, max: 190 },
    ];
    const r = await call("POST", `/v1/clients/${clientId}/hr-profiles`, { effectiveFrom: "2026-12-01", method: "custom", zones });
    expect(r.status).toBe(201);
    expect(r.body.zones).toEqual(zones);
  });

  test("422: missing inputs, gaps or overlaps, a bad method, date or bpm", async () => {
    const post = (body: unknown) => call("POST", `/v1/clients/${clientId}/hr-profiles`, body);
    expect((await post({ effectiveFrom: "2026-12-01", method: "karvonen", maxHr: 188 })).status).toBe(422);
    expect((await post({ effectiveFrom: "2026-12-01", method: "lthr" })).status).toBe(422);
    expect((await post({ effectiveFrom: "2026-12-01", method: "guess", maxHr: 188 })).status).toBe(422);
    expect((await post({ effectiveFrom: "Dec 1", method: "hrmax", maxHr: 188 })).status).toBe(422);
    expect((await post({ effectiveFrom: "2026-12-01", method: "hrmax", maxHr: 400 })).status).toBe(422);
    expect((await post({ effectiveFrom: "2026-12-01", method: "custom" })).status).toBe(422);
    const gap = [
      { zone: 1, min: 100, max: 119 },
      { zone: 2, min: 125, max: 139 },
      { zone: 3, min: 140, max: 154 },
      { zone: 4, min: 150, max: 169 },
      { zone: 5, min: 170, max: 190 },
    ];
    const bad = await post({ effectiveFrom: "2026-12-01", method: "custom", zones: gap });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body.issues)).toContain("gap between zone 1 and zone 2");
    expect(JSON.stringify(bad.body.issues)).toContain("zone 3 and zone 4 overlap");
  });

  test("another trainer's member is a 404 both ways", async () => {
    const [other] = await db.insert(trainers).values({ name: "ZZ Other HR", email: `zz-other-hr-${Date.now()}@test.dev` }).returning();
    cleanup.push(() => db.delete(trainers).where(eq(trainers.id, other.id)));
    const [theirs] = await db.insert(clients).values({ trainerId: other.id, name: "ZZ Theirs" }).returning();
    expect((await call("GET", `/v1/clients/${theirs.id}/hr-profiles`)).status).toBe(404);
    expect((await call("POST", `/v1/clients/${theirs.id}/hr-profiles`, { effectiveFrom: "2026-12-01", method: "hrmax", maxHr: 188 })).status).toBe(404);
  });
});
