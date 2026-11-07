import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { app } from "./app";
import { ContextError, providerRuntime } from "./ai/runtime";
import { chatJson } from "./ai/provider";

/**
 * Provider-seam coverage for the `deepseek` registry entry.
 * bun auto-loads .env* — snapshot and clear the provider vars per test so
 * developer machines with real keys don't skew assertions.
 */
const MANAGED_ENV = [
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_MODELS",
  "ZAI_API_KEY",
  "ZAI_BASE_URL",
  "ZAI_MODEL",
  "ZAI_MODELS",
];
let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
  envSnapshot = Object.fromEntries(MANAGED_ENV.map((k) => [k, process.env[k]]));
  for (const k of MANAGED_ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of MANAGED_ENV) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
});

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

describe("GET /v1/ai/providers (deepseek)", () => {
  test("T3 providers route lists deepseek with its default model", async () => {
    const { status, body } = await call("GET", "/v1/ai/providers");
    expect(status).toBe(200);
    expect(body.providers.map((p: any) => p.id)).toEqual(["zai", "deepseek", "mock"]);
    const deepseek = body.providers.find((p: any) => p.id === "deepseek");
    expect(deepseek.label).toBe("DeepSeek");
    expect(deepseek.model).toBe("deepseek-flash");
    expect(deepseek.models).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(deepseek.baseUrl).toBe("https://api.deepseek.com");
    expect(deepseek.configured).toBe(false);

    process.env.DEEPSEEK_API_KEY = "sk-test-not-real";
    const withKey = await call("GET", "/v1/ai/providers");
    const configured = withKey.body.providers.find((p: any) => p.id === "deepseek");
    expect(configured.configured).toBe(true);
  });

  test("T4 providers route never echoes the deepseek key", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test-not-real";
    const { body } = await call("GET", "/v1/ai/providers");
    expect(JSON.stringify(body)).not.toContain("sk-test-not-real");
  });

  test("T5 env overrides apply identically to zai and deepseek in the providers route", async () => {
    for (const id of ["zai", "deepseek"] as const) {
      const upper = id.toUpperCase();
      process.env[`${upper}_MODELS`] = "m1,m2";
      process.env[`${upper}_MODEL`] = "m9";
      process.env[`${upper}_BASE_URL`] = "http://proxy.test/v1";

      const { body } = await call("GET", "/v1/ai/providers");
      const entry = body.providers.find((p: any) => p.id === id);
      expect(entry.models).toEqual(["m9", "m1", "m2"]);
      expect(entry.model).toBe("m9");
      expect(entry.baseUrl).toBe("http://proxy.test/v1");

      delete process.env[`${upper}_MODELS`];
      delete process.env[`${upper}_MODEL`];
      delete process.env[`${upper}_BASE_URL`];
    }
  });
});

describe("providerRuntime (deepseek)", () => {
  test("T6 providerRuntime resolves deepseek defaults and missing key", () => {
    let caught: any;
    try {
      providerRuntime("deepseek");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContextError);
    expect(caught.status).toBe(400);
    expect(caught.message).toBe('provider "deepseek" not configured (missing DEEPSEEK_API_KEY)');

    process.env.DEEPSEEK_API_KEY = "k";
    const rt = providerRuntime("deepseek");
    expect(rt).toEqual({
      providerId: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      apiKey: "k",
      maxOutputTokens: 16384,
      effortLevels: ["none", "low", "high", "max"],
      defaultEffort: "high",
    });
    expect(providerRuntime("deepseek", "deepseek-v4-pro").model).toBe("deepseek-v4-pro");
  });

  test("T7 providerRuntime env overrides behave the same for zai and deepseek", () => {
    for (const id of ["zai", "deepseek"] as const) {
      const upper = id.toUpperCase();
      process.env[`${upper}_API_KEY`] = "k";

      process.env[`${upper}_BASE_URL`] = "http://proxy.test/v1";
      expect(providerRuntime(id).baseUrl).toBe("http://proxy.test/v1");
      delete process.env[`${upper}_BASE_URL`];

      process.env[`${upper}_MODEL`] = "m9";
      expect(providerRuntime(id).model).toBe("m9");
      delete process.env[`${upper}_MODEL`];

      process.env[`${upper}_MODELS`] = "m1,m2";
      expect(providerRuntime(id, "m2").model).toBe("m2");
      let caught: any;
      try {
        providerRuntime(id, "not-listed");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ContextError);
      expect(caught.status).toBe(400);
      expect(caught.message).toMatch(new RegExp(`not available for provider "${id}"`));
      delete process.env[`${upper}_MODELS`];
    }
  });
});

describe("chatJson (deepseek request shape)", () => {
  test("T8 chatJson sends an OpenAI-shaped JSON-mode request to DeepSeek", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    const rt = providerRuntime("deepseek");
    const origFetch = globalThis.fetch;
    let url = "";
    let headers: Headers | undefined;
    let body: any;
    try {
      globalThis.fetch = (async (input: any, init?: RequestInit) => {
        url = String(input);
        headers = new Headers(init?.headers);
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}', reasoning_content: "think" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 12, completion_tokens: 5, prompt_cache_hit_tokens: 8, completion_tokens_details: { reasoning_tokens: 3 } },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }) as typeof fetch;
      const out = await chatJson(rt, [{ role: "user", content: "Say JSON." }]);
      expect(out.content).toBe('{"ok":true}');
      expect(out.reasoning).toBe("think");
      expect(out.finishReason).toBe("stop");
      expect(out.usage).toEqual({ tokensIn: 12, tokensOut: 5, tokensReasoning: 3, tokensCached: 8 });
      expect(out.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.fetch = origFetch;
    }
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(headers?.get("authorization")).toBe("Bearer k");
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(16384);
    expect("thinking" in body).toBe(false);
    expect("reasoning_effort" in body).toBe(false); // no selection → byte-identical body
  });

  test("T8b effort selection shapes provider params (deepseek reasoning_effort, glm5 budget)", async () => {
    const capture = async (rt: ReturnType<typeof providerRuntime>, effort?: string) => {
      const origFetch = globalThis.fetch;
      let body: any;
      try {
        globalThis.fetch = (async (_input: any, init?: RequestInit) => {
          body = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch;
        await chatJson(rt, [{ role: "user", content: "hi" }], effort ? { effort } : {});
      } finally {
        globalThis.fetch = origFetch;
      }
      return body;
    };

    process.env.DEEPSEEK_API_KEY = "k";
    process.env.ZAI_API_KEY = "k";
    const ds = providerRuntime("deepseek");
    const glm5 = providerRuntime("zai", "glm-5.3-flash");

    expect((await capture(ds, "max")).reasoning_effort).toBe("max");
    expect((await capture(ds, "none")).reasoning_effort).toBe("none"); // thinking off
    expect((await capture(glm5, "high")).thinking).toEqual({ type: "enabled", budget: "high" });
    // glm5 without selection keeps the forced-low budget
    expect((await capture(glm5)).thinking).toEqual({ type: "enabled", budget: "low" });
  });
});
