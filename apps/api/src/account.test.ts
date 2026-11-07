import { describe, expect, test } from "bun:test";
import { db, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping account DB tests");
}

const call = async (method: string, body?: unknown) => {
  const res = await app.handle(
    new Request("http://local/v1/account/notifications", {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
};

describe.skipIf(!dbUp)("account notifications", () => {
  test("feedback emails default on and the switch persists", async () => {
    expect((await call("GET")).body).toEqual({ feedbackEmails: true });
    expect((await call("PATCH", { feedbackEmails: false })).body).toEqual({ feedbackEmails: false });
    expect((await call("GET")).body).toEqual({ feedbackEmails: false });
    expect((await call("PATCH", { feedbackEmails: true })).body).toEqual({ feedbackEmails: true });
    expect((await call("PATCH", { feedbackEmails: "no" })).status).toBe(422);
  });
});
