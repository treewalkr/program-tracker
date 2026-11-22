import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assessments, clients, db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping assessment tests");
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

describe.skipIf(!dbUp)("VO₂max assessments", () => {
  let clientId = "";
  let base = "";

  test("setup: a member with no sex recorded yet", async () => {
    const c = await call("POST", "/v1/clients", { name: "ZZ VO2", birthDate: "1996-05-20" });
    clientId = c.body.id;
    base = `/v1/clients/${clientId}/assessments`;
    cleanup.push(() => db.delete(clients).where(eq(clients.id, clientId)));
  });

  test("the server computes the result and ignores a client-sent one", async () => {
    const r = await call("POST", base, { protocol: "cooper_12min", testedOn: "2026-10-01", inputs: { distanceM: 2400 }, result: 99, notes: " track " });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ protocol: "cooper_12min", formulaVersion: "cooper-1968", result: 42.4, notes: "track" });
    const mile = await call("POST", base, { protocol: "run_1_5mile", testedOn: "2026-10-15", inputs: { timeSec: 720 } });
    expect(mile.body.result).toBe(43.8);
  });

  test("Rockport needs a recorded sex; with it, age comes from the test date", async () => {
    const body = { protocol: "rockport_walk", testedOn: "2026-11-01", inputs: { timeSec: 780, heartRate: 130, weightKg: 70 } };
    const missing = await call("POST", base, body);
    expect(missing.status).toBe(422);
    expect(missing.body.error).toBe("Rockport needs the member's sex recorded");
    await db.update(clients).set({ sex: "male" }).where(eq(clients.id, clientId));
    const ok = await call("POST", base, body);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ result: 52.9, formulaVersion: "kline-1987" });
  });

  test("edit recomputes; delete removes; list is oldest first", async () => {
    const list = await call("GET", base);
    expect(list.body.map((a: any) => a.testedOn)).toEqual(["2026-10-01", "2026-10-15", "2026-11-01"]);
    const first = list.body[0];
    const [stored] = await db.select().from(assessments).where(eq(assessments.id, first.id));
    expect(stored.result).toBe(42.4);
    const edit = await call("PATCH", `${base}/${first.id}`, { inputs: { distanceM: 2800 } });
    expect(edit.status).toBe(200);
    expect(edit.body.result).toBe(51.3);
    expect((await call("DELETE", `${base}/${first.id}`)).status).toBe(204);
    expect((await call("DELETE", `${base}/${first.id}`)).status).toBe(404);
  });

  test("422: missing or wrong inputs, unknown protocol, bad date, long notes", async () => {
    expect((await call("POST", base, { protocol: "cooper_12min", testedOn: "2026-10-01", inputs: {} })).status).toBe(422);
    expect((await call("POST", base, { protocol: "cooper_12min", testedOn: "2026-10-01" })).status).toBe(422);
    expect((await call("POST", base, { protocol: "run_1_5mile", testedOn: "2026-10-01", inputs: { distanceM: 2400 } })).status).toBe(422);
    expect((await call("POST", base, { protocol: "lab", testedOn: "2026-10-01", inputs: { distanceM: 2400 } })).status).toBe(422);
    expect((await call("POST", base, { protocol: "cooper_12min", testedOn: "yesterday", inputs: { distanceM: 2400 } })).status).toBe(422);
    const long = { protocol: "cooper_12min", testedOn: "2026-10-01", inputs: { distanceM: 2400 }, notes: "x".repeat(1001) };
    expect((await call("POST", base, long)).status).toBe(422);
    const [any] = (await call("GET", base)).body;
    expect((await call("PATCH", `${base}/${any.id}`, { inputs: { distanceM: -1 } })).status).toBe(422);
    expect((await call("PATCH", `${base}/${any.id}`, { protocol: "nope" })).status).toBe(422);
  });

  test("another trainer's member, or an assessment under another member, is a 404", async () => {
    const [other] = await db.insert(trainers).values({ name: "ZZ Other VO2", email: `zz-other-vo2-${Date.now()}@test.dev` }).returning();
    cleanup.push(() => db.delete(trainers).where(eq(trainers.id, other.id)));
    const [theirs] = await db.insert(clients).values({ trainerId: other.id, name: "ZZ Theirs" }).returning();
    const [theirTest] = await db
      .insert(assessments)
      .values({ clientId: theirs.id, protocol: "cooper_12min", formulaVersion: "cooper-1968", testedOn: "2026-10-01", inputs: { distanceM: 2400 }, result: 42.4 })
      .returning();
    expect((await call("GET", `/v1/clients/${theirs.id}/assessments`)).status).toBe(404);
    expect((await call("PATCH", `/v1/clients/${theirs.id}/assessments/${theirTest.id}`, { notes: "x" })).status).toBe(404);
    // mine in the path, theirs as the assessment
    expect((await call("PATCH", `${base}/${theirTest.id}`, { notes: "x" })).status).toBe(404);
    expect((await call("DELETE", `${base}/${theirTest.id}`)).status).toBe(404);
  });
});
