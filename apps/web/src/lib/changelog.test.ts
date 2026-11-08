import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { latestVersion, parseChangelog } from "./changelog";

const SAMPLE = `# What's new

## Unreleased

### New
- [draft] Something half-written

## v0.1.9 — 2026-11-09

### New
- Paste a client's **history** from notes.
- Admins can open any client read-only,
  and see their active programme.

### Fixed
- Deload weeks lower the load index.

## v0.1.5 — 2026-11-08

- Maintenance and reliability updates.
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE);

  test("skips Unreleased and keeps releases newest first", () => {
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ["0.1.9", "2026-11-09"],
      ["0.1.5", "2026-11-08"],
    ]);
    expect(latestVersion(releases)).toBe("0.1.9");
  });

  test("groups items by section and joins wrapped lines", () => {
    expect(releases[0].sections).toEqual([
      {
        kind: "New",
        items: ["Paste a client's **history** from notes.", "Admins can open any client read-only, and see their active programme."],
      },
      { kind: "Fixed", items: ["Deload weeks lower the load index."] },
    ]);
  });

  test("bullets without a section heading land in an untitled section", () => {
    expect(releases[1].sections).toEqual([{ kind: null, items: ["Maintenance and reliability updates."] }]);
  });

  test("nothing released → no latest version", () => {
    expect(latestVersion(parseChangelog("# What's new\n\n## Unreleased\n"))).toBeNull();
  });
});

describe("CHANGELOG.md", () => {
  const releases = parseChangelog(readFileSync(new URL("../../../../CHANGELOG.md", import.meta.url), "utf8"));

  test("every release has a version, a date and at least one line", () => {
    expect(releases.length).toBeGreaterThan(0);
    for (const r of releases) expect(r.sections.flatMap((s) => s.items).length).toBeGreaterThan(0);
  });

  test("matches the app's package version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));
    expect(latestVersion(releases)).toBe(pkg.version);
  });

  test("no draft lines in released sections", () => {
    expect(releases.flatMap((r) => r.sections.flatMap((s) => s.items)).filter((i) => i.includes("[draft]"))).toEqual([]);
  });
});
