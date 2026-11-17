import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, programs, sessionTypes, trainers } from "@pt/db";
import { SESSION_TYPE_PRESETS } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping session type tests");
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

const uniq = () => `Type ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function programTyped(typeId: string) {
  const trainerId = await getDefaultTrainerId();
  await db.insert(programs).values({
    trainerId,
    name: "type usage fixture",
    sessions: [{ week: 1, sessions: [{ id: crypto.randomUUID(), name: "A", seq: 1, typeId, typeName: "x", exercises: [] }] }] as any,
  });
}

describe.skipIf(!dbUp)("session types", () => {
  test("first list seeds the presets in order", async () => {
    const trainerId = await getDefaultTrainerId();
    await db.delete(sessionTypes).where(eq(sessionTypes.trainerId, trainerId));
    const res = await call("GET", "/v1/session-types");
    expect(res.status).toBe(200);
    expect(res.body.map((t: any) => [t.name, t.format, t.presetKey])).toEqual(SESSION_TYPE_PRESETS.map((p) => [p.name, p.format, p.key]));
    expect(res.body[0]).toMatchObject({ archivedAt: null, usedIn: 0 });
    // a second read does not seed again
    expect((await call("GET", "/v1/session-types")).body.length).toBe(SESSION_TYPE_PRESETS.length);
  });

  test("missing presets are seeded next to existing types; a preset name a custom type holds is skipped", async () => {
    const trainerId = await getDefaultTrainerId();
    await db.delete(sessionTypes).where(eq(sessionTypes.trainerId, trainerId));
    await db.insert(sessionTypes).values([
      { trainerId, name: "Hypertrophy", format: "lifting" },
      { trainerId, name: "Strength training", format: "lifting", presetKey: "strength-training" },
      { trainerId, name: "amrap", format: "lifting" },
    ]);
    const { body } = await call("GET", "/v1/session-types");
    const keyed = body.filter((t: any) => t.presetKey).map((t: any) => t.presetKey);
    expect(keyed.sort()).toEqual(SESSION_TYPE_PRESETS.map((p) => p.key).filter((k) => k !== "metabolic.amrap").sort());
    expect(body.find((t: any) => t.name === "Hypertrophy")).toMatchObject({ presetKey: null, format: "lifting" });
    expect(body.find((t: any) => t.name === "amrap")).toMatchObject({ presetKey: null });
    expect(body.filter((t: any) => t.presetKey === "strength-training")).toHaveLength(1);
  });

  test("presets are locked: archive and restore only", async () => {
    const trainerId = await getDefaultTrainerId();
    await db.delete(sessionTypes).where(eq(sessionTypes.trainerId, trainerId));
    const { body } = await call("GET", "/v1/session-types");
    const circuit = body.find((t: any) => t.presetKey === "metabolic.circuit");
    expect(circuit).toMatchObject({ name: "Circuit", format: "any" });

    for (const patch of [{ name: "Circuits" }, { format: "cardio" }, { name: "Circuit", archived: true }]) {
      const res = await call("PATCH", `/v1/session-types/${circuit.id}`, patch);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("preset types can't be edited");
    }
    const deleted = await call("DELETE", `/v1/session-types/${circuit.id}`);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error).toBe("preset types can only be archived");

    const archived = await call("PATCH", `/v1/session-types/${circuit.id}`, { archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ name: "Circuit", format: "any", presetKey: "metabolic.circuit" });
    expect(archived.body.archivedAt).not.toBeNull();
    // an archived preset is not re-seeded
    expect((await call("GET", "/v1/session-types")).body.filter((t: any) => t.presetKey === "metabolic.circuit")).toHaveLength(1);
    expect((await call("PATCH", `/v1/session-types/${circuit.id}`, { archived: false })).body.archivedAt).toBeNull();
  });

  test("custom types can't take a preset's name, nor the any format", async () => {
    const dup = await call("POST", "/v1/session-types", { name: "circuit", format: "cardio" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('"circuit" is already a session type');
    expect((await call("POST", "/v1/session-types", { name: uniq(), format: "any" })).status).toBe(422);
    const { body: made } = await call("POST", "/v1/session-types", { name: uniq(), format: "lifting" });
    expect(made.presetKey).toBeNull();
    expect((await call("PATCH", `/v1/session-types/${made.id}`, { name: "Aerobic Base" })).status).toBe(409);
    expect((await call("PATCH", `/v1/session-types/${made.id}`, { format: "any" })).status).toBe(422);
  });

  test("create normalizes the name; duplicates (any case) are refused", async () => {
    const name = uniq();
    const res = await call("POST", "/v1/session-types", { name: `  ${name}  `, format: "cardio" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name, format: "cardio", archivedAt: null, usedIn: 0 });
    const dup = await call("POST", "/v1/session-types", { name: name.toUpperCase(), format: "lifting" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe(`"${name.toUpperCase()}" is already a session type`);
    expect((await call("POST", "/v1/session-types", { name: "x", format: "yoga" })).status).toBe(422);
  });

  test("over-length or missing fields are refused on create and edit", async () => {
    expect((await call("POST", "/v1/session-types", { name: "x".repeat(41), format: "lifting" })).status).toBe(422);
    expect((await call("POST", "/v1/session-types", { name: uniq() })).status).toBe(422);
    const made = (await call("POST", "/v1/session-types", { name: uniq(), format: "lifting" })).body;
    expect((await call("PATCH", `/v1/session-types/${made.id}`, { name: "x".repeat(41) })).status).toBe(422);
    expect((await call("PATCH", `/v1/session-types/${made.id}`, { archived: "yes" })).status).toBe(422);
  });

  test("rename, change format, archive and restore", async () => {
    const { body: made } = await call("POST", "/v1/session-types", { name: uniq(), format: "lifting" });
    const renamed = uniq();
    const res = await call("PATCH", `/v1/session-types/${made.id}`, { name: renamed, format: "cardio" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: renamed, format: "cardio" });
    const archived = await call("PATCH", `/v1/session-types/${made.id}`, { archived: true });
    expect(archived.body.archivedAt).not.toBeNull();
    const restored = await call("PATCH", `/v1/session-types/${made.id}`, { archived: false });
    expect(restored.body.archivedAt).toBeNull();
  });

  test("a partial patch leaves the format alone", async () => {
    const { body: made } = await call("POST", "/v1/session-types", { name: uniq(), format: "cardio" });
    const res = await call("PATCH", `/v1/session-types/${made.id}`, { archived: true });
    expect(res.body.format).toBe("cardio");
    const renamed = await call("PATCH", `/v1/session-types/${made.id}`, { name: uniq() });
    expect(renamed.body.format).toBe("cardio");
  });

  test("used types report usage and archive instead of delete; unused delete for good", async () => {
    const { body: used } = await call("POST", "/v1/session-types", { name: uniq(), format: "lifting" });
    await programTyped(used.id);
    const listed = (await call("GET", "/v1/session-types")).body.find((t: any) => t.id === used.id);
    expect(listed.usedIn).toBe(1);
    const refused = await call("DELETE", `/v1/session-types/${used.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("used in 1 program — archive it instead");

    const { body: spare } = await call("POST", "/v1/session-types", { name: uniq(), format: "lifting" });
    expect((await call("DELETE", `/v1/session-types/${spare.id}`)).status).toBe(204);
    expect((await call("GET", "/v1/session-types")).body.some((t: any) => t.id === spare.id)).toBe(false);
  });

  test("the only custom type can be deleted (the presets remain)", async () => {
    const trainerId = await getDefaultTrainerId();
    await db.delete(sessionTypes).where(eq(sessionTypes.trainerId, trainerId));
    const [only] = await db.insert(sessionTypes).values({ trainerId, name: "Only", format: "lifting" }).returning();
    expect((await call("DELETE", `/v1/session-types/${only.id}`)).status).toBe(204);
    expect((await call("GET", "/v1/session-types")).body).toHaveLength(SESSION_TYPE_PRESETS.length);
  });

  test("another trainer's type reads as not found", async () => {
    const [other] = await db.insert(trainers).values({ name: "Other", email: `other-${Date.now()}@test.dev` }).returning();
    const [theirs] = await db.insert(sessionTypes).values({ trainerId: other.id, name: "Theirs", format: "lifting" }).returning();
    const res = await call("PATCH", `/v1/session-types/${theirs.id}`, { name: "Mine now" });
    expect(res.status).toBe(404);
    expect((await call("DELETE", `/v1/session-types/${theirs.id}`)).status).toBe(404);
  });
});
