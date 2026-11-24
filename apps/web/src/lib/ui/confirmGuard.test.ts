import { describe, expect, test } from "bun:test";
import { CONFIRM_GUARD_MS, confirmAccepted } from "./confirmGuard";

describe("confirmAccepted", () => {
  test("a double tap (4–120 ms after arming) does not confirm", () => {
    expect(confirmAccepted(1000, 1004)).toBe(false);
    expect(confirmAccepted(1000, 1120)).toBe(false);
  });

  test("a tap just inside the guard still does not confirm", () => {
    expect(confirmAccepted(1000, 1000 + CONFIRM_GUARD_MS - 1)).toBe(false);
  });

  test("a deliberate second tap after the guard confirms", () => {
    expect(confirmAccepted(1000, 1000 + CONFIRM_GUARD_MS)).toBe(true);
    expect(confirmAccepted(1000, 1600)).toBe(true);
  });

  test("the guard can be overridden", () => {
    expect(confirmAccepted(0, 50, 0)).toBe(true);
  });
});
