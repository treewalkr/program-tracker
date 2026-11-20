import { describe, expect, test } from "bun:test";
import { INSTRUCTIONS_MAX } from "@pt/shared";
import { app } from "./app";
import { validationBody } from "./lib/validation-errors";

describe("app config", () => {
  test("app idle timeout covers a deepseek turn with retry", () => {
    expect(app.config.serve?.idleTimeout === 255).toBe(true);
  });
});

describe("GET /health", () => {
  test("reports the build: root package version + commit", async () => {
    const res = await app.handle(new Request("http://local/health"));
    const body = (await res.json()) as { ok: boolean; build: string };
    const { version } = (await import("../../../package.json")).default;
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.build).toMatch(new RegExp(`^${version.replace(/\./g, "\\.")}(\\+[0-9a-f]{7})?$`));
  });
});

describe("GET /v1/meta", () => {
  test("reports the same build as /health, without signing in", async () => {
    const res = await app.handle(new Request("http://local/v1/meta"));
    const health = (await (await app.handle(new Request("http://local/health"))).json()) as { build: string };
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ build: health.build });
  });
});

describe("validation errors", () => {
  test("a 422 names the field and never echoes the value", async () => {
    const secret = `leak-${"y".repeat(INSTRUCTIONS_MAX)}`;
    const res = await app.handle(
      new Request("http://local/v1/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: crypto.randomUUID(), providerId: "mock", instructions: secret }),
      })
    );
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain("leak-");
    expect(JSON.parse(text)).toEqual({
      type: "validation",
      on: "body",
      error: `instructions: Expected string length less or equal to ${INSTRUCTIONS_MAX}`,
    });
  });

  test("no value error: the field is where it failed, the reason is generic", () => {
    expect(validationBody({ type: "query", valueError: undefined })).toEqual({ type: "validation", on: "query", error: "query: invalid value" });
  });

  test("standard schema paths join with dots", () => {
    const issue = { path: ["sets", 0, { key: "reps" }], message: "Too small" } as never;
    expect(validationBody({ type: "body", valueError: issue }).error).toBe("sets.0.reps: Too small");
  });
});
