import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, feedbackAttachments, feedbackComments, feedbackItems, trainers } from "@pt/db";
import { FEEDBACK_MAX_IMAGE_BYTES, unpinnedContext } from "@pt/shared";
import { imageInfo } from "./lib/feedback-attachments";
import { createSession, SESSION_COOKIE } from "./lib/auth";
import { settleFeedbackNotifications } from "./lib/feedback-notify";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: feedbackAttachments.id }).from(feedbackAttachments).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping feedback attachment DB tests");
}

// 1×1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
/** Smallest header a JPEG sniff needs: SOI, then a baseline frame of 64×32. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0]);
/** Lossless WebP header of 100×50. */
const WEBP = (() => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8L", 12, "latin1");
  b[20] = 0x2f;
  b.writeUInt32LE(99 | (49 << 14), 21);
  return b;
})();
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");

const file = (bytes: Buffer, name = "a.png", type = "image/png") => new File([bytes], name, { type });

const context = unpinnedContext("/clients", { viewport: { width: 1280, height: 800, dpr: 1 }, userAgent: "test", appVersion: "t" });

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const prev = process.env.AUTH_DISABLED;
  if (token) process.env.AUTH_DISABLED = "false";
  const multipart = body instanceof FormData;
  try {
    return await app.handle(
      new Request(`http://local${path}`, {
        method,
        headers: {
          ...(multipart ? {} : { "content-type": "application/json" }),
          ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      }),
    );
  } finally {
    process.env.AUTH_DISABLED = prev;
  }
};
const json = async (res: Response) => (await res.json()) as any;
const form = (fields: Record<string, unknown>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x instanceof File ? x : typeof x === "object" ? JSON.stringify(x) : String(x));
  }
  return f;
};

describe("imageInfo", () => {
  test("reads type and size from the bytes", () => {
    expect(imageInfo(PNG)).toEqual({ mime: "image/png", width: 1, height: 1 });
    expect(imageInfo(JPEG)).toEqual({ mime: "image/jpeg", width: 64, height: 32 });
    expect(imageInfo(WEBP)).toEqual({ mime: "image/webp", width: 100, height: 50 });
  });
  test("refuses anything else, whatever it is called", () => {
    expect(imageInfo(GIF)).toBeNull();
    expect(imageInfo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageInfo(Buffer.alloc(0))).toBeNull();
  });
});

