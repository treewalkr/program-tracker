import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, roleLabels, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping role label tests");
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

const uniq = () => `Lbl ${Math.random().toString(36).slice(2, 8)}`;
const others: string[] = [];
afterAll(async () => {
  if (!dbUp) return;
  for (const id of others) await db.delete(trainers).where(eq(trainers.id, id));
});

describe.skipIf(!dbUp)("role labels", () => {
  test("a fresh trainer gets the six built-ins in order", async () => {
    await db.delete(roleLabels).where(eq(roleLabels.trainerId, await getDefaultTrainerId()));
    const res = await call("GET", "/v1/vocabulary/role-labels");
    expect(res.status).toBe(200);
    expect(res.body.map((l: any) => l.name)).toEqual(["Power", "Primary", "Secondary", "Strength", "Auxiliary", "Core"]);
    expect(res.body[3]).toMatchObject({ key: "strength", chip: "Str", category: "quality", archived: false });
  });

  test("create a label after another; it sorts between its neighbours", async () => {
    const name = uniq();
    const res = await call("POST", "/v1/vocabulary/role-labels", { name: `  ${name} `, description: "Fast, light reps", after: "power" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name, chip: name, description: "Fast, light reps", category: null, archived: false });
    expect(res.body.key).toBe(`label:${res.body.id}`);
    const list = (await call("GET", "/v1/vocabulary/role-labels")).body;
    const i = list.findIndex((l: any) => l.id === res.body.id);
    expect(list[i - 1].key).toBe("power");
  });

  test("name is unique against built-ins and own labels, any case; a meaning is required", async () => {
    expect((await call("POST", "/v1/vocabulary/role-labels", { name: "core", description: "x" })).status).toBe(409);
    const name = uniq();
    await call("POST", "/v1/vocabulary/role-labels", { name, description: "x" });
    expect((await call("POST", "/v1/vocabulary/role-labels", { name: name.toUpperCase(), description: "y" })).status).toBe(409);
    expect((await call("POST", "/v1/vocabulary/role-labels", { name: uniq(), description: "   " })).status).toBe(422);
    expect((await call("POST", "/v1/vocabulary/role-labels", { name: uniq() })).status).toBe(422);
  });

  test("edit an own label's name, chip, meaning and rank", async () => {
    const { body: made } = await call("POST", "/v1/vocabulary/role-labels", { name: uniq(), description: "a" });
    const name = uniq();
    const res = await call("PATCH", `/v1/vocabulary/role-labels/${made.id}`, { name, chip: "Sp", description: "b", rank: 50 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name, chip: "Sp", description: "b", rank: 50 });
    expect((await call("PATCH", `/v1/vocabulary/role-labels/${made.id}`, { description: "" })).status).toBe(422);
  });

  test("a built-in's meaning, chip and rank can change; its name can't; empty resets", async () => {
    const res = await call("PATCH", "/v1/vocabulary/role-labels/strength", { description: "Heavy stuff.", chip: "S" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: "strength", name: "Strength", chip: "S", description: "Heavy stuff.", rank: 400 });
    const again = await call("PATCH", "/v1/vocabulary/role-labels/strength", { rank: 650 });
    expect(again.body).toMatchObject({ description: "Heavy stuff.", rank: 650 });
    expect((await call("PATCH", "/v1/vocabulary/role-labels/strength", { name: "Max" })).status).toBe(422);
    const reset = await call("PATCH", "/v1/vocabulary/role-labels/strength", { description: "", chip: "", rank: 400 });
    expect(reset.body).toMatchObject({ chip: "Str", description: "Work for maximal force — heavy loads, low to moderate reps.", rank: 400 });
  });

  test("delete archives an own label; re-creating the name restores it", async () => {
    const name = uniq();
    const { body: made } = await call("POST", "/v1/vocabulary/role-labels", { name, description: "a" });
    const del = await call("DELETE", `/v1/vocabulary/role-labels/${made.id}`);
    expect(del.status).toBe(200);
    expect(del.body.archived).toBe(true);
    const list = (await call("GET", "/v1/vocabulary/role-labels")).body;
    expect(list.find((l: any) => l.id === made.id).archived).toBe(true);
    const back = await call("POST", "/v1/vocabulary/role-labels", { name, description: "again" });
    expect(back.status).toBe(201);
    expect(back.body).toMatchObject({ id: made.id, archived: false, description: "again" });
    expect((await call("DELETE", "/v1/vocabulary/role-labels/primary")).status).toBe(422);
  });

  test("another trainer's label reads as not found", async () => {
    const [other] = await db
      .insert(trainers)
      .values({ name: "ZZ-TEST labels", email: `zz-labels-${crypto.randomUUID()}@example.com` })
      .returning();
    others.push(other.id);
    const [theirs] = await db.insert(roleLabels).values({ trainerId: other.id, name: "Theirs", description: "x", rank: 1 }).returning();
    expect((await call("PATCH", `/v1/vocabulary/role-labels/${theirs.id}`, { description: "mine" })).status).toBe(404);
    expect((await call("DELETE", `/v1/vocabulary/role-labels/${theirs.id}`)).status).toBe(404);
    expect((await call("GET", "/v1/vocabulary/role-labels")).body.some((l: any) => l.id === theirs.id)).toBe(false);
    expect((await call("PATCH", "/v1/vocabulary/role-labels/not-a-thing", { description: "x" })).status).toBe(404);
  });
});
