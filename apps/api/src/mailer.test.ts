import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFrom, sendEmail } from "./lib/mailer";

const ENV = ["CLOUDFLARE_EMAIL_ACCOUNT_ID", "CLOUDFLARE_EMAIL_TOKEN", "EMAIL_FROM"];
let saved: Record<string, string | undefined>;
const origFetch = globalThis.fetch;
const email = { to: "kai@example.com", subject: "Hi", text: "hello", html: "<p>hello</p>" };

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  globalThis.fetch = origFetch;
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const configure = () => {
  process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID = "acc123";
  process.env.CLOUDFLARE_EMAIL_TOKEN = "tok-not-real";
  process.env.EMAIL_FROM = "Program Tracker <feedback@pinroj.com>";
};

describe("mailer", () => {
  test("parseFrom reads named and bare addresses", () => {
    expect(parseFrom("Program Tracker <feedback@pinroj.com>")).toEqual({ address: "feedback@pinroj.com", name: "Program Tracker" });
    expect(parseFrom("feedback@pinroj.com")).toEqual({ address: "feedback@pinroj.com" });
  });

  test("not configured: skipped without a request", async () => {
    let called = false;
    globalThis.fetch = (async () => ((called = true), new Response("{}"))) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "not_configured" });
    expect(called).toBe(false);
  });

  test("sends the Cloudflare REST shape", async () => {
    configure();
    let url = "";
    let headers: Headers | undefined;
    let body: any;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      url = String(input);
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return Response.json({ success: true, errors: [], result: { delivered: ["kai@example.com"], permanent_bounces: [], queued: [] } });
    }) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: true });
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/email/sending/send");
    expect(headers?.get("authorization")).toBe("Bearer tok-not-real");
    expect(body).toEqual({
      to: "kai@example.com",
      from: { address: "feedback@pinroj.com", name: "Program Tracker" },
      subject: "Hi",
      text: "hello",
      html: "<p>hello</p>",
    });
  });

  test("provider errors are reported, not thrown", async () => {
    configure();
    globalThis.fetch = (async () =>
      Response.json(
        { success: false, errors: [{ code: 10102, message: "email.sending.error.authentication.forbidden" }], result: null },
        { status: 403 },
      )) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "provider_error" });
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "provider_error" });
  });
});
