import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, feedbackItems, trainers } from "@pt/db";
import { feedbackHandle, unpinnedContext } from "@pt/shared";
import { API_VERSION } from "./lib/build";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackItems.id }).from(feedbackItems).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping feedback duplicate DB tests");
}

const TOKEN = "dup-test-token-0123456789";
const context = unpinnedContext("/clients", {
  viewport: { width: 390, height: 800, dpr: 3 },
  userAgent: "test",
  appVersion: "0.1.20+abc1234",
});

/** "admin" (AUTH_DISABLED, the oldest trainer), a session token, or { bearer } for the agent. */
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

describe.skipIf(!dbUp)("duplicate tickets", () => {
  const KAI = "fb-dup-kai@example.com";
  const MO = "fb-dup-mo@example.com";
  const ENV = { RESEND_API_KEY: "re_test", EMAIL_FROM: "PT <fb@pinroj.com>", APP_URL: "https://pt.test", FEEDBACK_AGENT_TOKEN: TOKEN };
  const saved: Record<string, string | undefined> = {};
  const origFetch = globalThis.fetch;
  let sent: { to: string; subject: string; text: string }[] = [];
  let kai = "";
  let mo = "";
  const items: string[] = [];

  beforeAll(async () => {
    for (const k of [...Object.keys(ENV), "ADMIN_EMAIL"]) saved[k] = process.env[k];
    Object.assign(process.env, ENV);
    const [admin] = await db.select().from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    process.env.ADMIN_EMAIL = admin.email;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      if (!String(input).startsWith("https://api.resend.com/")) return origFetch(input, init);
      const b = JSON.parse(String(init?.body));
      sent.push({ to: b.to[0], subject: b.subject, text: b.text });
      return Response.json({ id: crypto.randomUUID() });
    }) as typeof fetch;
    await db.delete(trainers).where(inArray(trainers.email, [KAI, MO]));
    const rows = await db
      .insert(trainers)
      .values([{ name: "Kai", email: KAI }, { name: "Mo", email: MO }])
      .returning({ id: trainers.id, email: trainers.email });
    kai = (await createSession(rows.find((r) => r.email === KAI)!.id)).token;
    mo = (await createSession(rows.find((r) => r.email === MO)!.id)).token;
  });
  afterAll(async () => {
    globalThis.fetch = origFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (items.length) await db.delete(feedbackItems).where(inArray(feedbackItems.id, items));
    await db.delete(trainers).where(inArray(trainers.email, [KAI, MO]));
  });

  const flush = async () => {
    await settleFeedbackNotifications();
    const out = sent;
    sent = [];
    return out;
  };
  /** Files a ticket as `who`; returns its id and number. */
  const ticket = async (comment: string, who = kai) => {
    const res = await json(await call("POST", "/v1/feedback", { comment, context }, who));
    items.push(res.id);
    await flush();
    return { id: res.id as string, number: res.number as number };
  };
  const link = (id: string, of: number | null, as: As = "admin") => call("PUT", `/v1/feedback/${id}/duplicate`, { of }, as);
  const get = async (id: string, as: As = "admin") => json(await call("GET", `/v1/feedback/${id}`, undefined, as));

  test("the admin links and unlinks; both sides show it, to the reporters too", async () => {
    const orig = await ticket("Rest timer is too small");
    const dup = await ticket("Can't read the rest timer", mo);

    const res = await link(dup.id, orig.number);
    expect(res.status).toBe(200);
    expect((await json(res)).duplicateOf).toEqual({ number: orig.number, status: "new" });
    expect((await get(orig.id, kai)).duplicates).toEqual([{ number: dup.number, status: "new" }]);
    expect((await get(dup.id, mo)).duplicateOf).toEqual({ number: orig.number, status: "new" });
    // the list carries it too
    const list = await json(await call("GET", "/v1/feedback"));
    expect(list.find((i: any) => i.id === dup.id).duplicateOf.number).toBe(orig.number);

    // linking again is a no-op
    expect((await link(dup.id, orig.number)).status).toBe(200);

    const off = await json(await link(dup.id, null));
    expect(off.duplicateOf).toBeNull();
    expect((await get(orig.id)).duplicates).toEqual([]);
  });

  test("only the admin may link", async () => {
    const a = await ticket("A");
    const b = await ticket("B");
    expect((await link(b.id, a.number, kai)).status).toBe(403);
    expect((await link(b.id, null, kai)).status).toBe(403);
    expect((await get(b.id)).duplicateOf).toBeNull();
  });

  test("refuses self, unknown, closed, chains and tickets that have their own duplicates", async () => {
    const a = await ticket("Original");
    const b = await ticket("Repeat of A");
    const c = await ticket("Repeat of B");
    const closed = await ticket("Closed one");
    await call("PATCH", `/v1/feedback/${closed.id}`, { status: "wontfix" });
    await flush();

    expect((await link(a.id, a.number)).status).toBe(422);
    expect((await link(a.id, 999_999)).status).toBe(404);
    expect((await link(a.id, closed.number)).status).toBe(409);
    expect((await link(closed.id, a.number)).status).toBe(409);

    expect((await link(b.id, a.number)).status).toBe(200);
    // B is a duplicate, so it can't be an original: the error names A
    const chain = await link(c.id, b.number);
    expect(chain.status).toBe(409);
    expect((await json(chain)).error).toContain(feedbackHandle(a.number));
    // A has duplicates, so it can't become one
    const parent = await link(a.id, c.number);
    expect(parent.status).toBe(409);
    expect((await json(parent)).error).toContain(feedbackHandle(b.number));
    expect((await link("00000000-0000-4000-8000-000000000000", a.number)).status).toBe(404);
  });

  test("marking the original done closes its open duplicates, each with a status entry and email", async () => {
    const orig = await ticket("Export to PDF");
    const dup = await ticket("PDF export please", mo);
    const done = await ticket("Already closed repeat", mo);
    await link(dup.id, orig.number);
    await link(done.id, orig.number);
    await call("PATCH", `/v1/feedback/${done.id}`, { status: "wontfix" });
    await call("PATCH", `/v1/feedback/${orig.id}`, { status: "accepted" });
    await flush();

    expect((await call("PATCH", `/v1/feedback/${orig.id}`, { status: "done" })).status).toBe(200);
    const d = await get(dup.id, mo);
    expect(d).toMatchObject({ status: "done", shippedIn: API_VERSION });
    expect(d.thread.at(-1)).toMatchObject({ kind: "status", status: "done", authorKind: "human" });
    // an already-closed duplicate is left alone
    expect((await get(done.id)).status).toBe("wontfix");

    const mails = await flush();
    expect(mails.map((m) => [m.to, m.subject]).sort()).toEqual(
      [
        [KAI, `[${feedbackHandle(orig.number)}] Shipped in v${API_VERSION}`],
        [MO, `[${feedbackHandle(dup.number)}] Shipped in v${API_VERSION}`],
      ].sort(),
    );

    // reopening the original leaves the duplicate closed
    await call("PATCH", `/v1/feedback/${orig.id}`, { status: "new" });
    expect((await get(dup.id)).status).toBe("done");
    await flush();
  });

  test("won't fix carries the reason to each duplicate", async () => {
    const orig = await ticket("Dark mode");
    const dup = await ticket("Night theme", mo);
    await link(dup.id, orig.number);
    await call("PATCH", `/v1/feedback/${orig.id}`, { status: "wontfix", reason: "Not this year" });
    const d = await get(dup.id, mo);
    expect(d.status).toBe("wontfix");
    expect(d.thread.map((c: any) => [c.kind, c.body ?? c.status])).toEqual([
      ["reply", "Not this year"],
      ["status", "wontfix"],
    ]);
    const mails = await flush();
    const moMail = mails.find((m) => m.to === MO)!;
    expect(moMail.text).toContain("Not this year");
  });

  test("a deploy that closes the original ships its duplicates too", async () => {
    const SHA = "abcdefabcdefabcdefabcdefabcdefabcdef0042";
    const orig = await ticket("Bigger buttons");
    const dup = await ticket("ปุ่มเล็กไป", mo);
    await link(dup.id, orig.number);
    const res = await json(
      await call("POST", "/v1/agent/feedback/shipped", { commits: [{ sha: SHA, subject: "fix: x", handles: [orig.number] }] }, agent),
    );
    expect(res.closed.map((c: any) => c.number)).toEqual([orig.number]);
    expect(res.closedDuplicates).toEqual([
      { handle: feedbackHandle(orig.number), number: orig.number, sha: SHA, duplicate: feedbackHandle(dup.number) },
    ]);
    const d = await get(dup.id, mo);
    expect(d).toMatchObject({ status: "done", shippedIn: API_VERSION });
    const [status, note] = d.thread;
    expect(status).toMatchObject({ kind: "status", status: "done", authorKind: "system", ship: { sha: SHA, version: API_VERSION } });
    expect(note.body).toBe(`ปล่อยแล้วในเวอร์ชัน v${API_VERSION} — รีโหลดแอปเพื่อใช้งาน`);
    expect((await flush()).map((m) => m.to).sort()).toEqual([KAI, MO].sort());

    // the same commit naming the duplicate later finds it already shipped
    const again = await json(
      await call("POST", "/v1/agent/feedback/shipped", { commits: [{ sha: SHA, subject: "fix: x", handles: [dup.number] }] }, agent),
    );
    expect(again.skipped[0].reason).toBe("done");
  });

  test("the agent lists open tickets and links a duplicate — with its token only", async () => {
    const orig = await ticket("Copy last week");
    const dup = await ticket("Duplicate last week's plan", mo);
    expect((await call("GET", "/v1/agent/feedback/open", undefined, kai)).status).toBe(401);
    expect((await call("POST", `/v1/agent/feedback/${dup.id}/duplicate`, { of: orig.number }, "admin")).status).toBe(401);

    const open = await json(await call("GET", "/v1/agent/feedback/open", undefined, agent));
    const row = open.find((t: any) => t.id === dup.id);
    expect(row).toMatchObject({ number: dup.number, handle: feedbackHandle(dup.number), status: "new", duplicateOf: null });

    const res = await call("POST", `/v1/agent/feedback/${dup.id}/duplicate`, { of: orig.number }, agent);
    expect(await json(res)).toEqual({ linked: true, changed: true, of: feedbackHandle(orig.number) });
    const after = await json(await call("GET", "/v1/agent/feedback/open", undefined, agent));
    expect(after.find((t: any) => t.id === dup.id).duplicateOf).toBe(orig.number);
    // same rules as the admin's
    expect((await call("POST", `/v1/agent/feedback/${orig.id}/duplicate`, { of: dup.number }, agent)).status).toBe(409);
    // the inbox Markdown names the link
    const inbox = await json(await call("GET", "/v1/agent/feedback/inbox", undefined, agent));
    expect(inbox.find((t: any) => t.id === dup.id).markdown).toContain(`**Duplicate of:** ${feedbackHandle(orig.number)}`);
    expect(inbox.find((t: any) => t.id === orig.id).markdown).toContain(`**Duplicates:** ${feedbackHandle(dup.number)}`);
  });
});
