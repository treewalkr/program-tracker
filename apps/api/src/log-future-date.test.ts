import { describe, expect, test } from "bun:test";
import { db, trainers } from "@pt/db";
import { addDays, localDateOf } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping log future-date tests");
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

describe.skipIf(!dbUp)("the trainer's log route refuses a date in the future", () => {
  let clientId = "";
  let programId = "";
  let squatId = "";
  const today = localDateOf(Date.now());
  const body = (date: string) => ({
    clientId,
    programId,
    date,
    kind: "exercises",
    sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 80, reps: 5 }],
  });

  test("setup: a client", async () => {
    const c = await call("POST", "/v1/clients", { name: "Future Date Client", email: `future-${Date.now()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    squatId = (await call("GET", "/v1/exercises?q=squat")).body[0].id;
    const p = await call("POST", "/v1/programs", {
      name: "Future Date Block",
      clientId,
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "Day A",
              seq: 1,
              order: 0,
              kind: "exercises",
              exercises: [
                { id: crypto.randomUUID(), exerciseId: squatId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] },
              ],
            },
          ],
        },
      ],
    });
    expect(p.status).toBe(201);
    programId = p.body.id;
    expect((await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" })).status).toBe(200);
  });

  test("today and the past are logged", async () => {
    const past = await call("POST", "/v1/logs/sessions", body(addDays(today, -3)));
    expect(past.status).toBe(201);
    const now = await call("POST", "/v1/logs/sessions", body(today));
    expect(now.status).toBe(201);
    for (const r of [past, now]) await call("DELETE", `/v1/logs/sessions/${r.body.id}`);
  });

  test("tomorrow (a phone a day ahead of the server) still lands, like the portal", async () => {
    const r = await call("POST", "/v1/logs/sessions", body(addDays(today, 1)));
    expect(r.status).toBe(201);
    await call("DELETE", `/v1/logs/sessions/${r.body.id}`);
  });

  test("two days ahead or more is a 422, and nothing is saved", async () => {
    for (const ahead of [2, 30]) {
      const r = await call("POST", "/v1/logs/sessions", body(addDays(today, ahead)));
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("date is in the future");
    }
    const list = await call("GET", `/v1/logs/sessions?clientId=${clientId}`);
    expect(list.body).toHaveLength(0);
  });
});
