import { describe, expect, test } from "bun:test";
// Namespace import: the guard is checked as properties, so a missing one fails the test, not the load.
import * as auth from "./lib/auth";

describe("safeReturnTo", () => {
  test("keeps an in-app path", () => {
    expect(auth.safeReturnTo("/clients/abc?tab=log#x")).toBe("/clients/abc?tab=log#x");
    expect(auth.safeReturnTo("/th/me")).toBe("/th/me");
  });
  test("sends anything that could leave the site home", () => {
    for (const v of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "", undefined, null]) {
      expect(auth.safeReturnTo(v)).toBe("/");
    }
  });
});
