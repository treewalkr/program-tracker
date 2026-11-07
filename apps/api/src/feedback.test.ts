import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, feedbackItems, trainers } from "@pt/db";
import type { FeedbackContext } from "@pt/shared";
import { decodeShot, parseStatuses, shotMime } from "./lib/feedback";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { API_VERSION } from "./lib/build";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackItems.id }).from(feedbackItems).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping feedback DB tests");
}

// 1×1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const context: FeedbackContext = {
  route: { path: "/clients/c1", id: "/clients/[id]", params: { id: "c1" } },
  target: {
    source: { file: "apps/web/src/lib/components/SetChips.svelte", line: 12, column: 4 },
    chain: [{ type: "component", file: "apps/web/src/routes/clients/[id]/+page.svelte", line: 80, column: 2 }],
    tag: "span",
    text: "4×8",
    html: "<span>4×8</span>",
    headings: ["Ann"],
    selector: "main > span",
    rect: { x: 0, y: 0, width: 10, height: 10 },
  },
  pageData: { client: { name: "Ann" } },
  viewport: { width: 1280, height: 800, dpr: 2 },
  userAgent: "test",
  appVersion: "abc1234",
};

/**
 * No token: AUTH_DISABLED (the preload default) — the oldest trainer, as admin.
 * With a token: the guard is switched on for that one request.
 */
