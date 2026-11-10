import { describe, expect, test } from "bun:test";
import { draftChangelog, nextVersion, releaseNotes, stampChangelog, unreleasedProblem } from "./release-lib";

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

const LOG = "# What's new\n\n## Unreleased\n\n## v0.1.0 — 2026-11-07\n\n### New\n- First release.\n";

describe("draftChangelog", () => {
  test("drafts New from feat and Fixed from fix, dropping other types", () => {
    const out = draftChangelog(LOG, ["feat: paste notes", "chore: deps", "fix: deload index", "feat(web)!: dark theme"]);
    expect(out).toBe(
      "# What's new\n\n## Unreleased\n\n### New\n- [draft] Paste notes\n- [draft] Dark theme\n\n### Fixed\n- [draft] Deload index\n\n## v0.1.0 — 2026-11-07\n\n### New\n- First release.\n",
    );
  });
  test("keeps the ticket a fix names, so the owner sees what the release closes", () => {
    const out = draftChangelog(LOG, ["fix: clearer rest timer (FB-012)", "feat: goal chips (FB-3, FB-014)"]);
    expect(out).toContain("- [draft] Goal chips (FB-3, FB-014)");
    expect(out).toContain("- [draft] Clearer rest timer (FB-012)");
  });
  test("re-running replaces drafts but keeps hand-written lines", () => {
    const first = draftChangelog(LOG, ["feat: a", "fix: b"]);
    const edited = first.replace("- [draft] A", "- A, but for trainers");
    const again = draftChangelog(edited, ["feat: a", "fix: b", "feat: c"]);
    expect(again).toContain("### New\n- A, but for trainers\n- [draft] A\n- [draft] C\n\n### Fixed\n- [draft] B\n\n## v0.1.0");
    expect(again.match(/\[draft\] B/g)).toHaveLength(1);
  });
  test("keeps Improved and orders sections New, Improved, Fixed", () => {
    const withImproved = LOG.replace("## Unreleased\n", "## Unreleased\n\n### Improved\n- Faster logger\n");
    const out = draftChangelog(withImproved, ["fix: x", "feat: y"]);
    expect(out).toContain("### New\n- [draft] Y\n\n### Improved\n- Faster logger\n\n### Fixed\n- [draft] X\n");
  });
  test("works when Unreleased is the last section", () => {
    expect(draftChangelog("## Unreleased\n", ["fix: z"])).toBe("## Unreleased\n\n### Fixed\n- [draft] Z\n");
  });
  test("throws without an Unreleased heading", () => {
    expect(() => draftChangelog("# What's new\n", [])).toThrow("Unreleased");
  });
});

describe("unreleasedProblem / stampChangelog", () => {
  const ready = LOG.replace("## Unreleased\n", "## Unreleased\n\n### New\n- Dark theme.\n");
  test("empty or drafted Unreleased is refused", () => {
    expect(unreleasedProblem(LOG)).toContain("empty");
    expect(unreleasedProblem(draftChangelog(LOG, ["feat: a"]))).toContain("[draft]");
    expect(() => stampChangelog(LOG, "0.1.1", "2026-11-10")).toThrow("empty");
  });
  test("stamps Unreleased with version and date and opens a fresh one", () => {
    expect(unreleasedProblem(ready)).toBeNull();
    expect(stampChangelog(ready, "0.1.1", "2026-11-10")).toBe(
      "# What's new\n\n## Unreleased\n\n## v0.1.1 — 2026-11-10\n\n### New\n- Dark theme.\n\n## v0.1.0 — 2026-11-07\n\n### New\n- First release.\n",
    );
  });
});
