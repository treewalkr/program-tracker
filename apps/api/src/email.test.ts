import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, feedbackItems, feedbackMutes, trainers } from "@pt/db";
import { DEFAULT_FEEDBACK_EMAIL_PREFS, unpinnedContext } from "@pt/shared";
import { ensureEmailToken, parseScope, resetEmailToken } from "./lib/email-links";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping email unsubscribe DB tests");
}

describe("parseScope", () => {
  test("reads all, events and tickets; rejects the rest", () => {
    expect(parseScope("all")).toEqual({ kind: "all" });
    expect(parseScope("event:replies")).toEqual({ kind: "event", event: "replies" });
    const id = "11111111-2222-3333-4444-555555555555";
    expect(parseScope(`ticket:${id}`)).toEqual({ kind: "ticket", itemId: id });
    for (const bad of [undefined, "", "event:nope", "ticket:123", "everything"]) expect(parseScope(bad)).toBeNull();
  });
});

describe.skipIf(!dbUp)("email unsubscribe", () => {
  const EMAIL = "unsub-ren@example.com";
  let ren = "";
  let token = "";
  let item = "";
  let number = 0;

  // the guard is on: these links must work without a session
  const prevAuth = process.env.AUTH_DISABLED;
  beforeAll(async () => {
    process.env.AUTH_DISABLED = "false";
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
    [{ id: ren }] = await db.insert(trainers).values({ name: "Ren", email: EMAIL }).returning({ id: trainers.id });
    token = await ensureEmailToken(ren);
    const ctx = unpinnedContext("/x", { viewport: { width: 1, height: 1, dpr: 1 }, userAgent: "t", appVersion: "t" });
    [{ id: item, number }] = await db
      .insert(feedbackItems)
      .values({ trainerId: ren, comment: "hi", route: "/x", context: ctx })
      .returning({ id: feedbackItems.id, number: feedbackItems.number });
  });
  afterAll(async () => {
    process.env.AUTH_DISABLED = prevAuth;
    await db.delete(feedbackItems).where(eq(feedbackItems.id, item));
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
  });
  beforeEach(async () => {
    await db
      .update(trainers)
      .set({ feedbackEmails: true, feedbackEmailPrefs: DEFAULT_FEEDBACK_EMAIL_PREFS })
      .where(eq(trainers.id, ren));
    await db.delete(feedbackMutes).where(eq(feedbackMutes.trainerId, ren));
  });

  const url = (scope: string, t = token) =>
    `http://local/v1/email/unsubscribe?t=${encodeURIComponent(t)}&scope=${encodeURIComponent(scope)}`;
  const get = (scope: string, t?: string) => app.handle(new Request(url(scope, t)));
  const post = (scope: string, form: Record<string, string> = {}, t?: string) =>
    app.handle(
      new Request(url(scope, t), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      }),
    );
  const state = async () => {
    const [row] = await db
      .select({ on: trainers.feedbackEmails, prefs: trainers.feedbackEmailPrefs })
      .from(trainers)
      .where(eq(trainers.id, ren));
    const mutes = await db
      .select()
      .from(feedbackMutes)
      .where(and(eq(feedbackMutes.trainerId, ren), eq(feedbackMutes.itemId, item)));
    return { ...row, muted: mutes.length > 0 };
  };
  const fresh = { on: true, prefs: DEFAULT_FEEDBACK_EMAIL_PREFS, muted: false };
  const handle = () => `FB-${String(number).padStart(3, "0")}`;

  test("GET shows a confirm page and changes nothing", async () => {
    for (const [scope, ask] of [
      ["all", "Unsubscribe from all feedback emails?"],
      ["event:replies", "Stop reply emails?"],
      [`ticket:${item}`, `Mute ${handle()}?`],
    ]) {
      const res = await get(scope);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain(ask);
      expect(html).toContain('method="post"');
    }
    expect(await state()).toEqual(fresh);
  });

  test("POST all turns the master switch off; undo turns it back on", async () => {
    const res = await post("all");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Done");
    expect(html).toContain('name="undo" value="1"');
    expect(html).toContain("/settings");
    expect((await state()).on).toBe(false);
    await post("all", { undo: "1" });
    expect(await state()).toEqual(fresh);
  });

  test("POST event:X turns that pref off; undo restores it", async () => {
    await post("event:status");
    expect((await state()).prefs).toEqual({ ...DEFAULT_FEEDBACK_EMAIL_PREFS, status: false });
    await post("event:status", { undo: "1" });
    await post("event:newTickets");
    expect((await state()).prefs).toEqual({ ...DEFAULT_FEEDBACK_EMAIL_PREFS, newTickets: false });
    await post("event:newTickets", { undo: "1" });
    expect(await state()).toEqual(fresh);

    // replies: off, and undo puts back what it was ("mine" here)
    await db.update(trainers).set({ feedbackEmailPrefs: { ...DEFAULT_FEEDBACK_EMAIL_PREFS, replies: "mine" } }).where(eq(trainers.id, ren));
    const done = await (await post("event:replies")).text();
    expect((await state()).prefs.replies).toBe("off");
    expect(done).toContain('name="replies" value="mine"');
    await post("event:replies", { undo: "1", replies: "mine" });
    expect((await state()).prefs.replies).toBe("mine");
  });

  test("POST ticket mutes it (idempotent); undo unmutes", async () => {
    expect((await post(`ticket:${item}`)).status).toBe(200);
    expect((await post(`ticket:${item}`)).status).toBe(200);
    expect((await state()).muted).toBe(true);
    await post(`ticket:${item}`, { undo: "1" });
    expect(await state()).toEqual(fresh);
  });

  test("RFC 8058 one-click POST unsubscribes from all", async () => {
    const res = await post("all", { "List-Unsubscribe": "One-Click" });
    expect(res.status).toBe(200);
    expect((await state()).on).toBe(false);
  });

  test("bad token, bad scope or a gone ticket is a 404 page, and changes nothing", async () => {
    for (const res of [
      await get("all", "nope"),
      await post("all", {}, "nope"),
      await post("bogus"),
      await post("ticket:11111111-2222-3333-4444-555555555555"),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("This link is no longer valid");
    }
    expect(await state()).toEqual(fresh);
  });

  test("a reset token kills old links", async () => {
    const old = token;
    token = await resetEmailToken(ren);
    expect(token).not.toBe(old);
    expect((await post("all", {}, old)).status).toBe(404);
    expect(await ensureEmailToken(ren)).toBe(token);
  });

  test("interpolated values are escaped", async () => {
    const res = await get("all", `"><script>`);
    expect(await res.text()).not.toContain("<script>");
  });
});
