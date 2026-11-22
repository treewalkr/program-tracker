import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { cardioModalities, cardioTemplates, db, trainers } from "@pt/db";
import { CARDIO_TEMPLATE_PRESETS, MODALITY_PRESETS } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";
import { getDefaultTrainerId } from "./lib/trainer";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping cardio library tests");
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

describe.skipIf(!dbUp)("modalities", () => {
  let trainerId = "";

  test("presets are seeded once, even when two reads race", async () => {
    trainerId = await getDefaultTrainerId();
    await db.delete(cardioModalities).where(eq(cardioModalities.trainerId, trainerId));
    const [a, b] = await Promise.all([call("GET", "/v1/modalities"), call("GET", "/v1/modalities")]);
    expect(a.status).toBe(200);
    expect(b.body).toHaveLength(MODALITY_PRESETS.length);
    const rows = await db.select().from(cardioModalities).where(eq(cardioModalities.trainerId, trainerId));
    expect(rows).toHaveLength(MODALITY_PRESETS.length);
    expect(a.body.find((m: any) => m.name === "Rowing")).toMatchObject({ metric: "split", presetKey: "rowing", usedIn: 0 });
  });

  test("custom: add, rename, change metric, name clash 409, delete", async () => {
    const r = await call("POST", "/v1/modalities", { name: "  Trail   run ", metric: "pace" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "Trail run", metric: "pace", presetKey: null });
    expect((await call("POST", "/v1/modalities", { name: "trail RUN", metric: "pace" })).status).toBe(409);
    expect((await call("POST", "/v1/modalities", { name: "running", metric: "pace" })).status).toBe(409);
    const e = await call("PATCH", `/v1/modalities/${r.body.id}`, { name: "Trail", metric: "speed" });
    expect(e.body).toMatchObject({ name: "Trail", metric: "speed" });
    expect((await call("DELETE", `/v1/modalities/${r.body.id}`)).status).toBe(204);
  });

  test("a preset only archives and restores", async () => {
    const run = (await call("GET", "/v1/modalities")).body.find((m: any) => m.presetKey === "running");
    expect((await call("PATCH", `/v1/modalities/${run.id}`, { name: "Jog" })).status).toBe(409);
    expect((await call("DELETE", `/v1/modalities/${run.id}`)).status).toBe(409);
    const arch = await call("PATCH", `/v1/modalities/${run.id}`, { archived: true });
    expect(arch.body.archivedAt).toBeTruthy();
    expect((await call("PATCH", `/v1/modalities/${run.id}`, { archived: false })).body.archivedAt).toBeNull();
  });

  test("422: empty or long name, unknown metric; 404 for another trainer's row", async () => {
    expect((await call("POST", "/v1/modalities", { name: "", metric: "pace" })).status).toBe(422);
    expect((await call("POST", "/v1/modalities", { name: "x".repeat(41), metric: "pace" })).status).toBe(422);
    expect((await call("POST", "/v1/modalities", { name: "Swim", metric: "strokes" })).status).toBe(422);
    expect((await call("POST", "/v1/modalities", { name: "Swim" })).status).toBe(422);
    const any = (await call("GET", "/v1/modalities")).body[0];
    expect((await call("PATCH", `/v1/modalities/${any.id}`, { metric: "fast" })).status).toBe(422);
    const [other] = await db.insert(trainers).values({ name: "ZZ Other Mod", email: `zz-other-mod-${Date.now()}@test.dev` }).returning();
    cleanup.push(() => db.delete(trainers).where(eq(trainers.id, other.id)));
    const [theirs] = await db.insert(cardioModalities).values({ trainerId: other.id, name: "Theirs", metric: "pace" }).returning();
    expect((await call("PATCH", `/v1/modalities/${theirs.id}`, { name: "Mine" })).status).toBe(404);
    expect((await call("DELETE", `/v1/modalities/${theirs.id}`)).status).toBe(404);
  });
});

