import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, feedbackItems, trainers } from "@pt/db";
import { ticketBasis, unpinnedContext, type FeedbackItem } from "@pt/shared";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { aiRepliedSinceReporter, needsAnswer } from "./lib/feedback-ai";
import { checkLayout } from "./lib/feedback-attachments";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackItems.id }).from(feedbackItems).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping feedback edit DB tests");
}

const TOKEN = "agent-edit-test-token-0123456789";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const png = (name = "a.png") => new File([PNG], name, { type: "image/png" });
const context = unpinnedContext("/clients", { viewport: { width: 1280, height: 800, dpr: 1 }, userAgent: "test", appVersion: "t" });

/** "admin" (AUTH_DISABLED, the oldest trainer), a session token, or { bearer } for the agent. */
type As = "admin" | string | { bearer: string };
const call = async (method: string, path: string, body?: unknown, as: As = "admin") => {
  const prev = process.env.AUTH_DISABLED;
  if (as !== "admin") process.env.AUTH_DISABLED = "false";
  const multipart = body instanceof FormData;
  const headers: Record<string, string> = multipart ? {} : { "content-type": "application/json" };
  if (typeof as === "string" && as !== "admin") headers.cookie = `${SESSION_COOKIE}=${as}`;
  if (typeof as === "object") headers.authorization = `Bearer ${as.bearer}`;
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
/** Multipart the way Eden builds it: an array of objects as one JSON field, files as parts. */
const form = (fields: Record<string, unknown>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v) && !v.some((x) => x instanceof File)) {
      f.append(k, JSON.stringify(v));
      continue;
    }
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x instanceof File ? x : typeof x === "object" ? JSON.stringify(x) : String(x));
  }
  return f;
};
const versionOf = (item: FeedbackItem) => item.editedAt ?? item.createdAt;
const keepAll = (item: FeedbackItem) => item.attachments.map((a) => ({ keep: a.id }));

describe("checkLayout", () => {
  const current = [
    { id: "el", kind: "element" as const },
    { id: "pg", kind: "page" as const },
    ...[1, 2, 3, 4, 5].map((n) => ({ id: `u${n}`, kind: "upload" as const })),
  ];
  test("keeps, drops and reorders the ticket's own images", () => {
    expect(checkLayout(current, [{ keep: "u2" }, { keep: "el" }], 0)).toBeNull();
    expect(checkLayout(current, [], 0)).toBeNull();
  });
  test("refuses ids it doesn't have, duplicates, and uploads placed wrong", () => {
    expect(checkLayout(current, [{ keep: "nope" }], 0)).toEqual({ error: expect.stringContaining("isn't on this ticket") });
    expect(checkLayout(current, [{ keep: "el" }, { keep: "el" }], 0)).not.toBeNull();
    expect(checkLayout(current, [{ upload: 0 }], 2)).not.toBeNull();
    expect(checkLayout(current, [{ upload: 0 }, { upload: 0 }], 2)).not.toBeNull();
    expect(checkLayout(current, [{ upload: 1 }], 1)).not.toBeNull();
  });
  test("caps the uploads in the result; captured screenshots don't count", () => {
    const five = current.map((a) => ({ keep: a.id }));
    expect(checkLayout(current, [...five, { upload: 0 }], 1)).toBeNull();
    expect(checkLayout(current, [...five, { upload: 0 }, { upload: 1 }], 2)).toEqual({
      error: "at most 6 images — the ticket would have 7",
    });
  });
});