const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const prev = process.env.AUTH_DISABLED;
  if (token) process.env.AUTH_DISABLED = "false";
  try {
    return await app.handle(
      new Request(`http://local${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  } finally {
    process.env.AUTH_DISABLED = prev;
  }
};
const json = async (res: Response) => (await res.json()) as any;

describe("feedback helpers", () => {
  test("decodeShot accepts png data URLs and bare base64", () => {
    expect(shotMime(decodeShot(`data:image/png;base64,${PNG_B64}`)!)).toBe("image/png");
    expect(decodeShot(PNG_B64)!.byteLength).toBeGreaterThan(0);
    expect(decodeShot(undefined)).toBeNull();
  });
  test("decodeShot rejects non-image data URLs", () => {
    expect(() => decodeShot("data:text/html;base64,PGgxPg==")).toThrow();
  });
  test("parseStatuses keeps only known statuses", () => {
    expect(parseStatuses("accepted,bogus,new")).toEqual(["new", "accepted"]);
    expect(parseStatuses(undefined)).toBeNull();
  });
});

describe.skipIf(!dbUp)("feedback routes", () => {
  let id = "";
  let handle = "";

  test("submit stores the item with its source", async () => {
    const res = await call("POST", "/v1/feedback", {
      comment: "  I can't tell which sets are warm-ups.  ",
      context,
      elementShot: `data:image/png;base64,${PNG_B64}`,
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    id = body.id;
    handle = body.handle;
    expect(handle).toMatch(/^FB-\d{3,}$/);

    const item = await json(await call("GET", `/v1/feedback/${id}`));
    expect(item.status).toBe("new");
    expect(item.comment).toBe("I can't tell which sets are warm-ups.");
    expect(item.source).toBe("apps/web/src/lib/components/SetChips.svelte:12:4");
    expect(item.hasElementShot).toBe(true);
    expect(item.hasPageShot).toBe(false);
    const [me] = await db.select().from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    expect(item.author).toEqual({ id: me.id, name: me.name, avatarUrl: me.avatarUrl });
  });

  test("rejects an empty comment", async () => {
    const res = await call("POST", "/v1/feedback", { comment: "", context });
    expect(res.status).toBe(422);
  });

  test("serves the screenshot bytes", async () => {
    const res = await call("GET", `/v1/feedback/${id}/shot/element`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await call("GET", `/v1/feedback/${id}/shot/page`)).status).toBe(404);
  });

  test("new items stay out of the default export until accepted", async () => {
    const before = await (await call("GET", "/v1/feedback/export")).text();
    expect(before).not.toContain(handle);

    const patched = await json(
      await call("PATCH", `/v1/feedback/${id}`, { status: "accepted", triageNote: "muted chip for warm-ups" }),
    );
    expect(patched.status).toBe("accepted");

    const md = await (await call("GET", "/v1/feedback/export")).text();
    expect(md).toContain(`## ${handle} · accepted`);
    expect(md).toContain("> I can't tell which sets are warm-ups.");
    expect(md).toContain(`http://local/v1/feedback/${id}/shot/element`);
    expect(md).toContain("muted chip for warm-ups");

    const asJson = await json(await call("GET", "/v1/feedback/export?format=json"));
    expect(asJson.some((i: { id: string }) => i.id === id)).toBe(true);
  });

  test("agent check stores a verdict, feeds the ready export and goes stale on edits", async () => {
    const res = await call("POST", `/v1/feedback/${id}/agent-check`, { providerId: "mock" });
    expect(res.status).toBe(200);
    const item = await json(res);
    expect(item.agentCheck).toMatchObject({ verdict: "ready", risk: "low", questions: [], stale: false, model: "mock-draft-v1" });
    expect(item.agentCheck.plan.length).toBeGreaterThan(0);

    const ready = await (await call("GET", "/v1/feedback/export?ready=true")).text();
    expect(ready).toContain(`## ${handle} · accepted`);
    expect(ready).toContain("**Agent check:** ready · low risk");

    await call("POST", `/v1/feedback/${id}/comments`, { body: "Also on the week view, please." });
    const after = await json(await call("GET", `/v1/feedback/${id}`));
    expect(after.agentCheck.stale).toBe(true);
    expect(await (await call("GET", "/v1/feedback/export?ready=true")).text()).not.toContain(handle);

    const again = await json(await call("POST", `/v1/feedback/${id}/agent-check`, { providerId: "mock" }));
    expect(again.agentCheck.stale).toBe(false);
  });

  test("agent check reports an unconfigured provider", async () => {
    const res = await call("POST", `/v1/feedback/${id}/agent-check`, { providerId: "nope" });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("not configured");
  });

  test("list filters by status", async () => {
    const accepted = await json(await call("GET", "/v1/feedback?status=accepted"));
    expect(accepted.every((i: { status: string }) => i.status === "accepted")).toBe(true);
    const done = await json(await call("GET", "/v1/feedback?status=done"));
    expect(done.some((i: { id: string }) => i.id === id)).toBe(false);
  });

  test("rejects an unknown status", async () => {
    expect((await call("PATCH", `/v1/feedback/${id}`, { status: "maybe" })).status).toBe(422);
  });

  test("delete removes it; missing ids 404", async () => {
    expect((await call("DELETE", `/v1/feedback/${id}`)).status).toBe(200);
    expect((await call("GET", `/v1/feedback/${id}`)).status).toBe(404);
    expect((await call("PATCH", `/v1/feedback/${id}`, { status: "done" })).status).toBe(404);
  });
});

