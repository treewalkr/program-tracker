import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, feedbackItems, trainers } from "@pt/db";
import { unpinnedContext, type FeedbackAiMode } from "@pt/shared";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { agentTokenMatches } from "./lib/feedback-ai";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackItems.id }).from(feedbackItems).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping agent feedback DB tests");
}

const TOKEN = "agent-test-token-0123456789";
const context = unpinnedContext("/clients", {
  viewport: { width: 1280, height: 800, dpr: 1 },
  userAgent: "test",
  appVersion: "0.1.12+abc1234",
});

/**
 * `as`: "admin" (AUTH_DISABLED, the oldest trainer), a session token (guard on),
 * or { bearer } for the agent (guard on, no cookie).
 */
type As = "admin" | string | { bearer: string | null };
const call = async (method: string, path: string, body?: unknown, as: As = "admin") => {
  const prev = process.env.AUTH_DISABLED;
  if (as !== "admin") process.env.AUTH_DISABLED = "false";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof as === "string" && as !== "admin") headers.cookie = `${SESSION_COOKIE}=${as}`;
  if (typeof as === "object" && as.bearer !== null) headers.authorization = `Bearer ${as.bearer}`;
  try {
    return await app.handle(
      new Request(`http://local${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    );
  } finally {
    process.env.AUTH_DISABLED = prev;
  }
};
const json = async (res: Response) => (await res.json()) as any;
const agent = { bearer: TOKEN };

describe("agentTokenMatches", () => {
  test("needs the exact bearer token, and a configured one", () => {
    expect(agentTokenMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(agentTokenMatches(`bearer  ${TOKEN} `, TOKEN)).toBe(true);
    expect(agentTokenMatches(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(agentTokenMatches(TOKEN, TOKEN)).toBe(false);
    expect(agentTokenMatches(undefined, TOKEN)).toBe(false);
    expect(agentTokenMatches(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(agentTokenMatches("Bearer ", "")).toBe(false);
  });
});

describe.skipIf(!dbUp)("feedback agent API", () => {
  const EMAIL = "fb-agent-kai@example.com";
  const ENV = { RESEND_API_KEY: "re_test", EMAIL_FROM: "PT <fb@pinroj.com>", APP_URL: "https://pt.test", FEEDBACK_AGENT_TOKEN: TOKEN };
  const saved: Record<string, string | undefined> = {};
  const origFetch = globalThis.fetch;
  let sent: { to: string; subject: string; text: string }[] = [];
  let kai = "";
  let adminEmail = "";
  const items: string[] = [];

  beforeAll(async () => {
    for (const k of [...Object.keys(ENV), "ADMIN_EMAIL"]) saved[k] = process.env[k];
    Object.assign(process.env, ENV);
    const [admin] = await db.select().from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    adminEmail = admin.email;
    process.env.ADMIN_EMAIL = admin.email;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      if (!String(input).startsWith("https://api.resend.com/")) return origFetch(input, init);
      const b = JSON.parse(String(init?.body));
      sent.push({ to: b.to[0], subject: b.subject, text: b.text });
      return Response.json({ id: crypto.randomUUID() });
    }) as typeof fetch;
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
    const [row] = await db.insert(trainers).values({ name: "Kai", email: EMAIL }).returning({ id: trainers.id });
    kai = (await createSession(row.id)).token;
  });
  afterAll(async () => {
    globalThis.fetch = origFetch;
    await setMode("drafts");
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (items.length) await db.delete(feedbackItems).where(inArray(feedbackItems.id, items));
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
  });

  const flush = async () => {
    await settleFeedbackNotifications();
    const out = sent;
    sent = [];
    return out;
  };
  const setMode = async (mode: FeedbackAiMode) =>
    expect((await call("PUT", "/v1/account/feedback-ai", { mode })).status).toBe(200);
  /** Kai files a ticket; returns its id. */
  const ticket = async (comment: string) => {
    const id = (await json(await call("POST", "/v1/feedback", { comment, context }, kai))).id as string;
    items.push(id);
    await flush();
    return id;
  };
  const inbox = async () => (await json(await call("GET", "/v1/agent/feedback/inbox", undefined, agent))) as any[];
  const inInbox = async (id: string) => (await inbox()).find((i) => i.id === id);
  const answer = (id: string, body: Record<string, unknown>) =>
    call("POST", `/v1/agent/feedback/${id}/answer`, {
      note: "Exists: Settings → Email.",
      verdict: "exists",
      confidence: "high",
      citations: ["apps/web/src/routes/settings/+page.svelte:220"],
      ...body,
    }, agent);
  const basisOf = async (id: string) => (await inInbox(id))?.basis as string;
  const asKai = async (id: string) => json(await call("GET", `/v1/feedback/${id}`, undefined, kai));
  const asAdmin = async (id: string) => json(await call("GET", `/v1/feedback/${id}`));

  test("only the agent token gets in — not a session, not a wrong token, not with the env unset", async () => {
    expect((await call("GET", "/v1/agent/feedback/inbox", undefined, { bearer: null })).status).toBe(401);
    expect((await call("GET", "/v1/agent/feedback/inbox", undefined, { bearer: "nope" })).status).toBe(401);
    expect((await call("GET", "/v1/agent/feedback/inbox", undefined, kai)).status).toBe(401);
    // auth-disabled mode (the admin) is no way in either
    expect((await call("GET", "/v1/agent/feedback/inbox")).status).toBe(401);
    expect((await call("GET", "/v1/agent/feedback/inbox", undefined, agent)).status).toBe(200);

    delete process.env.FEEDBACK_AGENT_TOKEN;
    try {
      expect((await call("GET", "/v1/agent/feedback/inbox", undefined, agent)).status).toBe(401);
    } finally {
      process.env.FEEDBACK_AGENT_TOKEN = TOKEN;
    }
  });

  test("the agent token opens no other route", async () => {
    expect((await call("GET", "/v1/feedback", undefined, agent)).status).toBe(401);
    expect((await call("GET", "/v1/feedback/export", undefined, agent)).status).toBe(401);
    expect((await call("GET", "/v1/account/feedback-ai", undefined, agent)).status).toBe(401);
  });

  test("the inbox holds open tickets where the reporter spoke last", async () => {
    const id = await ticket("Where do I turn off emails?");
    const entry = await inInbox(id);
    expect(entry).toMatchObject({ handle: expect.stringMatching(/^FB-\d+$/), status: "new", build: "0.1.12+abc1234" });
    expect(entry.basis).toMatch(/^[0-9a-f]{8}$/);
    expect(entry.markdown).toContain("> Where do I turn off emails?");
    expect(entry.shots).toEqual({ element: false, page: false });

    await call("POST", `/v1/feedback/${id}/comments`, { body: "Looking into it" });
    expect(await inInbox(id)).toBeUndefined();

    await call("POST", `/v1/feedback/${id}/comments`, { body: "On my phone" }, kai);
    const back = await inInbox(id);
    expect(back.basis).not.toBe(entry.basis);

    await call("PATCH", `/v1/feedback/${id}`, { status: "done" });
    expect(await inInbox(id)).toBeUndefined();
    await flush();
  });

  test("screenshots are served to the agent as bytes, with their type", async () => {
    const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const body = { comment: "shot", context, elementShot: `data:image/png;base64,${PNG_B64}` };
    const id = (await json(await call("POST", "/v1/feedback", body, kai))).id as string;
    items.push(id);
    await flush();
    expect((await inInbox(id)).shots).toEqual({ element: true, page: false });
    const res = await call("GET", `/v1/agent/feedback/${id}/shots/element`, undefined, agent);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-shot-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PNG_B64, "base64"))).toBe(true);
    expect((await call("GET", `/v1/agent/feedback/${id}/shots/page`, undefined, agent)).status).toBe(404);
    expect((await call("GET", `/v1/agent/feedback/${id}/shots/element`, undefined, kai)).status).toBe(401);
  });

  test("drafts mode: the reply waits as a draft, invisible to the reporter, and nobody is emailed", async () => {
    await setMode("drafts");
    const id = await ticket("How do I add a client?");
    const unreadBefore = (await json(await call("GET", "/v1/feedback/unread", undefined, kai))).count;
    const res = await answer(id, { basis: await basisOf(id), reply: "Use **New client** on the Clients page." });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ outcome: "drafted", noteId: expect.any(String), replyId: expect.any(String) });
    expect(await flush()).toEqual([]);
    expect(await inInbox(id)).toBeUndefined();

    // the admin sees both, with the agent's meta
    const admin = await asAdmin(id);
    expect(admin.thread.map((c: any) => [c.authorKind, c.visibility])).toEqual([
      ["ai", "private"],
      ["ai", "draft"],
    ]);
    expect(admin.thread[0]).toMatchObject({ author: null, aiMeta: { verdict: "exists", confidence: "high", citations: ["apps/web/src/routes/settings/+page.svelte:220"] } });

    // the reporter sees neither — on the item, in the list, and in their unread count
    const mine = await asKai(id);
    expect(mine.thread).toEqual([]);
    expect(mine.unread).toBe(false);
    const listed = (await json(await call("GET", "/v1/feedback", undefined, kai))).find((i: any) => i.id === id);
    expect(listed.thread).toEqual([]);
    expect(JSON.stringify(listed)).not.toContain("New client");
    expect((await json(await call("GET", "/v1/feedback/unread", undefined, kai))).count).toBe(unreadBefore);
  });

  test("a stale basis or a second answer for the same version is a 409", async () => {
    await setMode("drafts");
    const id = await ticket("Stale?");
    const basis = await basisOf(id);
    await call("POST", `/v1/feedback/${id}/comments`, { body: "More detail" }, kai);
    const stale = await answer(id, { basis, reply: "x" });
    expect(stale.status).toBe(409);
    const fresh = (await json(stale)).basis;
    expect(fresh).not.toBe(basis);
    expect((await answer(id, { basis: fresh, reply: "x" })).status).toBe(200);
    expect((await answer(id, { basis: fresh, reply: "x" })).status).toBe(409);
    await flush();
  });

  test("validates the answer", async () => {
    const id = await ticket("Validate");
    const basis = await basisOf(id);
    expect((await answer(id, { basis, verdict: "maybe" })).status).toBe(422);
    expect((await answer(id, { basis, confidence: "sure" })).status).toBe(422);
    expect((await answer(id, { basis, reply: "x".repeat(2001) })).status).toBe(422);
    expect((await answer(id, { basis, note: "" })).status).toBe(422);
    expect((await answer("00000000-0000-4000-8000-000000000000", { basis })).status).toBe(404);
  });

  test("a note without a reply is stored privately", async () => {
    const id = await ticket("Note only");
    const out = await json(await answer(id, { basis: await basisOf(id), verdict: "bug", confidence: "medium" }));
    expect(out).toMatchObject({ outcome: "noted", replyId: null });
    expect((await asAdmin(id)).thread.map((c: any) => c.visibility)).toEqual(["private"]);
  });

  const cases: [FeedbackAiMode, string, string, "sent" | "drafted"][] = [
    ["auto", "high", "exists", "sent"],
    ["auto", "high", "shipped", "sent"],
    ["auto", "high", "how_to", "sent"],
    ["auto", "medium", "exists", "drafted"],
    ["auto", "low", "how_to", "drafted"],
    ["auto", "high", "bug", "drafted"],
    ["auto", "high", "feature", "drafted"],
    ["auto", "high", "unclear", "drafted"],
    ["drafts", "high", "exists", "drafted"],
  ];
  for (const [mode, confidence, verdict, want] of cases) {
    test(`${mode} · ${confidence} · ${verdict} → ${want}`, async () => {
      await setMode(mode);
      const id = await ticket(`${mode} ${confidence} ${verdict}`);
      const res = await answer(id, { basis: await basisOf(id), reply: "It's already there.", confidence, verdict });
      expect((await json(res)).outcome).toBe(want);
      const mails = await flush();
      const kaiThread = (await asKai(id)).thread;
      if (want === "sent") {
        expect(kaiThread).toEqual([
          expect.objectContaining({ authorKind: "ai", visibility: "public", author: null, aiMeta: null, body: "It's already there." }),
        ]);
        expect((await asKai(id)).unread).toBe(true);
        expect(mails.map((m) => m.to).sort()).toEqual([adminEmail, EMAIL].sort());
        expect(mails.find((m) => m.to === EMAIL)!.subject).toMatch(/AI answer to your feedback$/);
      } else {
        expect(kaiThread).toEqual([]);
        expect(mails).toEqual([]);
      }
    });
  }

  test("at most one AI answer goes out per reporter message", async () => {
    await setMode("auto");
    const id = await ticket("Cap");
    expect((await json(await answer(id, { basis: await basisOf(id), reply: "First" }))).outcome).toBe("sent");
    // the reporter hasn't written since: a further confident answer only drafts
    const basis = (await json(await answer(id, { basis: "x", reply: "y" }))).basis;
    expect((await json(await answer(id, { basis, reply: "Second" }))).outcome).toBe("drafted");
    // once they reply, the agent may answer on its own again
    await call("POST", `/v1/feedback/${id}/comments`, { body: "That didn't work" }, kai);
    expect((await json(await answer(id, { basis: await basisOf(id), reply: "Third" }))).outcome).toBe("sent");
    expect((await asKai(id)).thread.map((c: any) => c.body)).toEqual(["First", "That didn't work", "Third"]);
    await flush();
  });

  test("mode off: the agent may not answer", async () => {
    await setMode("off");
    const id = await ticket("Off");
    expect((await answer(id, { basis: await basisOf(id), reply: "x" })).status).toBe(403);
    await setMode("drafts");
  });

  test("the admin sends an edited draft: the reporter sees it and is emailed; the admin is not", async () => {
    await setMode("drafts");
    const id = await ticket("Publish me");
    const { replyId, noteId } = await json(await answer(id, { basis: await basisOf(id), reply: "Draft text" }));
    expect((await call("POST", `/v1/feedback/${id}/comments/${replyId}/publish`, { body: "Edited" }, kai)).status).toBe(403);

    const res = await call("POST", `/v1/feedback/${id}/comments/${replyId}/publish`, { body: "  Edited text " });
    expect(res.status).toBe(200);
    const after = await json(res);
    expect(after.thread.find((c: any) => c.id === replyId)).toMatchObject({ visibility: "public", body: "Edited text" });
    const mails = await flush();
    expect(mails.map((m) => m.to)).toEqual([EMAIL]);
    expect(mails[0].subject).toMatch(/AI answer to your feedback$/);
    expect(mails[0].text).toContain("Edited text");
    expect((await asKai(id)).thread.map((c: any) => c.body)).toEqual(["Edited text"]);

    // already sent: neither publish nor discard touches it
    expect((await call("POST", `/v1/feedback/${id}/comments/${replyId}/publish`, {})).status).toBe(404);
    expect((await call("DELETE", `/v1/feedback/${id}/comments/${replyId}`)).status).toBe(404);
    // the private note can be discarded, by the admin only
    expect((await call("DELETE", `/v1/feedback/${id}/comments/${noteId}`, undefined, kai)).status).toBe(403);
    expect((await call("DELETE", `/v1/feedback/${id}/comments/${noteId}`)).status).toBe(200);
    expect((await asAdmin(id)).thread.map((c: any) => c.id)).toEqual([replyId]);
  });

  test("the admin discards a draft without anyone hearing", async () => {
    await setMode("drafts");
    const id = await ticket("Discard me");
    const { replyId } = await json(await answer(id, { basis: await basisOf(id), reply: "Nope" }));
    expect((await call("DELETE", `/v1/feedback/${id}/comments/${replyId}`)).status).toBe(200);
    expect((await asAdmin(id)).thread.some((c: any) => c.id === replyId)).toBe(false);
    expect(await flush()).toEqual([]);
  });

  test("the AI mode setting is admin only", async () => {
    expect((await call("GET", "/v1/account/feedback-ai", undefined, kai)).status).toBe(403);
    expect((await call("PUT", "/v1/account/feedback-ai", { mode: "auto" }, kai)).status).toBe(403);
    expect((await call("PUT", "/v1/account/feedback-ai", { mode: "sometimes" })).status).toBe(422);
    await setMode("auto");
    expect(await json(await call("GET", "/v1/account/feedback-ai"))).toEqual({ mode: "auto" });
    await setMode("drafts");
  });
});
