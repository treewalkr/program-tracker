import { describe, expect, test } from "bun:test";
import type { SignalProgram } from "@pt/shared";
import { futureStartWarning, movedLogs, movedSummary, nextMonday, startIssue, startLine } from "./startDate";

describe("start date dialog helpers", () => {
  test("nextMonday", () => {
    expect(nextMonday("2026-11-19")).toBe("2026-11-23"); // Thu → Mon
    expect(nextMonday("2026-11-23")).toBe("2026-11-30"); // Mon → next Mon
    expect(nextMonday("2026-11-22")).toBe("2026-11-23"); // Sun → Mon
  });

  test("startLine", () => {
    expect(startLine("2026-11-23", "2026-11-19", 6)).toBe("Starts in 4 days · Mon 23 Nov");
    expect(startLine("2026-11-20", "2026-11-19", 6)).toBe("Starts tomorrow · Fri 20 Nov");
    expect(startLine("2026-11-19", "2026-11-19", 6)).toBe("Today is W1 · 19–25 Nov");
    expect(startLine("2026-11-03", "2026-11-19", 6)).toBe("Today is W3 · 17–23 Nov");
    expect(startLine("2026-09-01", "2026-11-19", 6)).toBe("The block would have ended Mon 12 Oct");
  });

  test("futureStartWarning: only when a program is replaced and Week 1 is after today", () => {
    expect(futureStartWarning("2026-11-23", "2026-11-19", "Hypertrophy", "Maya")).toBe(
      "“Hypertrophy” stops as soon as you activate. Maya has nothing to log until Mon 23 Nov, when Week 1 starts."
    );
    expect(futureStartWarning("2026-11-20", "2026-11-19", "Hypertrophy", null)).toContain("The member has nothing to log until Fri 20 Nov");
    expect(futureStartWarning("2026-11-19", "2026-11-19", "Hypertrophy", "Maya")).toBeNull();
    expect(futureStartWarning("2026-11-10", "2026-11-19", "Hypertrophy", "Maya")).toBeNull();
    expect(futureStartWarning("2026-11-23", "2026-11-19", null, "Maya")).toBeNull();
    expect(futureStartWarning("", "2026-11-19", "Hypertrophy", "Maya")).toBeNull();
  });

  test("startIssue", () => {
    expect(startIssue("2026-11-23", "2026-11-19", 6)).toBeNull();
    expect(startIssue("", "2026-11-19", 6)).toBe("Pick a date.");
    expect(startIssue("2026-09-01", "2026-11-19", 6)).toContain("Too early");
    expect(startIssue("2027-03-01", "2026-11-19", 6)).toContain("8 weeks ahead");
  });

  test("movedLogs: which logs change week when Week 1 moves", () => {
    const program: SignalProgram = {
      id: "p",
      clientId: "c",
      name: "",
      status: "active",
      weeks: [],
      activatedAt: "2026-11-17T09:00:00Z",
      startsOn: "2026-11-17",
      createdAt: "2026-11-01T00:00:00Z",
    };
    const logs = [
      { programId: "p", date: "2026-11-17" },
      { programId: "p", date: "2026-11-19" },
      { programId: "other", date: "2026-11-19" },
    ];
    // Two weeks earlier: both logs go from W1 to W3.
    const moved = movedLogs(program, logs, "2026-11-03");
    expect(moved).toEqual([
      { date: "2026-11-17", from: 1, to: 3 },
      { date: "2026-11-19", from: 1, to: 3 },
    ]);
    expect(movedSummary(moved)).toBe("2 logged sessions move to another week.");
    expect(movedLogs(program, logs, "2026-11-16")).toEqual([]);
    expect(movedSummary([])).toBe("No logged session changes week.");
  });
});
