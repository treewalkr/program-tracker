import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, feedbackItems, feedbackMutes, trainers } from "@pt/db";
import { DEFAULT_FEEDBACK_EMAIL_PREFS, unpinnedContext } from "@pt/shared";
import { getDefaultTrainerId } from "./lib/trainer";
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
    const fresh = { feedbackEmails: true, prefs: DEFAULT_FEEDBACK_EMAIL_PREFS, muted: [], isAdmin: true };
    expect((await call("GET")).body).toEqual(fresh);
    expect((await call("PATCH", { feedbackEmails: false })).body).toEqual({ ...fresh, feedbackEmails: false });
    expect((await call("GET")).body.feedbackEmails).toBe(false);
    expect((await call("PATCH", { feedbackEmails: true })).body).toEqual(fresh);
    expect((await call("PATCH", { feedbackEmails: "no" })).status).toBe(422);
  });

  test("prefs merge partially and are validated; the master switch keeps them", async () => {
    let res = await call("PATCH", { prefs: { replies: "mine" } });
    expect(res.body.prefs).toEqual({ ...DEFAULT_FEEDBACK_EMAIL_PREFS, replies: "mine" });
    res = await call("PATCH", { feedbackEmails: false, prefs: { status: false } });
    expect(res.body).toMatchObject({ feedbackEmails: false, prefs: { newTickets: true, replies: "mine", status: false } });
    expect((await call("PATCH", { prefs: { replies: "some" } })).status).toBe(422);
    expect((await call("PATCH", { prefs: { status: "yes" } })).status).toBe(422);
    res = await call("PATCH", { feedbackEmails: true, prefs: DEFAULT_FEEDBACK_EMAIL_PREFS });
    expect(res.body.prefs).toEqual(DEFAULT_FEEDBACK_EMAIL_PREFS);
  });

  test("muted tickets are listed with handle and clipped comment", async () => {
    const me = await getDefaultTrainerId();
    const ctx = unpinnedContext("/x", { viewport: { width: 1, height: 1, dpr: 1 }, userAgent: "t", appVersion: "t" });
    const [item] = await db
      .insert(feedbackItems)
      .values({ trainerId: me, comment: `long ${"x".repeat(200)}`, route: "/x", context: ctx })
      .returning({ id: feedbackItems.id, number: feedbackItems.number });
    try {
      await db.insert(feedbackMutes).values({ trainerId: me, itemId: item.id });
      const [m] = (await call("GET")).body.muted;
      expect(m).toMatchObject({ itemId: item.id, number: item.number, handle: `FB-${String(item.number).padStart(3, "0")}` });
      expect(m.comment.length).toBe(80);
      expect(m.comment.endsWith("…")).toBe(true);
    } finally {
      await db.delete(feedbackItems).where(eq(feedbackItems.id, item.id));
    }
    expect((await call("GET")).body.muted).toEqual([]);
  });
});
