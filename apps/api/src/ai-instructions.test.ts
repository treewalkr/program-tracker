import { describe, expect, test } from "bun:test";
import { db, trainers } from "@pt/db";
import { INSTRUCTIONS_MAX } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

/** The generate page sends ticked rules + the note as one `instructions` string. */

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping instructions cap tests");
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

describe("POST /v1/ai/generate instructions cap", () => {
  test.skipIf(!dbUp)(`${INSTRUCTIONS_MAX.toLocaleString("en-US")} characters pass validation`, async () => {
    const client = await call("POST", "/v1/clients", { name: "Cap Client", email: `cap-${crypto.randomUUID()}@test.dev`, sessionsPerWeek: 2 });
    expect(client.status).toBe(201);
    const res = await call("POST", "/v1/ai/generate", { clientId: client.body.id, providerId: "mock", instructions: "x".repeat(INSTRUCTIONS_MAX) });
    expect(res.status).toBe(201);
  });

  test("one character more is a 422", async () => {
    const res = await call("POST", "/v1/ai/generate", {
      clientId: crypto.randomUUID(),
      providerId: "mock",
      instructions: "x".repeat(INSTRUCTIONS_MAX + 1),
    });
    expect(res.status).toBe(422);
  });
});
