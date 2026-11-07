import { describe, expect, test } from "bun:test";
import { nextVersion, releaseNotes } from "./release-lib";

describe("nextVersion", () => {
  test("bumps the patch by default", () => {
    expect(nextVersion("0.1.0")).toBe("0.1.1");
    expect(nextVersion("0.1.9")).toBe("0.1.10");
  });
  test("takes an explicit newer version, with or without v", () => {
    expect(nextVersion("0.1.4", "0.2.0")).toBe("0.2.0");
    expect(nextVersion("0.1.4", "v1.0.0")).toBe("1.0.0");
  });
  test("refuses older, equal or malformed versions", () => {
    expect(() => nextVersion("0.1.4", "0.1.4")).toThrow("not newer");
    expect(() => nextVersion("0.1.4", "0.1.3")).toThrow("not newer");
    expect(() => nextVersion("0.1.4", "0.2")).toThrow("not x.y.z");
  });
});

describe("releaseNotes", () => {
  test("features then fixes; chores, docs and refactors left out", () => {
    const notes = releaseNotes("0.1.1", ["feat: session types", "chore: bump", "fix: popover edge", "refactor: x", "feat: build id"]);
    expect(notes).toBe("v0.1.1\n\nFeatures\n- session types\n- build id\n\nFixes\n- popover edge");
  });
  test("nothing user-facing → maintenance line", () => {
    expect(releaseNotes("0.1.2", ["chore: deps"])).toBe("v0.1.2\n\nMaintenance only.");
  });
});
