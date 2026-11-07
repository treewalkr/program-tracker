import { describe, expect, test } from "bun:test";
import { buildId } from "./build";

describe("buildId", () => {
  test("version + short commit as SemVer build metadata", () => {
    expect(buildId("0.1.3", "42a93f5c0ffee")).toBe("0.1.3+42a93f5");
  });
  test("no commit known → bare version", () => {
    expect(buildId("0.1.3", null)).toBe("0.1.3");
    expect(buildId("0.1.3", "  ")).toBe("0.1.3");
  });
});
