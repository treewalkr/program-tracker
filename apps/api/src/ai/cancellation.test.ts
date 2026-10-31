import { describe, expect, test } from "bun:test";
import { abortGeneration, deregisterGeneration, registerGeneration } from "./cancellation";

describe("cancellation registry", () => {
  test("registry aborts, reports and forgets controllers", () => {
    const id = "test-gen-1";
    const controller = registerGeneration(id);
    expect(controller.signal.aborted).toBe(false);

    expect(abortGeneration("unknown-id")).toBe(false);

    expect(abortGeneration(id)).toBe(true);
    expect(controller.signal.aborted).toBe(true);

    deregisterGeneration(id);
    expect(abortGeneration(id)).toBe(false);
  });
});
