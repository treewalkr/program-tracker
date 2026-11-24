import { describe, expect, test } from "bun:test";
import { PortalTimeoutError, withTimeout } from "./timeout";

describe("portal save timeout", () => {
  test("an answer in time passes straight through", async () => {
    expect(await withTimeout(async () => 7, 50)).toBe(7);
    await expect(withTimeout(async () => Promise.reject(new Error("409")), 50)).rejects.toThrow("409");
  });

  test("a hung call rejects with a timeout and is aborted", async () => {
    let aborted = false;
    const hung = (signal: AbortSignal) =>
      new Promise<never>(() => {
        signal.addEventListener("abort", () => (aborted = true));
      });
    await expect(withTimeout(hung, 10)).rejects.toBeInstanceOf(PortalTimeoutError);
    expect(aborted).toBe(true);
  });
});