describe.skipIf(!dbUp)("cardio templates", () => {
  const rx = { modality: "Running", intervals: [{ id: "r", type: "work", repeat: 6, distanceM: 400, recovery: { durationSec: 90 } }] };

  test("presets come with hidden flags; hiding one is stored on the account", async () => {
    const list = await call("GET", "/v1/cardio-templates");
    expect(list.status).toBe(200);
    expect(list.body.presets.map((p: any) => p.key)).toEqual(CARDIO_TEMPLATE_PRESETS.map((p) => p.key));
    const hide = await call("PUT", "/v1/cardio-templates/presets/tempo-threshold", { hidden: true });
    expect(hide.body.hidden).toContain("tempo-threshold");
    expect((await call("GET", "/v1/cardio-templates")).body.presets.find((p: any) => p.key === "tempo-threshold").hidden).toBe(true);
    expect((await call("PUT", "/v1/cardio-templates/presets/tempo-threshold", { hidden: false })).body.hidden).not.toContain("tempo-threshold");
    expect((await call("PUT", "/v1/cardio-templates/presets/nope", { hidden: true })).status).toBe(404);
    expect((await call("PUT", "/v1/cardio-templates/presets/intervals", {})).status).toBe(422);
  });

  test("save, rename, archive and delete a template", async () => {
    const r = await call("POST", "/v1/cardio-templates", { name: "6 × 400 m", prescription: rx, basedOn: "intervals" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "6 × 400 m", basedOn: "intervals", archivedAt: null });
    expect(r.body.prescription.intervals[0]).toMatchObject({ repeat: 6, distanceM: 400 });
    const e = await call("PATCH", `/v1/cardio-templates/${r.body.id}`, { name: "Track 400s", archived: true });
    expect(e.body).toMatchObject({ name: "Track 400s" });
    expect(e.body.archivedAt).toBeTruthy();
    expect((await call("GET", "/v1/cardio-templates")).body.templates.map((t: any) => t.id)).toContain(r.body.id);
    expect((await call("DELETE", `/v1/cardio-templates/${r.body.id}`)).status).toBe(204);
    expect((await call("DELETE", `/v1/cardio-templates/${r.body.id}`)).status).toBe(404);
  });

  test("422: no workload, a bad interval, empty or long name; 404 for another trainer's", async () => {
    expect((await call("POST", "/v1/cardio-templates", { name: "Empty", prescription: { hrZone: 2 } })).status).toBe(422);
    const badIv = { intervals: [{ id: "a", type: "sprint", durationSec: 30 }] };
    expect((await call("POST", "/v1/cardio-templates", { name: "Bad", prescription: badIv })).status).toBe(422);
    expect((await call("POST", "/v1/cardio-templates", { name: "", prescription: rx })).status).toBe(422);
    expect((await call("POST", "/v1/cardio-templates", { name: "x".repeat(81), prescription: rx })).status).toBe(422);
    expect((await call("POST", "/v1/cardio-templates", { name: "No rx" })).status).toBe(422);
    const ok = await call("POST", "/v1/cardio-templates", { name: "Ok", prescription: { durationMin: 30 } });
    cleanup.push(() => db.delete(cardioTemplates).where(eq(cardioTemplates.id, ok.body.id)));
    expect((await call("PATCH", `/v1/cardio-templates/${ok.body.id}`, { prescription: { hrZone: 3 } })).status).toBe(422);

    const [other] = await db.insert(trainers).values({ name: "ZZ Other Tpl", email: `zz-other-tpl-${Date.now()}@test.dev` }).returning();
    cleanup.push(() => db.delete(trainers).where(eq(trainers.id, other.id)));
    const [theirs] = await db.insert(cardioTemplates).values({ trainerId: other.id, name: "Theirs", prescription: { durationMin: 30 } }).returning();
    expect((await call("PATCH", `/v1/cardio-templates/${theirs.id}`, { name: "Mine" })).status).toBe(404);
    expect((await call("DELETE", `/v1/cardio-templates/${theirs.id}`)).status).toBe(404);
  });
});