describe.skipIf(!dbUp)("editing a feedback ticket", () => {
  const EMAILS = ["fb-edit-kai@example.com", "fb-edit-mo@example.com"];
  const ENV = { RESEND_API_KEY: "re_test", EMAIL_FROM: "PT <fb@pinroj.com>", APP_URL: "https://pt.test", FEEDBACK_AGENT_TOKEN: TOKEN };
  const saved: Record<string, string | undefined> = {};
  const origFetch = globalThis.fetch;
  let sent: string[] = [];
  let kai = "";
  let kaiId = "";
  let mo = "";
  let adminName = "";
  const items: string[] = [];

  beforeAll(async () => {
    for (const k of [...Object.keys(ENV), "ADMIN_EMAIL"]) saved[k] = process.env[k];
    Object.assign(process.env, ENV);
    const [admin] = await db.select().from(trainers).where(eq(trainers.id, await getDefaultTrainerId()));
    process.env.ADMIN_EMAIL = admin.email;
    adminName = admin.name;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      if (!String(input).startsWith("https://api.resend.com/")) return origFetch(input, init);
      sent.push(JSON.parse(String(init?.body)).to[0]);
      return Response.json({ id: crypto.randomUUID() });
    }) as typeof fetch;
    await db.delete(trainers).where(inArray(trainers.email, EMAILS));
    const rows = await db
      .insert(trainers)
      .values([
        { name: "Kai", email: EMAILS[0] },
        { name: "Mo", email: EMAILS[1] },
      ])
      .returning({ id: trainers.id });
    kaiId = rows[0].id;
    kai = (await createSession(rows[0].id)).token;
    mo = (await createSession(rows[1].id)).token;
  });
  afterAll(async () => {
    await settleFeedbackNotifications();
    globalThis.fetch = origFetch;
    await call("PUT", "/v1/account/feedback-ai", { mode: "drafts" });
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (items.length) await db.delete(feedbackItems).where(inArray(feedbackItems.id, items));
    await db.delete(trainers).where(inArray(trainers.email, EMAILS));
  });

  const flush = async () => {
    await settleFeedbackNotifications();
    const out = sent;
    sent = [];
    return out;
  };
  /** Kai files a ticket (multipart when it carries images); returns it as Kai sees it. */
  const ticket = async (comment: string, files: Record<string, unknown> = {}): Promise<FeedbackItem> => {
    const multipart = Object.keys(files).length > 0;
    const res = await call("POST", "/v1/feedback", multipart ? form({ comment, context, ...files }) : { comment, context }, kai);
    expect(res.status).toBe(200);
    const { id } = await json(res);
    items.push(id);
    await flush();
    return get(id, kai);
  };
  const get = async (id: string, as: As = "admin"): Promise<FeedbackItem> => json(await call("GET", `/v1/feedback/${id}`, undefined, as));
  const edit = (item: FeedbackItem, body: Record<string, unknown>, as: As = "admin") => {
    const full = { comment: item.comment, version: versionOf(item), layout: keepAll(item), ...body };
    return call("PATCH", `/v1/feedback/${item.id}/content`, body.images ? form(full) : full, as);
  };

  describe("who may edit", () => {
    test("the reporter edits their own ticket; editedAt and editedBy say so", async () => {
      const item = await ticket("Rest timer too smal");
      expect(item.editedAt).toBeNull();
      expect(item.editedBy).toBeNull();
      const res = await edit(item, { comment: "  Rest timer too small  " }, kai);
      expect(res.status).toBe(200);
      const next = (await json(res)) as FeedbackItem;
      expect(next.comment).toBe("Rest timer too small");
      expect(next.editedBy).toEqual({ id: kaiId, name: "Kai", avatarUrl: null });
      expect(Date.parse(next.editedAt!)).toBeGreaterThan(Date.parse(item.createdAt));
      expect(next.updatedAt).toBe(next.editedAt!);
    });

    test("the admin edits a trainer's ticket, and is named as the editor", async () => {
      const item = await ticket("Typo");
      const next = await json(await edit(item, { comment: "Typo fixed" }));
      expect(next.comment).toBe("Typo fixed");
      expect(next.editedBy.name).toBe(adminName);
      expect((await get(item.id, kai)).editedBy?.name).toBe(adminName);
    });

    test("anyone else gets 404, like reading it", async () => {
      const item = await ticket("Mine");
      expect((await edit(item, { comment: "Hijacked" }, mo)).status).toBe(404);
      expect((await get(item.id)).comment).toBe("Mine");
    });

    test("closed tickets can't be edited; status stays admin-only", async () => {
      const item = await ticket("Closing soon");
      await call("PATCH", `/v1/feedback/${item.id}`, { status: "done" });
      const res = await edit(item, { comment: "Too late" }, kai);
      expect(res.status).toBe(409);
      expect((await json(res)).error).toContain("closed");
      expect((await edit(item, { comment: "Too late" })).status).toBe(409);
      expect((await call("PATCH", `/v1/feedback/${item.id}`, { status: "new" }, kai)).status).toBe(403);
    });

    test("an empty comment is refused, as when filing", async () => {
      const item = await ticket("Keep me");
      expect((await edit(item, { comment: "   " }, kai)).status).toBe(422);
      expect((await edit(item, { comment: "" }, kai)).status).toBe(422);
    });
  });

  describe("images", () => {
    test("removes captured screenshots, adds uploads and reorders, as multipart", async () => {
      const item = await ticket("With shots", { elementShot: png(), pageShot: png(), images: [png("one.png")] });
      expect(item.attachments.map((a) => a.kind)).toEqual(["element", "page", "upload"]);
      const [el, , one] = item.attachments;
      const res = await edit(
        item,
        { layout: [{ upload: 1 }, { keep: one.id }, { upload: 0 }, { keep: el.id }], images: [png("new-a.png"), png("new-b.png")] },
        kai,
      );
      expect(res.status).toBe(200);
      const next = (await json(res)) as FeedbackItem;
      expect(next.attachments.map((a) => a.kind)).toEqual(["upload", "upload", "upload", "element"]);
      expect(next.attachments[1].id).toBe(one.id);
      expect(next.attachments[3].id).toBe(el.id);
      expect(next.attachments.map((a) => a.position)).toEqual([0, 1, 2, 3]);
      // the page shot is gone for good
      expect((await call("GET", `/v1/feedback/${item.id}/shot/page`)).status).toBe(404);
      expect((await call("GET", `/v1/feedback/${item.id}/attachments/${next.attachments[0].id}`)).status).toBe(200);
    });

    test("removing every image works over JSON", async () => {
      const item = await ticket("Too many shots", { elementShot: png(), images: [png()] });
      const next = await json(await edit(item, { layout: [] }, kai));
      expect(next.attachments).toEqual([]);
      expect(next.comment).toBe("Too many shots");
      expect(next.editedAt).not.toBeNull();
    });

    test("the upload limit applies to the result, screenshots aside", async () => {
      const item = await ticket("Full", { elementShot: png(), images: [1, 2, 3, 4, 5].map((n) => png(`${n}.png`)) });
      const ok = await edit(item, { layout: [...keepAll(item), { upload: 0 }], images: [png()] }, kai);
      expect(ok.status).toBe(200);
      const full = (await json(ok)) as FeedbackItem;
      expect(full.attachments.filter((a) => a.kind === "upload")).toHaveLength(6);
      const over = await edit(full, { layout: [...keepAll(full), { upload: 0 }], images: [png()] }, kai);
      expect(over.status).toBe(422);
      expect((await json(over)).error).toContain("at most 6");
      // dropping one makes room for a new one
      const swapped = await edit(full, { layout: [...keepAll(full).slice(0, -1), { upload: 0 }], images: [png()] }, kai);
      expect(swapped.status).toBe(200);
    });

    test("ids from another ticket and bad files are refused, and nothing changes", async () => {
      const a = await ticket("A", { images: [png()] });
      const b = await ticket("B", { images: [png()] });
      expect((await edit(b, { layout: [{ keep: a.attachments[0].id }] }, kai)).status).toBe(422);
      const gif = new File([Buffer.from("GIF89a\x01\x00\x01\x00", "latin1")], "x.gif", { type: "image/png" });
      expect((await edit(b, { layout: [{ upload: 0 }], images: [gif] }, kai)).status).toBe(422);
      expect((await get(b.id)).attachments.map((x) => x.id)).toEqual(b.attachments.map((x) => x.id));
      expect((await get(b.id)).editedAt).toBeNull();
    });

    test("saving with nothing changed doesn't mark it edited", async () => {
      const item = await ticket("Same", { images: [png()] });
      const next = await json(await edit(item, {}, kai));
      expect(next.editedAt).toBeNull();
    });
  });

  test("a stale edit is a 409 and saves nothing", async () => {
    const item = await ticket("First draft");
    const opened = await get(item.id, kai);
    expect((await edit(opened, { comment: "Admin's version" })).status).toBe(200);
    const res = await edit(opened, { comment: "Kai's version" }, kai);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain("edited this ticket while you were editing");
    expect((await get(item.id)).comment).toBe("Admin's version");
    // from the fresh version it goes through
    expect((await edit(await get(item.id, kai), { comment: "Kai's version" }, kai)).status).toBe(200);
  });

  test("an edit is news to the other side, not to the editor, and emails nobody", async () => {
    const item = await ticket("Unread?");
    await call("POST", `/v1/feedback/${item.id}/seen`);
    await call("POST", `/v1/feedback/${item.id}/seen`, undefined, kai);
    expect((await get(item.id)).unread).toBe(false);

    await edit(item, { comment: "Unread now" }, kai);
    expect((await get(item.id, kai)).unread).toBe(false);
    expect((await get(item.id)).unread).toBe(true);

    await call("POST", `/v1/feedback/${item.id}/seen`);
    await edit(await get(item.id), { comment: "Admin tidied it" });
    expect((await get(item.id)).unread).toBe(false);
    expect((await get(item.id, kai)).unread).toBe(true);
    expect(await flush()).toEqual([]);
  });

  describe("the auto-reply inbox", () => {
    const agent = { bearer: TOKEN };
    const inbox = async () => (await json(await call("GET", "/v1/agent/feedback/inbox", undefined, agent))) as any[];
    const inInbox = async (id: string) => (await inbox()).find((i) => i.id === id);
    const answer = (id: string, basis: string, reply = "It's in Settings → Timer.") =>
      call(
        "POST",
        `/v1/agent/feedback/${id}/answer`,
        { basis, reply, note: "Exists.", verdict: "exists", confidence: "high", citations: [] },
        agent,
      );

    test("a reporter's edit after an AI reply puts the ticket back, as a new reporter message", async () => {
      await call("PUT", "/v1/account/feedback-ai", { mode: "auto" });
      const item = await ticket("Where is the timer?");
      expect((await json(await answer(item.id, (await inInbox(item.id)).basis))).outcome).toBe("sent");
      expect(await inInbox(item.id)).toBeUndefined();

      await edit(await get(item.id, kai), { comment: "Where is the rest timer setting?" }, kai);
      const back = await inInbox(item.id);
      expect(back).toBeDefined();
      expect(back.markdown).toContain("- **Edited:** ");
      expect(back.markdown).toContain(" by Kai — ");
      // the edit counts as the reporter's word: a confident answer goes out on its own again
      expect((await json(await answer(item.id, back.basis, "Settings → Rest timer."))).outcome).toBe("sent");
      expect(await inInbox(item.id)).toBeUndefined();
      await flush();
    });

    test("an admin's edit does not re-queue it", async () => {
      await call("PUT", "/v1/account/feedback-ai", { mode: "auto" });
      const item = await ticket("Export button?");
      expect((await json(await answer(item.id, (await inInbox(item.id)).basis))).outcome).toBe("sent");
      await edit(await get(item.id), { comment: "Export button on the client page?" });
      expect(await inInbox(item.id)).toBeUndefined();
      await flush();
    });

    test("new uploads change the basis, so the old answer goes stale", async () => {
      const item = await ticket("Looks off", { elementShot: png() });
      const before = ticketBasis(await get(item.id));
      const shotsOnly = await json(await edit(await get(item.id), { layout: [] }, kai));
      expect(ticketBasis(shotsOnly)).toBe(before);
      const withUpload = await json(await edit(shotsOnly, { layout: [{ upload: 0 }], images: [png()] }, kai));
      expect(ticketBasis(withUpload)).not.toBe(before);
    });
  });

  describe("needsAnswer and aiRepliedSinceReporter (pure)", () => {
    const kaiAuthor = { id: "k", name: "Kai", avatarUrl: null };
    const admin = { id: "a", name: "Ana", avatarUrl: null };
    const at = (min: number) => `2026-11-10T10:${String(min).padStart(2, "0")}:00.000Z`;
    const aiReply = (min: number, basis = "old") => ({
      id: `ai${min}`, kind: "reply" as const, author: null, authorKind: "ai" as const, visibility: "public" as const,
      aiMeta: { verdict: "exists" as const, confidence: "high" as const, citations: [], basis, model: null, runAt: at(min) },
      ship: null, body: "Answer", status: null, attachments: [], createdAt: at(min),
    });
    const base = (over: Partial<FeedbackItem>): FeedbackItem => ({
      id: "i", number: 1, author: kaiAuthor, status: "new", comment: "c", triageNote: null, route: "/", source: null, context,
      attachments: [], shippedIn: null, thread: [aiReply(5)], editedAt: null, editedBy: null, unread: false, muted: false,
      reachable: true, createdAt: at(0), updatedAt: at(0), ...over,
    });

    test("a reporter's edit after the answer re-queues; one before it doesn't", () => {
      expect(needsAnswer(base({}))).toBe(false);
      expect(needsAnswer(base({ editedAt: at(6), editedBy: kaiAuthor }))).toBe(true);
      expect(needsAnswer(base({ editedAt: at(4), editedBy: kaiAuthor }))).toBe(false);
      expect(needsAnswer(base({ editedAt: at(6), editedBy: admin }))).toBe(false);
    });
    test("an AI reply before the reporter's edit no longer counts", () => {
      expect(aiRepliedSinceReporter(base({}))).toBe(true);
      expect(aiRepliedSinceReporter(base({ editedAt: at(6), editedBy: kaiAuthor }))).toBe(false);
      expect(aiRepliedSinceReporter(base({ editedAt: at(6), editedBy: admin }))).toBe(true);
      expect(aiRepliedSinceReporter(base({ editedAt: at(6), editedBy: kaiAuthor, thread: [aiReply(5), aiReply(7)] }))).toBe(true);
    });
  });
});
