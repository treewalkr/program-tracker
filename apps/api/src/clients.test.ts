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

describe.skipIf(!dbUp)("client basics", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(clients).where(inArray(clients.id, ids));
  });

  const basics = {
    experience: "intermediate",
    birthDate: "1992-03-14",
    sex: "female",
    bodyweightKg: 72.5,
    heightCm: 168,
    startedOn: "2026-01-05",
    phone: "  +66 81 234 5678 ",
  };

  test("create stores every basic; dates stay calendar days; phone is trimmed", async () => {
    const { status, body } = await call("POST", "/v1/clients", { name: "Basics", ...basics });
    expect(status).toBe(201);
    ids.push(body.id);
    expect(body).toMatchObject({ ...basics, phone: "+66 81 234 5678" });
    const read = await call("GET", `/v1/clients/${body.id}`);
    expect(read.body.client.birthDate).toBe("1992-03-14");
    expect(read.body.client.startedOn).toBe("2026-01-05");
  });

  test("a client without basics reads them as null", async () => {
    const { body } = await call("POST", "/v1/clients", { name: "Bare" });
    ids.push(body.id);
    for (const key of Object.keys(basics)) expect(body[key]).toBeNull();
  });

  test("update sets and clears basics; a blank phone is null", async () => {
    const id = ids[0];
    const patched = await call("PATCH", `/v1/clients/${id}`, { experience: "advanced", heightCm: null, phone: "  " });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ experience: "advanced", heightCm: null, phone: null, sex: "female" });
  });

  test("out-of-range values are refused", async () => {
    const bad = [
      { experience: "elite" },
      { sex: "other" },
      { bodyweightKg: 19 },
      { bodyweightKg: 401 },
      { heightCm: 79 },
      { heightCm: 251 },
      { birthDate: "1899-12-31" },
      { birthDate: "2999-01-01" },
      { birthDate: "14/03/1992" },
      { startedOn: "1999-12-31" },
      { startedOn: "2999-01-01" },
      { phone: "1".repeat(41) },
    ];
    for (const fields of bad) {
      const res = await call("POST", "/v1/clients", { name: "Bad", ...fields });
      expect([res.status, fields]).toEqual([422, fields]);
    }
    const patch = await call("PATCH", `/v1/clients/${ids[0]}`, { birthDate: "2999-01-01" });
    expect(patch.status).toBe(422);
  });
});
