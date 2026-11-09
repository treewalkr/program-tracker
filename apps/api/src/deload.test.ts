import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { clients, db, trainers } from "@pt/db";
import { DEFAULT_DELOAD, type DeloadSettings } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { loadContext } from "./lib/context";
import { buildGenerationMessages, buildWeekMessages } from "./ai/prompt";
import { computeTrainerSignals } from "./lib/signals-service";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping deload settings tests");
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const mine: DeloadSettings = { setsKeptPercent: 60, loadPercent: -7.5, loadBasis: "week1", rpeCap: null, amrap: true };
const theirs: DeloadSettings = { setsKeptPercent: 100, loadPercent: -20, loadBasis: "previous", rpeCap: 5, amrap: false };

describe.skipIf(!dbUp)("deload settings", () => {
  const clientIds: string[] = [];
  const trainerIds: string[] = [];
  afterAll(async () => {
    await call("DELETE", "/v1/account/deload");
    if (clientIds.length) await db.delete(clients).where(inArray(clients.id, clientIds));
    if (trainerIds.length) await db.delete(trainers).where(inArray(trainers.id, trainerIds));
  });

  test("GET is the default until set; PUT round-trips; DELETE resets", async () => {
    await call("DELETE", "/v1/account/deload");
    expect(await call("GET", "/v1/account/deload")).toEqual({ status: 200, body: DEFAULT_DELOAD });

    const put = await call("PUT", "/v1/account/deload", mine);
    expect(put).toEqual({ status: 200, body: mine });
    expect((await call("GET", "/v1/account/deload")).body).toEqual(mine);

    const del = await call("DELETE", "/v1/account/deload");
    expect(del).toEqual({ status: 200, body: DEFAULT_DELOAD });
    const [row] = await db.select({ s: trainers.deloadSettings }).from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    expect(row.s).toBeNull();
  });

  test("bad input is refused with 422 and changes nothing", async () => {
    for (const bad of [
      { ...mine, setsKeptPercent: 20 },
      { ...mine, setsKeptPercent: 52 },
      { ...mine, loadPercent: 5 },
      { ...mine, loadPercent: -3 },
      { ...mine, loadBasis: "week2" },
      { ...mine, rpeCap: 11 },
      { ...mine, amrap: "yes" },
      { setsKeptPercent: 50 },
    ]) {
      expect((await call("PUT", "/v1/account/deload", bad)).status).toBe(422);
    }
    expect((await call("GET", "/v1/account/deload")).body).toEqual(DEFAULT_DELOAD);
  });

  test("a client follows the trainer's rule until given its own, and back", async () => {
    const created = await call("POST", "/v1/clients", { name: "ZZ Deload" });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    clientIds.push(id);
    expect(created.body).toMatchObject({ deloadSettings: null, effectiveDeload: DEFAULT_DELOAD });

    await call("PUT", "/v1/account/deload", mine);
    expect((await call("GET", `/v1/clients/${id}`)).body.client).toMatchObject({ deloadSettings: null, effectiveDeload: mine });

    const put = await call("PUT", `/v1/clients/${id}/deload`, theirs);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ id, deloadSettings: theirs, effectiveDeload: theirs });
    const listed = (await call("GET", "/v1/clients")).body.find((c: { id: string }) => c.id === id);
    expect(listed).toMatchObject({ deloadSettings: theirs, effectiveDeload: theirs });
    expect((await call("PUT", `/v1/clients/${id}/deload`, { ...theirs, rpeCap: 3 })).status).toBe(422);

    const del = await call("DELETE", `/v1/clients/${id}/deload`);
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ deloadSettings: null, effectiveDeload: mine });
    await call("DELETE", "/v1/account/deload");
  });

  test("another trainer's client reads as 404", async () => {
    const [other] = await db
      .insert(trainers)
      .values({ name: "ZZ Other", email: `zz-deload-${crypto.randomUUID()}@example.com` })
      .returning();
    trainerIds.push(other.id);
    const [theirClient] = await db.insert(clients).values({ trainerId: other.id, name: "ZZ Not Mine" }).returning();
    expect((await call("PUT", `/v1/clients/${theirClient.id}/deload`, theirs)).status).toBe(404);
    expect((await call("DELETE", `/v1/clients/${theirClient.id}/deload`)).status).toBe(404);
    const [row] = await db.select().from(clients).where(eq(clients.id, theirClient.id));
    expect(row.deloadSettings).toBeNull();
  });

  test("the prompt carries the client's rule, not the default", async () => {
    const me = await getDefaultTrainerId();
    const [c] = await db.insert(clients).values({ trainerId: me, name: "ZZ Prompt", deloadSettings: theirs }).returning();
    clientIds.push(c.id);
    const ctx = await loadContext(me, c.id, null);
    expect(ctx.deload).toEqual(theirs);
    const rule = "A deload week means: all sets kept, loads −20 % from last week, RPE 5 cap, no AMRAP sets.";
    expect(buildGenerationMessages({ ...ctx, trainerInstructions: "" }).system).toContain(rule);
    const week = { ...ctx, trainerInstructions: "", targetWeek: 4, plannedWeeks: 4, targetDirective: null, target: null };
    expect(buildWeekMessages(week).system).toContain(rule);

    await db.update(clients).set({ deloadSettings: null }).where(eq(clients.id, c.id));
    await call("PUT", "/v1/account/deload", mine);
    expect((await loadContext(me, c.id, null)).deload).toEqual(mine);
    await call("DELETE", "/v1/account/deload");
  });

  test("signals run with the trainer's rule in place", async () => {
    await call("PUT", "/v1/account/deload", mine);
    expect(Array.isArray(await computeTrainerSignals(await getDefaultTrainerId()))).toBe(true);
    await call("DELETE", "/v1/account/deload");
  });
});