describe.skipIf(!dbUp)("feedback visibility", () => {
  const EMAILS = ["fb-kai@example.com", "fb-mo@example.com"];
  let kai = "";
  let mo = "";
  let kaiItem = "";
  let adminItem = "";

  beforeAll(async () => {
    await db.delete(trainers).where(inArray(trainers.email, EMAILS));
    const rows = await db
      .insert(trainers)
      .values([
        { name: "Kai", email: EMAILS[0] },
        { name: "Mo", email: EMAILS[1] },
      ])
      .returning({ id: trainers.id });
    kai = (await createSession(rows[0].id)).token;
    mo = (await createSession(rows[1].id)).token;
    kaiItem = (await json(await call("POST", "/v1/feedback", { comment: "Kai's note", context }, kai))).id;
    adminItem = (await json(await call("POST", "/v1/feedback", { comment: "Admin's note", context }))).id;
  });
  afterAll(async () => {
    await db.delete(feedbackItems).where(inArray(feedbackItems.id, [kaiItem, adminItem]));
    await db.delete(trainers).where(inArray(trainers.email, EMAILS));
  });

  test("a trainer never sees the agent check on their own item", async () => {
    await call("POST", `/v1/feedback/${kaiItem}/agent-check`, { providerId: "mock" });
    expect((await json(await call("GET", `/v1/feedback/${kaiItem}`))).agentCheck.verdict).toBe("needs_info");
    expect((await json(await call("GET", `/v1/feedback/${kaiItem}`, undefined, kai))).agentCheck).toBeNull();
  });

  test("a trainer lists only their own items; the admin lists all", async () => {
    const mine = await json(await call("GET", "/v1/feedback", undefined, kai));
    expect(mine.map((i: { id: string }) => i.id)).toEqual([kaiItem]);
    expect(mine[0].author.name).toBe("Kai");
    expect(await json(await call("GET", "/v1/feedback", undefined, mo))).toEqual([]);
    const all = (await json(await call("GET", "/v1/feedback"))).map((i: { id: string }) => i.id);
    expect(all).toContain(kaiItem);
    expect(all).toContain(adminItem);
  });

  test("someone else's item and its screenshot are 404", async () => {
    expect((await call("GET", `/v1/feedback/${kaiItem}`, undefined, kai)).status).toBe(200);
    expect((await call("GET", `/v1/feedback/${kaiItem}`, undefined, mo)).status).toBe(404);
    expect((await call("GET", `/v1/feedback/${adminItem}/shot/element`, undefined, kai)).status).toBe(404);
  });

  test("reporter and admin talk on the thread; strangers cannot", async () => {
    const res = await call("POST", `/v1/feedback/${kaiItem}/comments`, { body: "  It's the log screen.  " }, kai);
    expect(res.status).toBe(201);
    const reply = await json(res);
    expect(reply).toMatchObject({ kind: "reply", body: "It's the log screen.", status: null });
    expect(reply.author.name).toBe("Kai");

    expect((await call("POST", `/v1/feedback/${kaiItem}/comments`, { body: "Got it" })).status).toBe(201);
    expect((await call("POST", `/v1/feedback/${kaiItem}/comments`, { body: "me too" }, mo)).status).toBe(404);
    expect((await call("POST", `/v1/feedback/${kaiItem}/comments`, { body: "   " }, kai)).status).toBe(422);

    const item = await json(await call("GET", `/v1/feedback/${kaiItem}`, undefined, kai));
    expect(item.thread.map((c: { body: string }) => c.body)).toEqual(["It's the log screen.", "Got it"]);
  });

  test("status changes land in the thread; done stamps the version", async () => {
    await call("PATCH", `/v1/feedback/${adminItem}`, { triageNote: "note only" });
    let item = await json(await call("GET", `/v1/feedback/${adminItem}`));
    expect(item.thread).toEqual([]);

    item = await json(await call("PATCH", `/v1/feedback/${adminItem}`, { status: "done" }));
    expect(item.shippedIn).toBe(API_VERSION);
    expect(item.thread.at(-1)).toMatchObject({ kind: "status", status: "done", body: null });

    item = await json(await call("PATCH", `/v1/feedback/${adminItem}`, { status: "done" }));
    expect(item.thread.filter((c: { kind: string }) => c.kind === "status")).toHaveLength(1);

    item = await json(await call("PATCH", `/v1/feedback/${adminItem}`, { status: "new" }));
    expect(item.shippedIn).toBeNull();
    expect(item.thread.map((c: { status: string }) => c.status)).toEqual(["done", "new"]);
  });

  test("unread follows the other side's activity", async () => {
    const unread = async (token?: string) => (await json(await call("GET", "/v1/feedback/unread", undefined, token))).count;
    const isUnread = async (token?: string) =>
      (await json(await call("GET", `/v1/feedback/${kaiItem}`, undefined, token))).unread;

    // The admin replied last (previous test), so Kai has news; the admin does not.
    expect(await isUnread(kai)).toBe(true);
    expect(await unread(kai)).toBe(1);
    expect(await isUnread()).toBe(false);

    expect((await call("POST", `/v1/feedback/${kaiItem}/seen`, undefined, kai)).status).toBe(200);
    expect(await unread(kai)).toBe(0);
    expect((await call("POST", `/v1/feedback/${kaiItem}/seen`, undefined, mo)).status).toBe(404);

    // Kai's own reply is not news to Kai, but is to the admin.
    await call("POST", `/v1/feedback/${kaiItem}/comments`, { body: "Thanks!" }, kai);
    expect(await isUnread(kai)).toBe(false);
    expect(await isUnread()).toBe(true);

    // An admin status change is news to Kai again.
    await call("PATCH", `/v1/feedback/${kaiItem}`, { status: "accepted" });
    expect(await isUnread(kai)).toBe(true);
    expect(await isUnread()).toBe(false);
  });

  test("mute is per viewer, needs visibility, and leaves unread alone", async () => {
    const get = async (token?: string) => json(await call("GET", `/v1/feedback/${kaiItem}`, undefined, token));
    expect((await get(kai)).muted).toBe(false);
    expect((await call("PUT", `/v1/feedback/${kaiItem}/mute`, undefined, kai)).status).toBe(200);
    expect((await call("PUT", `/v1/feedback/${kaiItem}/mute`, undefined, kai)).status).toBe(200);
    expect((await get(kai)).muted).toBe(true);
    expect((await get()).muted).toBe(false);
    const listed = await json(await call("GET", "/v1/feedback", undefined, kai));
    expect(listed[0].muted).toBe(true);

    // muted still shows news
    await call("POST", `/v1/feedback/${kaiItem}/comments`, { body: "ping" });
    expect((await get(kai)).unread).toBe(true);

    expect((await call("PUT", `/v1/feedback/${kaiItem}/mute`, undefined, mo)).status).toBe(404);
    expect((await call("DELETE", `/v1/feedback/${kaiItem}/mute`, undefined, mo)).status).toBe(404);
    expect(await json(await call("DELETE", `/v1/feedback/${kaiItem}/mute`, undefined, kai))).toEqual({ muted: false });
    expect((await get(kai)).muted).toBe(false);
  });

  test("triage, delete and export are admin only", async () => {
    for (const res of [
      await call("PATCH", `/v1/feedback/${kaiItem}`, { status: "accepted" }, kai),
      await call("DELETE", `/v1/feedback/${kaiItem}`, undefined, kai),
      await call("GET", "/v1/feedback/export", undefined, kai),
      await call("POST", `/v1/feedback/${kaiItem}/agent-check`, { providerId: "mock" }, kai),
    ]) {
      expect(res.status).toBe(403);
      expect(await json(res)).toEqual({ error: "admin only" });
    }
    expect((await call("PATCH", `/v1/feedback/${kaiItem}`, { status: "accepted" })).status).toBe(200);
  });
});

