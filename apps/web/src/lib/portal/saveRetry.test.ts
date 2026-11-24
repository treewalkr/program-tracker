import { describe, expect, test } from "bun:test";
import { PortalDuplicateError } from "$lib/api/portalTypes";
import { duplicateAction, mayHaveLanded, networkFailure } from "./saveRetry";
import { PortalTimeoutError } from "./timeout";

const httpError = (status: number) => Object.assign(new Error(`request failed: ${status}`), { status });

describe("mayHaveLanded: could a failed save have been written?", () => {
  test("a timeout, or a 5xx the server answered, may have landed", () => {
    expect(mayHaveLanded(new PortalTimeoutError(), true)).toBe(true);
    expect(mayHaveLanded(httpError(500), true)).toBe(true);
    expect(mayHaveLanded(httpError(503), true)).toBe(true);
  });

  test("offline, a failed fetch (Eden's 503 with no answer), a 4xx or a 409: never", () => {
    expect(mayHaveLanded(new PortalTimeoutError(), false)).toBe(false);
    expect(mayHaveLanded(httpError(500), false)).toBe(false);
    expect(mayHaveLanded(networkFailure(), true)).toBe(false);
    expect(mayHaveLanded(httpError(422), true)).toBe(false);
    expect(mayHaveLanded(new PortalDuplicateError({ id: "l1", date: "2026-11-24", loggedBy: "client" }), true)).toBe(false);
    expect(mayHaveLanded(new Error("boom"), true)).toBe(false);
  });
});

describe("duplicateAction: a 409 on save", () => {
  const mine = { id: "l1", date: "2026-11-23", loggedBy: "client" as const };
  const coach = { ...mine, loggedBy: "trainer" as const };

  test("after a save that may have landed, the member's own log is replaced by what's on screen", () => {
    expect(duplicateAction(mine, { lastSaveLost: true, replacing: false })).toBe("replace");
  });

  test("never adopts it, never replaces a coach's log, and resends at most once", () => {
    expect(duplicateAction(mine, { lastSaveLost: false, replacing: false })).toBe("refuse");
    expect(duplicateAction(coach, { lastSaveLost: true, replacing: false })).toBe("refuse");
    expect(duplicateAction(mine, { lastSaveLost: true, replacing: true })).toBe("refuse");
  });
});
