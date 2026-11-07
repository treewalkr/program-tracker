import { describe, expect, test } from "bun:test";
import { db, feedbackItems } from "@pt/db";
import type { FeedbackContext } from "@pt/shared";
import { decodeShot, parseStatuses, shotMime } from "./lib/feedback";
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
    selector: "main > span",
    rect: { x: 0, y: 0, width: 10, height: 10 },
  },
  pageData: { client: { name: "Ann" } },
  viewport: { width: 1280, height: 800, dpr: 2 },
  userAgent: "test",
  appVersion: "abc1234",
};

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res;
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
