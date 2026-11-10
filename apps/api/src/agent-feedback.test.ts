import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, feedbackAttachments, feedbackComments, feedbackItems, trainers } from "@pt/db";
import { feedbackHandle, unpinnedContext, type FeedbackAiMode } from "@pt/shared";
import { API_VERSION } from "./lib/build";
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
  const multipart = body instanceof FormData;
  const headers: Record<string, string> = multipart ? {} : { "content-type": "application/json" };
  if (typeof as === "string" && as !== "admin") headers.cookie = `${SESSION_COOKIE}=${as}`;
  if (typeof as === "object" && as.bearer !== null) headers.authorization = `Bearer ${as.bearer}`;
  try {
    return await app.handle(
      new Request(`http://local${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      }),
    );
  } finally {
    process.env.AUTH_DISABLED = prev;
  }
};
const json = async (res: Response) => (await res.json()) as any;
const agent = { bearer: TOKEN };
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const pngFile = () => new File([Buffer.from(PNG_B64, "base64")], "shot.png", { type: "image/png" });

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
    const body = new FormData();
    body.append("comment", "shot");
    body.append("context", JSON.stringify(context));
    body.append("elementShot", pngFile());
    const id = (await json(await call("POST", "/v1/feedback", body, kai))).id as string;
    items.push(id);
    await flush();
    const entry = await inInbox(id);
    expect(entry.shots).toEqual({ element: true, page: false });
    expect(entry.attachments).toEqual([
      { id: expect.any(String), kind: "element", mime: "image/png", entry: "ticket", commentId: null, file: `${entry.handle}-1.png` },
    ]);
    const res = await call("GET", `/v1/agent/feedback/${id}/attachments/${entry.attachments[0].id}`, undefined, agent);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-shot-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PNG_B64, "base64"))).toBe(true);
    expect((await call("GET", `/v1/agent/feedback/${id}/attachments/${entry.attachments[0].id}`, undefined, kai)).status).toBe(401);

    // the old CLI's route still works for one release
    const old = await call("GET", `/v1/agent/feedback/${id}/shots/element`, undefined, agent);
    expect(old.status).toBe(200);
    expect(old.headers.get("x-shot-type")).toBe("image/png");
    expect((await call("GET", `/v1/agent/feedback/${id}/shots/page`, undefined, agent)).status).toBe(404);
    expect((await call("GET", `/v1/agent/feedback/${id}/shots/element`, undefined, kai)).status).toBe(401);
  });

  test("the inbox lists the images on public replies, not on drafts", async () => {
    const id = await ticket("The chart is cut off");
    const reply = new FormData();
    reply.append("body", "Like this");
    reply.append("images", pngFile());
    reply.append("images", pngFile());
    expect((await call("POST", `/v1/feedback/${id}/comments`, reply, kai)).status).toBe(201);
    // an AI draft carrying an image (as if one existed) stays out of the agent's view
    const [draft] = await db
      .insert(feedbackComments)
      .values({ itemId: id, kind: "reply", body: "draft", authorKind: "ai", visibility: "draft", createdAt: new Date(Date.now() - 60_000) })
      .returning({ id: feedbackComments.id });
    const [hidden] = await db
      .insert(feedbackAttachments)
      .values({ itemId: id, commentId: draft.id, kind: "upload", mime: "image/png", bytes: Buffer.from(PNG_B64, "base64") })
      .returning({ id: feedbackAttachments.id });
    await flush();

    const entry = await inInbox(id);
    expect(entry.attachments.map((a: any) => [a.kind, a.entry.startsWith("reply by Kai"), a.file])).toEqual([
      ["upload", true, `${entry.handle}-1.png`],
      ["upload", true, `${entry.handle}-2.png`],
    ]);
    expect(entry.attachments.every((a: any) => a.commentId && a.commentId !== draft.id)).toBe(true);
    // the Markdown points at each listed image, for the CLI to swap in the file path
    for (const a of entry.attachments) expect(entry.markdown).toContain(`(attachment:${a.id})`);
    expect(entry.markdown).not.toContain(hidden.id);
    expect((await call("GET", `/v1/agent/feedback/${id}/attachments/${hidden.id}`, undefined, agent)).status).toBe(404);
    // and an attachment id under the wrong ticket is a 404
    expect((await call("GET", `/v1/agent/feedback/${items[0]}/attachments/${entry.attachments[0].id}`, undefined, agent)).status).toBe(404);
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

  test("validates the fix plan and risk", async () => {
    const id = await ticket("Validate plan");
    const basis = await basisOf(id);
    const bug = { basis, verdict: "bug", confidence: "medium" };
    expect((await answer(id, { ...bug, risk: "huge" })).status).toBe(422);
    expect((await answer(id, { ...bug, fixPlan: "Open the file" })).status).toBe(422);
    expect((await answer(id, { ...bug, fixPlan: Array.from({ length: 9 }, (_, i) => `Step ${i}`) })).status).toBe(422);
    expect((await answer(id, { ...bug, fixPlan: ["x".repeat(301)] })).status).toBe(422);
    expect((await answer(id, { ...bug, fixPlan: [""] })).status).toBe(422);
    expect(await inInbox(id)).toBeDefined(); // nothing was stored
  });

  test("a bug answer stores its fix plan and risk on the private note", async () => {
    const id = await ticket("Plan me");
    const fixPlan = Array.from({ length: 8 }, (_, i) => `Step ${i + 1} in apps/web/src/lib/A.svelte`);
    const res = await answer(id, { basis: await basisOf(id), verdict: "bug", confidence: "medium", fixPlan, risk: "low" });
    expect(res.status).toBe(200);
    const [note] = (await asAdmin(id)).thread;
    expect(note).toMatchObject({ visibility: "private", aiMeta: { verdict: "bug", risk: "low", fixPlan } });
  });

  test("the export carries the current AI note's plan, and drops it once the ticket changes", async () => {
    const id = await ticket("Export my plan");
    const fixPlan = ["Open apps/web/src/routes/feedback/+page.svelte", "Hide the details by default"];
    await answer(id, { basis: await basisOf(id), verdict: "feature", confidence: "medium", note: "Plan note", fixPlan, risk: "medium" });
    const handle = (await asAdmin(id)).number;
    const section = async () => {
      const md = await (await call("GET", "/v1/feedback/export?status=new")).text();
      const start = md.indexOf(`## FB-${String(handle).padStart(3, "0")} ·`);
      expect(start).toBeGreaterThan(-1);
      const end = md.indexOf("\n## ", start + 1);
      return md.slice(start, end < 0 ? undefined : end);
    };
    const before = await section();
    expect(before).toContain("**AI triage (read the code,");
    expect(before).toContain("feature · medium confidence · medium risk");
    expect(before).toContain("1. Open apps/web/src/routes/feedback/+page.svelte\n    2. Hide the details by default");
    expect(before).toContain("> Plan note");

    await call("POST", `/v1/feedback/${id}/comments`, { body: "Also on mobile, please." }, kai);
    await flush();
    const after = await section();
    expect(after).not.toContain("AI triage");
    expect(after).not.toContain("Hide the details by default");
    expect(after).not.toContain("Plan note");
  });

  test("an answer without a plan stores none", async () => {
    const id = await ticket("No plan");
    await answer(id, { basis: await basisOf(id) });
    const meta = (await asAdmin(id)).thread[0].aiMeta;
    expect(meta.fixPlan).toBeUndefined();
    expect(meta.risk).toBeUndefined();
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
  describe("shipped: CI closes the tickets live commits name", () => {
    const SHA = "9f3c2a1d0b7e4c5a6b7c8d9e0f1a2b3c4d5e6f70";
    const SHA2 = "1111111111111111111111111111111111111111";
    const shipped = (commits: { sha: string; subject: string; handles: number[] }[], as: As = agent) =>
      call("POST", "/v1/agent/feedback/shipped", { commits }, as);
    const numberOf = async (id: string) => (await asAdmin(id)).number as number;
    const commit = (sha: string, ...handles: number[]) => ({ sha, subject: `fix: thing (${handles.map((n) => `FB-${n}`).join(", ")})`, handles });

    test("only the agent token gets in", async () => {
      expect((await shipped([], { bearer: null })).status).toBe(401);
      expect((await shipped([], kai)).status).toBe(401);
      expect((await shipped([], "admin")).status).toBe(401);
      expect((await shipped([{ sha: "not-a-sha", subject: "x", handles: [1] }])).status).toBe(422);
      expect(await json(await shipped([]))).toEqual({ version: API_VERSION, closed: [], skipped: [], unknown: [] });
    });

    test("closes new and accepted tickets with the live version, a release entry, a note and the status email", async () => {
      const a = await ticket("The rest timer is hard to read");
      const b = await ticket("ตัวจับเวลาพักอ่านยาก");
      await call("PATCH", `/v1/feedback/${b}`, { status: "accepted" });
      await flush();
      const [na, nb] = [await numberOf(a), await numberOf(b)];

      const res = await json(await shipped([commit(SHA, na, nb)]));
      expect(res.closed).toEqual([
        { handle: feedbackHandle(na), number: na, sha: SHA },
        { handle: feedbackHandle(nb), number: nb, sha: SHA },
      ]);

      const item = await asKai(a);
      expect(item).toMatchObject({ status: "done", shippedIn: API_VERSION });
      const [status, note] = item.thread;
      expect(status).toMatchObject({
        kind: "status", status: "done", authorKind: "system", author: null, visibility: "public",
        ship: { sha: SHA, version: API_VERSION },
      });
      expect(note).toMatchObject({ kind: "reply", authorKind: "system", visibility: "public", body: `Shipped in v${API_VERSION} — reload the app to get it.` });
      expect((await asKai(b)).thread.at(-1).body).toBe(`ปล่อยแล้วในเวอร์ชัน v${API_VERSION} — รีโหลดแอปเพื่อใช้งาน`);
      // counts as news for the reporter
      expect((await asKai(a)).unread).toBe(true);

      const mails = await flush();
      expect(mails.map((m) => m.to)).toEqual([EMAIL, EMAIL]);
      expect(mails.map((m) => m.subject).sort()).toEqual(
        [`[${feedbackHandle(na)}] Shipped in v${API_VERSION}`, `[${feedbackHandle(nb)}] Shipped in v${API_VERSION}`].sort(),
      );
    });

    test("skips done and won't-fix tickets and reports unknown numbers, without touching them", async () => {
      const done = await ticket("Already done");
      const wont = await ticket("Won't fix this");
      await call("PATCH", `/v1/feedback/${done}`, { status: "done" });
      await call("PATCH", `/v1/feedback/${wont}`, { status: "wontfix" });
      await flush();
      const [nd, nw] = [await numberOf(done), await numberOf(wont)];
      const before = (await asAdmin(done)).thread.length;

      const res = await json(await shipped([commit(SHA, nd, nw, 999999)]));
      expect(res.closed).toEqual([]);
      expect(res.skipped).toEqual([
        { handle: feedbackHandle(nd), number: nd, sha: SHA, reason: "done" },
        { handle: feedbackHandle(nw), number: nw, sha: SHA, reason: "wontfix" },
      ]);
      expect(res.unknown).toEqual([{ handle: "FB-999999", number: 999999, sha: SHA }]);
      expect((await asAdmin(done)).thread).toHaveLength(before);
      expect((await asAdmin(wont)).status).toBe("wontfix");
      expect(await flush()).toEqual([]);
    });

    test("a commit closes a ticket at most once: after a reopen it stays open, a new commit closes it again", async () => {
      const id = await ticket("Reopen me");
      const n = await numberOf(id);
      expect((await json(await shipped([commit(SHA, n)]))).closed).toHaveLength(1);
      await call("PATCH", `/v1/feedback/${id}`, { status: "accepted" });
      await flush();

      // the next deploy covers the same commit again
      const again = await json(await shipped([commit(SHA, n)]));
      expect(again.closed).toEqual([]);
      expect(again.skipped).toEqual([{ handle: feedbackHandle(n), number: n, sha: SHA, reason: "already-shipped" }]);
      expect((await asAdmin(id)).status).toBe("accepted");
      expect(await flush()).toEqual([]);

      // two commits naming it in one push: the first closes it, the second sees it done
      const next = await json(await shipped([commit(SHA2, n), commit(SHA, n)]));
      expect(next.closed).toEqual([{ handle: feedbackHandle(n), number: n, sha: SHA2 }]);
      expect(next.skipped.map((s: any) => s.reason)).toEqual(["done"]);
      expect((await asAdmin(id)).status).toBe("done");
      await flush();
    });

    test("respects the reporter's email prefs", async () => {
      const id = await ticket("Quiet please");
      await call("PUT", `/v1/feedback/${id}/mute`, undefined, kai);
      expect((await json(await shipped([commit(SHA, await numberOf(id))]))).closed).toHaveLength(1);
      expect(await flush()).toEqual([]);
    });
  });
});
