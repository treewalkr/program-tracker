import { describe, expect, test, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import { db, trainers, clients } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping client email tests");
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

describe.skipIf(!dbUp)("optional client email", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(clients).where(inArray(clients.id, ids));
  });

  test("create without an email stores null", async () => {
    const { status, body } = await call("POST", "/v1/clients", { name: "No Email" });
    expect(status).toBe(201);
    expect(body.email).toBeNull();
    ids.push(body.id);
  });

  test("an empty email is stored as null; a malformed one is refused", async () => {
    const empty = await call("POST", "/v1/clients", { name: "Blank Email", email: "" });
    expect(empty.status).toBe(201);
    expect(empty.body.email).toBeNull();
    ids.push(empty.body.id);
    expect((await call("POST", "/v1/clients", { name: "Bad", email: "not-an-email" })).status).toBe(422);
  });

  test("update can set and then clear the email", async () => {
    const id = ids[0];
    const set = await call("PATCH", `/v1/clients/${id}`, { email: "ada@gym.com" });
    expect(set.status).toBe(200);
    expect(set.body.email).toBe("ada@gym.com");
    const cleared = await call("PATCH", `/v1/clients/${id}`, { email: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.email).toBeNull();
    const blank = await call("PATCH", `/v1/clients/${id}`, { email: "ada@gym.com" });
    expect(blank.body.email).toBe("ada@gym.com");
    expect((await call("PATCH", `/v1/clients/${id}`, { email: "" })).body.email).toBeNull();
  });
});
