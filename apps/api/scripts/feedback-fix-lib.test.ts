import { describe, expect, test } from "bun:test";
import {
  FIX_MAX_CAP,
  FIX_MAX_DEFAULT,
  checkBranch,
  clampMax,
  fixBranch,
  fixWorktreePath,
  ghCreateArgs,
  pickTickets,
  planFromMarkdown,
  prText,
  pushArgs,
  type PrState,
} from "./feedback-fix-lib";

const t = (number: number, fixPr: string | null = null) => ({
  id: `id${number}`,
  number,
  handle: `FB-${String(number).padStart(3, "0")}`,
  fixPr,
});
const pr = (n: number) => `https://github.com/o/r/pull/${n}`;

describe("clampMax", () => {
  test("defaults, floors and caps", () => {
    expect(clampMax(undefined)).toBe(FIX_MAX_DEFAULT);
    expect(clampMax("junk")).toBe(FIX_MAX_DEFAULT);
    expect(clampMax("0")).toBe(FIX_MAX_DEFAULT);
    expect(clampMax("1.5")).toBe(FIX_MAX_DEFAULT);
    expect(clampMax("3")).toBe(3);
    expect(clampMax("50")).toBe(FIX_MAX_CAP);
  });
});

describe("names", () => {
  test("branch and worktree follow the handle", () => {
    expect(fixBranch(12)).toBe("fix/fb-012");
    expect(fixBranch(1234)).toBe("fix/fb-1234");
    expect(fixWorktreePath("/Users/me/dev/program-tracker", 12)).toBe("/Users/me/dev/pt-fix-fb-012");
  });
  test("push goes to the branch's own name, never main or --force", () => {
    const args = pushArgs("fix/fb-012");
    expect(args).toEqual(["push", "--set-upstream", "origin", "HEAD:refs/heads/fix/fb-012"]);
    expect(args.join(" ")).not.toMatch(/--force|-f\b|refs\/heads\/main/);
  });
  test("the PR is a draft into main", () => {
    expect(ghCreateArgs("fix/fb-012", "fix: x (FB-012)", "/tmp/b.md")).toEqual([
      "pr", "create", "--draft", "--base", "main", "--head", "fix/fb-012", "--title", "fix: x (FB-012)", "--body-file", "/tmp/b.md",
    ]);
  });
});

describe("pickTickets", () => {
  test("skips open, merged and unknown PRs; retries closed ones; stops at max", () => {
    const states = new Map<string, PrState>([
      [pr(1), "OPEN"],
      [pr(2), "MERGED"],
      [pr(3), "CLOSED"],
    ]);
    const { take, skip } = pickTickets([t(1, pr(1)), t(2, pr(2)), t(3, pr(3)), t(4, pr(4)), t(5), t(6)], states, 2);
    expect(take.map((x) => x.number)).toEqual([3, 5]);
    expect(skip).toEqual([
      { handle: "FB-001", reason: `PR open: ${pr(1)}` },
      { handle: "FB-002", reason: `PR merged: ${pr(2)}` },
      { handle: "FB-004", reason: `PR unknown: ${pr(4)}` },
      { handle: "FB-006", reason: "over --max 2" },
    ]);
  });
});

describe("checkBranch", () => {
  const ok = { number: 12, branch: "fix/fb-012", subjects: ["fix: bigger rest timer (FB-012)"], dirty: false };
  test("a clean fix branch with tagged commits passes", () => {
    expect(checkBranch(ok)).toBeNull();
    expect(checkBranch({ ...ok, subjects: ["fix: bigger timer (FB-012)", "test: cover the timer label (FB-012)"] })).toBeNull();
  });
  test("refuses main, other branches, dirty trees, empty and oversized branches", () => {
    expect(checkBranch({ ...ok, branch: "main" })).toContain("on main");
    expect(checkBranch({ ...ok, branch: "HEAD" })).toContain("on HEAD");
    expect(checkBranch({ ...ok, branch: "fix/fb-013" })).toContain("expected fix/fb-012");
    expect(checkBranch({ ...ok, dirty: true })).toContain("uncommitted");
    expect(checkBranch({ ...ok, subjects: [] })).toContain("no commits");
    expect(checkBranch({ ...ok, subjects: Array(11).fill(ok.subjects[0]) })).toContain("11 commits");
  });
  test("every commit needs a type and must name this ticket as (FB-nnn)", () => {
    expect(checkBranch({ ...ok, subjects: ["bigger timer (FB-012)"] })).toContain("type prefix");
    expect(checkBranch({ ...ok, subjects: ["fix: bigger timer"] })).toContain("(FB-012)");
    expect(checkBranch({ ...ok, subjects: ["fix: bigger timer (FB-013)"] })).toContain("(FB-012)");
    expect(checkBranch({ ...ok, subjects: ["fix: bigger timer FB-012"] })).toContain("(FB-012)");
    expect(checkBranch({ ...ok, subjects: [ok.subjects[0], "chore: wip"] })).toContain('"chore: wip"');
  });
});

describe("prText and planFromMarkdown", () => {
  const md = [
    "## FB-012 · accepted",
    "- **AI triage (read the code, 2026-11-10):** bug · medium confidence · low risk · ready to fix",
    "  > Label is 10px.",
    "  - Fix plan:",
    "    1. In RestTimer.svelte, raise the label to 16px.",
    "    2. Add a story.",
    "  - Citations: `a:1`",
  ].join("\n");
  test("reads the plan out of the ticket Markdown", () => {
    expect(planFromMarkdown(md)).toEqual(["In RestTimer.svelte, raise the label to 16px.", "Add a story."]);
    expect(planFromMarkdown("## FB-001 · accepted")).toEqual([]);
  });
  test("titles by the first commit; the body names the ticket, the plan and what merging does", () => {
    const { title, body } = prText({ handle: "FB-012", subjects: ["fix: bigger timer (FB-012)", "test: story (FB-012)"], plan: planFromMarkdown(md) });
    expect(title).toBe("fix: bigger timer (FB-012)");
    expect(body).toContain("Fixes FB-012");
    expect(body).toContain("1. In RestTimer.svelte, raise the label to 16px.");
    expect(body).toContain("- test: story (FB-012)");
    expect(body).toContain("the agent never merges");
  });
});
