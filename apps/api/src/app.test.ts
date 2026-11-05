import { describe, expect, test } from "bun:test";
import { app } from "./app";

describe("app config", () => {
  test("app idle timeout covers a deepseek turn with retry", () => {
    expect(app.config.serve?.idleTimeout === 255).toBe(true);
  });
});
