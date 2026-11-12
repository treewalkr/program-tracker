import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, feedbackItems, trainers } from "@pt/db";
import { feedbackHandle, unpinnedContext } from "@pt/shared";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackItems.id }).from(feedbackItems).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping fix agent DB tests");
}

const TOKEN = "fix-test-token-0123456789";
const context = unpinnedContext("/clients", {
  viewport: { width: 1280, height: 800, dpr: 1 },
  userAgent: "test",
  appVersion: "0.1.20+abc1234",
});

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
const PR = "https://github.com/treewalkr/program-tracker/pull/42";

describe.skipIf(!dbUp)("fix agent API", () => {
  const EMAIL = "fb-fix-kai@example.com";
  const saved: Record<string, string | undefined> = {};
  let kai = "";
  const items: string[] = [];

  beforeAll(async () => {
    saved.FEEDBACK_AGENT_TOKEN = process.env.FEEDBACK_AGENT_TOKEN;
    process.env.FEEDBACK_AGENT_TOKEN = TOKEN;
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
    const [row] = await db.insert(trainers).values({ name: "Kai", email: EMAIL }).returning({ id: trainers.id });
    kai = (await createSession(row.id)).token;
  });
  afterAll(async () => {
    await settleFeedbackNotifications();
    if (saved.FEEDBACK_AGENT_TOKEN === undefined) delete process.env.FEEDBACK_AGENT_TOKEN;
    else process.env.FEEDBACK_AGENT_TOKEN = saved.FEEDBACK_AGENT_TOKEN;
    if (items.length) await db.delete(feedbackItems).where(inArray(feedbackItems.id, items));
    await db.delete(trainers).where(eq(trainers.email, EMAIL));
  });

  const ticket = async (comment: string) => {
    const res = await json(await call("POST", "/v1/feedback", { comment, context }, kai));
    items.push(res.id);
    return { id: res.id as string, number: res.number as number, handle: feedbackHandle(res.number) };
  };
  const basisOf = async (id: string) =>
    (await json(await call("GET", "/v1/agent/feedback/inbox", undefined, agent))).find((t: any) => t.id === id).basis as string;
  const answer = async (id: string, over: Record<string, unknown> = {}) =>
    call(
      "POST",
      `/v1/agent/feedback/${id}/answer`,
      {
        basis: await basisOf(id),
        note: "Bug: the timer label is 10px.",
        verdict: "bug",
        confidence: "medium",
        citations: ["apps/web/src/lib/components/RestTimer.svelte:12"],
        fixPlan: ["In RestTimer.svelte, raise the label to 16px.", "Add a story for the large label."],
        risk: "low",
        ready: true,
        ...over,
      },
      agent,
    );
  const accept = (id: string) => call("PATCH", `/v1/feedback/${id}`, { status: "accepted" });
  const fixable = async (q = "") => json(await call("GET", `/v1/agent/feedback/fixable${q}`, undefined, agent));
  /** A ticket the fix agent should take: accepted, with a ready low-risk plan. */
  const readyTicket = async (comment: string) => {
    const t = await ticket(comment);
    expect((await answer(t.id)).status).toBe(200);
    await accept(t.id);
    return t;
  };

  test("ready is stored on the note, and needs a fix plan", async () => {
    const t = await ticket("Timer too small");
    expect((await answer(t.id, { fixPlan: undefined })).status).toBe(422);
    expect((await answer(t.id)).status).toBe(200);
    const note = (await json(await call("GET", `/v1/feedback/${t.id}`))).thread.find((c: any) => c.visibility === "private");
    expect(note.aiMeta).toMatchObject({ verdict: "bug", risk: "low", ready: true });
  });

  test("fixable lists accepted, low-risk, ready tickets and says why the rest are skipped", async () => {
    const good = await readyTicket("Bigger rest timer");
    const fresh = await ticket("Not accepted yet");
    await answer(fresh.id);
    const risky = await ticket("Rework the log sheet");
    await answer(risky.id, { risk: "medium" });
    await accept(risky.id);
    const notReady = await ticket("Maybe a dark mode");
    await answer(notReady.id, { verdict: "feature", ready: false });
    await accept(notReady.id);
    const howTo = await ticket("How do I copy a week?");
    await answer(howTo.id, { verdict: "how_to", confidence: "high", fixPlan: undefined, risk: undefined, ready: undefined });
    await accept(howTo.id);
    const stale = await readyTicket("Timer contrast");
    // the owner's triage note changes the basis: the AI's verdict no longer applies
    await call("PATCH", `/v1/feedback/${stale.id}`, { triageNote: "Use the brand blue" });
    const dup = await readyTicket("Timer is tiny");
    await call("PUT", `/v1/feedback/${dup.id}/duplicate`, { of: good.number });

    const res = await fixable();
    const listed = res.tickets.map((t: any) => t.id);
    expect(listed).toContain(good.id);
    for (const t of [fresh, risky, notReady, howTo, stale, dup]) expect(listed).not.toContain(t.id);
    const why = Object.fromEntries(res.skipped.map((s: any) => [s.handle, s.reason]));
    expect(why[risky.handle]).toBe("risk medium");
    expect(why[notReady.handle]).toBe("not ready");
    expect(why[howTo.handle]).toBe("verdict how_to");
    expect(why[stale.handle]).toBe("no current AI note");
    expect(why[dup.handle]).toBe(`duplicate of ${good.handle}`);
    expect(why[fresh.handle]).toBeUndefined(); // only accepted tickets are reported
    const row = res.tickets.find((t: any) => t.id === good.id);
    expect(row).toMatchObject({ handle: good.handle, fixPr: null });
    expect(row.markdown).toContain("ready to fix");
    expect(row.markdown).toContain("Fix plan:");
  });

  test("limit caps the list and counts the rest; 6 is over the cap", async () => {
    await readyTicket("One more");
    const one = await fixable("?limit=1");
    expect(one.tickets).toHaveLength(1);
    expect(one.more).toBeGreaterThanOrEqual(1);
    expect((await call("GET", "/v1/agent/feedback/fixable?limit=6", undefined, agent)).status).toBe(422);
  });

  test("pending counts the inbox and fixable tickets; its cursor moves only when the inbox does", async () => {
    const pending = async () => json(await call("GET", "/v1/agent/feedback/pending", undefined, agent));
    expect((await call("GET", "/v1/agent/feedback/pending", undefined, kai)).status).toBe(401);
    const before = await pending();
    expect(await pending()).toEqual(before);
    const t = await ticket("Pending check");
    const after = await pending();
    expect(after.inbox).toBe(before.inbox + 1);
    expect(after.cursor).not.toBe(before.cursor);
    expect(after.cursor).toMatch(/^[0-9a-f]{16}$/);
    // answering it takes it out of the inbox; accepting it makes it fixable
    expect((await answer(t.id)).status).toBe(200);
    await accept(t.id);
    const done = await pending();
    expect(done.inbox).toBe(before.inbox);
    expect(done.cursor).toBe(before.cursor);
    expect(done.fixable).toBe(before.fixable + 1);
  });

  test("fix-pr records a GitHub PR on an accepted ticket, for the admin's eyes only", async () => {
    const t = await readyTicket("Record my PR");
    const post = (url: string, id = t.id, as: As = agent) => call("POST", `/v1/agent/feedback/${id}/fix-pr`, { url }, as);
    expect((await post(PR, t.id, { bearer: null })).status).toBe(401);
    expect((await post(PR, t.id, kai)).status).toBe(401);
    expect((await post("https://evil.example/pull/1")).status).toBe(422);
    expect((await post("https://github.com/a/b/issues/1")).status).toBe(422);
    expect((await post(null as unknown as string)).status).toBe(422);
    expect((await post(`https://github.com/a/${"b".repeat(300)}/pull/1`)).status).toBe(422);
    const open = await ticket("Still new");
    expect((await post(PR, open.id)).status).toBe(409);
    expect((await post(PR, "00000000-0000-4000-8000-000000000000")).status).toBe(404);

    expect(await json(await post(PR))).toEqual({ handle: t.handle, fixPr: PR });
    const admin = await json(await call("GET", `/v1/feedback/${t.id}`));
    expect(admin.fixPr.url).toBe(PR);
    expect((await json(await call("GET", `/v1/feedback/${t.id}`, undefined, kai))).fixPr).toBeNull();
    // still a candidate: the caller checks whether that PR is open, merged or closed
    expect((await fixable()).tickets.find((x: any) => x.id === t.id)?.fixPr).toBe(PR);
  });
});
