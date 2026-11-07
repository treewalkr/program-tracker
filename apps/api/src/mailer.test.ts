import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFrom, sendEmail } from "./lib/mailer";

const ENV = ["RESEND_API_KEY", "EMAIL_FROM"];
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
  process.env.RESEND_API_KEY = "re_not_real";
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

  test("sends the Resend REST shape", async () => {
    configure();
    let url = "";
    let headers: Headers | undefined;
    let body: any;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      url = String(input);
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return Response.json({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    }) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: true });
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers?.get("authorization")).toBe("Bearer re_not_real");
    expect(body).toEqual({
      from: "Program Tracker <feedback@pinroj.com>",
      to: ["kai@example.com"],
      subject: "Hi",
      text: "hello",
      html: "<p>hello</p>",
    });
  });

  test("provider errors are reported, not thrown", async () => {
    configure();
    globalThis.fetch = (async () =>
      Response.json(
        { statusCode: 403, name: "validation_error", message: "The pinroj.com domain is not verified." },
        { status: 403 },
      )) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "provider_error" });
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "provider_error" });
  });
});