describe.skipIf(!dbUp)("feedback attachments", () => {
  const EMAILS = ["fb-att-kai@example.com", "fb-att-mo@example.com"];
  let kai = "";
  let mo = "";
  const items: string[] = [];

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
  });
  afterAll(async () => {
    await settleFeedbackNotifications();
    if (items.length) await db.delete(feedbackItems).where(inArray(feedbackItems.id, items));
    await db.delete(trainers).where(inArray(trainers.email, EMAILS));
  });

  const file_ = async (fields: Record<string, unknown>, token?: string) => {
    const res = await call("POST", "/v1/feedback", form({ comment: "With images", context, ...fields }), token);
    if (res.status === 200) items.push(((await res.clone().json()) as { id: string }).id);
    return res;
  };
  const countFor = async (itemId: string) =>
    (await db.select({ id: feedbackAttachments.id }).from(feedbackAttachments).where(eq(feedbackAttachments.itemId, itemId))).length;

  describe("on a new ticket", () => {
    test("stores the screenshots first, then the uploads in order", async () => {
      const res = await file_({
        elementShot: file(PNG),
        pageShot: file(JPEG, "page.jpg", "image/jpeg"),
        images: [file(WEBP, "one.webp", "image/webp"), file(PNG, "two.png")],
      });
      expect(res.status).toBe(200);
      const item = await json(await call("GET", `/v1/feedback/${(await json(res)).id}`));
      expect(item.attachments.map((a: any) => [a.kind, a.mime, a.width, a.height, a.position])).toEqual([
        ["element", "image/png", 1, 1, 0],
        ["page", "image/jpeg", 64, 32, 1],
        ["upload", "image/webp", 100, 50, 2],
        ["upload", "image/png", 1, 1, 3],
      ]);
      // nothing is written to the old columns any more
      const [row] = await db.select().from(feedbackItems).where(eq(feedbackItems.id, item.id));
      expect([row.elementShot, row.pageShot]).toEqual([null, null]);
    });

    test("takes the screenshots in `images`, kinds naming each", async () => {
      const res = await file_({
        images: [file(PNG, "element.png"), file(JPEG, "page.jpg", "image/jpeg"), file(WEBP, "one.webp", "image/webp")],
        kinds: "element,page,upload",
      });
      expect(res.status).toBe(200);
      const item = await json(await call("GET", `/v1/feedback/${(await json(res)).id}`));
      expect(item.attachments.map((a: any) => [a.kind, a.mime])).toEqual([
        ["element", "image/png"],
        ["page", "image/jpeg"],
        ["upload", "image/webp"],
      ]);
    });

    test("images past the kinds are uploads", async () => {
      const res = await file_({ images: [file(PNG), file(PNG, "two.png")], kinds: "element" });
      expect(res.status).toBe(200);
      const item = await json(await call("GET", `/v1/feedback/${(await json(res)).id}`));
      expect(item.attachments.map((a: any) => a.kind)).toEqual(["element", "upload"]);
    });

    test("refuses two element screenshots, or more kinds than images", async () => {
      const twice = await file_({ images: [file(PNG), file(PNG)], kinds: "element,element" });
      expect(twice.status).toBe(422);
      expect((await json(twice)).error).toBe("at most one element and one page screenshot");
      const extra = await file_({ images: [file(PNG)], kinds: "page,upload" });
      expect(extra.status).toBe(422);
      expect((await file_({ images: [file(PNG)], kinds: "selfie" })).status).toBe(422);
    });

    test("refuses a seventh upload; the screenshots don't count", async () => {
      const six = Array.from({ length: 6 }, (_, i) => file(PNG, `${i}.png`));
      expect((await file_({ elementShot: file(PNG), pageShot: file(PNG), images: six })).status).toBe(200);
      const res = await file_({ images: [...six, file(PNG, "7.png")] });
      expect(res.status).toBe(422);
      expect((await json(res)).error).toBe("at most 6 images — 7 were attached");
    });

    test("refuses an image over 2 MB, naming it", async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(FEEDBACK_MAX_IMAGE_BYTES)]);
      const res = await file_({ images: [file(PNG), file(big, "huge.png")] });
      expect(res.status).toBe(422);
      expect((await json(res)).error).toContain('"huge.png" is 2 MB — images can be at most 2 MB');
    });

    test("refuses what isn't a PNG, JPEG or WebP, whatever its declared type", async () => {
      const gif = await file_({ images: [file(GIF, "anim.gif", "image/gif")] });
      expect(gif.status).toBe(422);
      expect((await json(gif)).error).toBe(`"anim.gif" isn't a PNG, JPEG or WebP image`);
      const disguised = await file_({ elementShot: file(Buffer.from("<html>"), "x.png", "image/png") });
      expect(disguised.status).toBe(422);
    });

    test("a refused ticket leaves nothing behind", async () => {
      const before = (await db.select({ id: feedbackItems.id }).from(feedbackItems)).length;
      await file_({ images: [file(PNG), file(GIF, "b.gif", "image/gif")] });
      expect((await db.select({ id: feedbackItems.id }).from(feedbackItems)).length).toBe(before);
    });
  });

  describe("on a reply", () => {
    let id = "";
    beforeAll(async () => {
      id = (await json(await file_({}, kai))).id;
    });

    test("carries images, with or without text", async () => {
      const withText = await call("POST", `/v1/feedback/${id}/comments`, form({ body: "Here", images: [file(PNG), file(WEBP, "w.webp")] }), kai);
      expect(withText.status).toBe(201);
      expect((await json(withText)).attachments.map((a: any) => [a.kind, a.mime, a.position])).toEqual([
        ["upload", "image/png", 0],
        ["upload", "image/webp", 1],
      ]);
      const imageOnly = await call("POST", `/v1/feedback/${id}/comments`, form({ body: "", images: [file(PNG)] }), kai);
      expect(imageOnly.status).toBe(201);
      expect(await json(imageOnly)).toMatchObject({ body: "", attachments: [{ kind: "upload" }] });
      // text-only replies stay plain JSON
      expect((await call("POST", `/v1/feedback/${id}/comments`, { body: "Text only" }, kai)).status).toBe(201);
      expect((await call("POST", `/v1/feedback/${id}/comments`, { body: "  " }, kai)).status).toBe(422);

      const item = await json(await call("GET", `/v1/feedback/${id}`, undefined, kai));
      expect(item.attachments).toEqual([]);
      expect(item.thread.map((c: any) => c.attachments.length)).toEqual([2, 1, 0]);
    });

    test("enforces the same count, size and type limits", async () => {
      const before = await countFor(id);
      const seven = Array.from({ length: 7 }, () => file(PNG));
      expect((await call("POST", `/v1/feedback/${id}/comments`, form({ body: "x", images: seven }), kai)).status).toBe(422);
      const big = file(Buffer.concat([PNG, Buffer.alloc(FEEDBACK_MAX_IMAGE_BYTES)]));
      expect((await call("POST", `/v1/feedback/${id}/comments`, form({ body: "x", images: [big] }), kai)).status).toBe(422);
      const gif = file(GIF, "g.gif", "image/gif");
      expect((await call("POST", `/v1/feedback/${id}/comments`, form({ body: "x", images: [gif] }), kai)).status).toBe(422);
      expect(await countFor(id)).toBe(before);
      const item = await json(await call("GET", `/v1/feedback/${id}`, undefined, kai));
      expect(item.thread.some((c: any) => c.body === "x")).toBe(false);
    });
  });

  describe("visibility", () => {
    let id = "";
    let ticketImage = "";
    let replyImage = "";
    let draftImage = "";
    let noteImage = "";

    beforeAll(async () => {
      id = (await json(await file_({ images: [file(PNG)] }, kai))).id;
      const item = await json(await call("GET", `/v1/feedback/${id}`, undefined, kai));
      ticketImage = item.attachments[0].id;
      const reply = await json(await call("POST", `/v1/feedback/${id}/comments`, form({ body: "r", images: [file(PNG)] }), kai));
      replyImage = reply.attachments[0].id;
      // AI entries with images, written straight to the DB
      for (const visibility of ["draft", "private"] as const) {
        const [c] = await db
          .insert(feedbackComments)
          .values({ itemId: id, kind: "reply", body: visibility, authorKind: "ai", visibility })
          .returning({ id: feedbackComments.id });
        const [a] = await db
          .insert(feedbackAttachments)
          .values({ itemId: id, commentId: c.id, kind: "upload", mime: "image/png", bytes: PNG })
          .returning({ id: feedbackAttachments.id });
        if (visibility === "draft") draftImage = a.id;
        else noteImage = a.id;
      }
    });
    const get = (attachmentId: string, token?: string, itemId = id) =>
      call("GET", `/v1/feedback/${itemId}/attachments/${attachmentId}`, undefined, token);

    test("the reporter sees the ticket's and public replies' images, never a draft's or private note's", async () => {
      expect((await get(ticketImage, kai)).status).toBe(200);
      expect((await get(replyImage, kai)).status).toBe(200);
      expect((await get(draftImage, kai)).status).toBe(404);
      expect((await get(noteImage, kai)).status).toBe(404);
      const item = await json(await call("GET", `/v1/feedback/${id}`, undefined, kai));
      expect(item.thread.flatMap((c: any) => c.attachments.map((a: any) => a.id))).toEqual([replyImage]);
    });

    test("the admin sees them all", async () => {
      for (const a of [ticketImage, replyImage, draftImage, noteImage]) expect((await get(a)).status).toBe(200);
    });

    test("another trainer sees none, and ids don't cross tickets", async () => {
      for (const a of [ticketImage, replyImage]) expect((await get(a, mo)).status).toBe(404);
      const other = (await json(await file_({}, kai))).id;
      expect((await get(ticketImage, kai, other)).status).toBe(404);
    });

    test("deleting the ticket takes its images with it", async () => {
      const gone = (await json(await file_({ images: [file(PNG)] }))).id;
      expect(await countFor(gone)).toBe(1);
      await call("DELETE", `/v1/feedback/${gone}`);
      expect(await countFor(gone)).toBe(0);
    });
  });

  describe("migration 0046 copy", () => {
    const copy = readFileSync(new URL("../../../packages/db/drizzle/0047_feedback_attachments.sql", import.meta.url), "utf8")
      .split("--> statement-breakpoint")
      .find((s) => s.includes('INSERT INTO "feedback_attachments"'))!
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n");

    test("turns old screenshot columns into ticket attachments, once", async () => {
      const [old] = await db
        .insert(feedbackItems)
        .values({ comment: "Old ticket", route: "/", context, elementShot: PNG, pageShot: JPEG })
        .returning({ id: feedbackItems.id });
      const [none] = await db
        .insert(feedbackItems)
        .values({ comment: "No shots", route: "/", context })
        .returning({ id: feedbackItems.id });
      items.push(old.id, none.id);

      await db.execute(sql.raw(copy));
      const rows = await db
        .select()
        .from(feedbackAttachments)
        .where(and(eq(feedbackAttachments.itemId, old.id), isNull(feedbackAttachments.commentId)));
      expect(rows.map((r) => [r.kind, r.mime, r.width, r.height, r.position]).sort()).toEqual([
        ["element", "image/png", 1, 1, 0],
        ["page", "image/jpeg", null, null, 1],
      ]);
      expect(rows.find((r) => r.kind === "element")!.bytes.equals(PNG)).toBe(true);
      expect(await countFor(none.id)).toBe(0);

      // idempotent: a re-run (the later drop migration) copies nothing twice
      await db.execute(sql.raw(copy));
      expect(await countFor(old.id)).toBe(2);

      // and the API serves the copies, through both URLs
      const item = await json(await call("GET", `/v1/feedback/${old.id}`));
      expect(item.attachments.map((a: any) => a.kind)).toEqual(["element", "page"]);
      expect((await call("GET", `/v1/feedback/${old.id}/shot/page`)).headers.get("content-type")).toBe("image/jpeg");
    });
  });
});
