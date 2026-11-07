import { describe, expect, test } from "bun:test";
import { app } from "./app";

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