describe.skipIf(!dbUp)("feedback emails", () => {
  const EMAIL = "fb-ren@example.com";
  const ENV = { RESEND_API_KEY: "re_test", EMAIL_FROM: "PT <fb@pinroj.com>", APP_URL: "https://pt.test" };
  const saved: Record<string, string | undefined> = {};
  const origFetch = globalThis.fetch;
  let sent: { to: string; subject: string }[] = [];
  let lastUnsubscribe: string | undefined;
  let ren = "";
  let item = "";

  beforeAll(async () => {
    for (const k of [...Object.keys(ENV), "ADMIN_EMAIL"]) saved[k] = process.env[k];
    Object.assign(process.env, ENV);
    const [admin] = await db.select().from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    process.env.ADMIN_EMAIL = admin.email;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      if (!String(input).startsWith("https://api.resend.com/")) return origFetch(input, init);
      const b = JSON.parse(String(init?.body));
      sent.push({ to: b.to[0], subject: b.subject });
      lastUnsubscribe = b.headers?.["List-Unsubscribe"];
      return Response.json({ id: crypto.randomUUID() });
    }) as typeof fetch;
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
    const [row] = await db.insert(trainers).values({ name: "Ren", email: EMAIL }).returning({ id: trainers.id });
    ren = (await createSession(row.id)).token;
  });
  afterAll(async () => {
    globalThis.fetch = origFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (item) await db.delete(feedbackItems).where(eq(feedbackItems.id, item));
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
  });
  const flush = async () => {
    await settleFeedbackNotifications();
    const out = sent;
    sent = [];
    return out;
  };

  test("new item, reply and status change each email the other side", async () => {
    const adminEmail = process.env.ADMIN_EMAIL!;
    item = (await json(await call("POST", "/v1/feedback", { comment: "Rest timer is too small", context }, ren))).id;
    expect(await flush()).toEqual([{ to: adminEmail, subject: expect.stringMatching(/^\[FB-\d+\] New feedback from Ren: "Rest timer is too small"$/) }]);

    await call("POST", `/v1/feedback/${item}/comments`, { body: "On which screen?" });
    expect((await flush()).map((e) => e.to)).toEqual([EMAIL]);

    await call("POST", `/v1/feedback/${item}/comments`, { body: "The log screen" }, ren);
    expect((await flush()).map((e) => e.to)).toEqual([adminEmail]);

    await call("PATCH", `/v1/feedback/${item}`, { status: "accepted" });
    const accepted = await flush();
    expect(accepted.map((e) => e.to)).toEqual([EMAIL]);
    expect(accepted[0].subject).toMatch(/Accepted — on the build list$/);

    // the admin log keeps each send, masked and content-free
    const { sends } = await json(await call("GET", "/v1/admin/email-log?limit=10"));
    const mine = sends.filter((s: any) => s.recipient?.name === "Ren");
    expect(mine.map((s: any) => s.kind)).toEqual(["feedback.status", "feedback.reply"]);
    expect(mine[0]).toMatchObject({ label: expect.stringMatching(/^FB-\d+ · Accepted$/), error: null, recipient: { email: "f•••@example.com" } });
    expect(JSON.stringify(sends)).not.toContain(EMAIL);
    expect(JSON.stringify(sends)).not.toContain("Rest timer");
  });

  test("a muted ticket and an event pref stop the email; links carry a token", async () => {
    await call("PUT", `/v1/feedback/${item}/mute`, undefined, ren);
    await call("POST", `/v1/feedback/${item}/comments`, { body: "Muted?" });
    expect(await flush()).toEqual([]);
    await call("DELETE", `/v1/feedback/${item}/mute`, undefined, ren);

    await db.update(trainers).set({ feedbackEmailPrefs: { newTickets: true, replies: "off", status: true } }).where(eq(trainers.email, EMAIL));
    await call("POST", `/v1/feedback/${item}/comments`, { body: "Replies off?" });
    expect(await flush()).toEqual([]);
    await db.update(trainers).set({ feedbackEmailPrefs: { newTickets: true, replies: "all", status: true } }).where(eq(trainers.email, EMAIL));

    const [{ token }] = await db.select({ token: trainers.emailToken }).from(trainers).where(eq(trainers.email, EMAIL));
    expect(token).toBeTruthy();
    await call("POST", `/v1/feedback/${item}/comments`, { body: "Back on" });
    const [mail] = await flush();
    expect(mail.to).toBe(EMAIL);
    expect(lastUnsubscribe).toContain(`t=${token}&scope=all`);
  });

  test("note edits, unchanged status and deletes send nothing", async () => {
    const noted = await json(await call("PATCH", `/v1/feedback/${item}`, { triageNote: "bigger digits" }));
    expect(noted.status).toBe("accepted"); // a note alone never moves the status
    await call("PATCH", `/v1/feedback/${item}`, { status: "accepted" });
    await call("DELETE", `/v1/feedback/${item}`);
    item = "";
    expect(await flush()).toEqual([]);
  });
});
