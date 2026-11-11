import { describe, expect, test } from "bun:test";
import { DEFAULT_AGENT_CMD, RETRY_MS, intervalMs, parseState, shouldRun } from "./feedback-watch-lib";

const NOW = 1_800_000_000_000;

describe("shouldRun", () => {
  const fresh = { cursor: null, lastRunAt: null };
  test("an empty inbox never runs, whatever the state", () => {
    expect(shouldRun(fresh, { inbox: 0, cursor: "" }, NOW)).toEqual({ run: false, reason: "inbox empty" });
    expect(shouldRun({ cursor: "a", lastRunAt: 0 }, { inbox: 0, cursor: "" }, NOW).run).toBe(false);
  });
  test("new or changed work runs at once", () => {
    expect(shouldRun(fresh, { inbox: 2, cursor: "a" }, NOW)).toEqual({ run: true, reason: "new work" });
    expect(shouldRun({ cursor: "a", lastRunAt: NOW - 1000 }, { inbox: 2, cursor: "b" }, NOW)).toEqual({ run: true, reason: "new work" });
  });
  test("the same work waits for the retry window", () => {
    const state = { cursor: "a", lastRunAt: NOW - 5 * 60_000 };
    expect(shouldRun(state, { inbox: 1, cursor: "a" }, NOW)).toEqual({ run: false, reason: "same 1 ticket(s) as the run 5m ago" });
    expect(shouldRun(state, { inbox: 1, cursor: "a" }, state.lastRunAt + RETRY_MS)).toEqual({ run: true, reason: "retry" });
    expect(shouldRun({ cursor: "a", lastRunAt: null }, { inbox: 1, cursor: "a" }, NOW)).toEqual({ run: true, reason: "retry" });
  });
});

describe("intervalMs", () => {
  test("defaults to 60s, floors at 15s", () => {
    expect(intervalMs(undefined)).toBe(60_000);
    expect(intervalMs("nope")).toBe(60_000);
    expect(intervalMs("-5")).toBe(60_000);
    expect(intervalMs("5")).toBe(15_000);
    expect(intervalMs("120")).toBe(120_000);
  });
});

describe("parseState", () => {
  test("reads a saved state; junk starts fresh", () => {
    expect(parseState('{"cursor":"ab","lastRunAt":5}')).toEqual({ cursor: "ab", lastRunAt: 5 });
    expect(parseState(null)).toEqual({ cursor: null, lastRunAt: null });
    expect(parseState("{oops")).toEqual({ cursor: null, lastRunAt: null });
    expect(parseState('{"cursor":3,"lastRunAt":"x"}')).toEqual({ cursor: null, lastRunAt: null });
  });
});

describe("DEFAULT_AGENT_CMD", () => {
  test("runs the skill headless with a read-only allowlist", () => {
    expect(DEFAULT_AGENT_CMD.slice(0, 3)).toEqual(["claude", "-p", "/answer-feedback"]);
    const allowed = DEFAULT_AGENT_CMD[DEFAULT_AGENT_CMD.indexOf("--allowedTools") + 1];
    expect(allowed).toContain("Bash(bun run feedback:agent:*)");
    expect(allowed).toContain("Edit(//tmp/pt-fb-agent/**)");
    expect(allowed).not.toMatch(/Bash\(\*\)|git push|Edit\((?!\/\/tmp\/pt-fb-agent\/)/);
  });
});
