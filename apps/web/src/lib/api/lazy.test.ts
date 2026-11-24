import { describe, expect, test } from "bun:test";
import { lazyApi } from "./lazy";

describe("lazyApi", () => {
  test("loads the module on the first call only, then forwards every call", async () => {
    let loads = 0;
    const api = lazyApi(async () => {
      loads++;
      return { add: async (a: number, b: number) => a + b, hello: async () => "hi" };
    });
    expect(loads).toBe(0);
    expect(await api.add(2, 3)).toBe(5);
    expect(await api.hello()).toBe("hi");
    expect(loads).toBe(1);
  });

  test("keeps the method's `this` (the loaded object)", async () => {
    const api = lazyApi(async () => ({
      n: 41,
      async next() {
        return this.n + 1;
      },
    }));
    expect(await api.next()).toBe(42);
  });

  test("is not a thenable, so awaiting the api object itself doesn't hang", async () => {
    const api = lazyApi(async () => ({ ping: async () => "pong" }));
    expect((api as unknown as { then?: unknown }).then).toBeUndefined();
    expect(await Promise.resolve(api)).toBe(api);
  });

  test("a failed load rejects the call and retries on the next one", async () => {
    let tries = 0;
    const api = lazyApi(async () => {
      if (tries++ === 0) throw new Error("offline");
      return { ping: async () => "pong" };
    });
    await expect(api.ping()).rejects.toThrow("offline");
    expect(await api.ping()).toBe("pong");
  });
});
