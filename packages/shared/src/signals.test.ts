import { describe, expect, test } from "bun:test";
import { computeSignals, type SignalProgram } from "./index";

describe("week-ending signal", () => {
  const baseProgram: SignalProgram = {
    id: "prog-1",
    clientId: "client-1",
    name: "Hypertrophy Block",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    weeks: [],
    phasing: {
      plannedWeeks: 4,
      phase: "accumulation",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
        { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
        { week: 4, directive: "deload" },
      ],
    },
  };

  test("week-ending fires in the last two days of a non-final week", () => {
    // 12 days ago: week 2 (days 7..13), day-into-week = 5 (12 % 7 = 5 >= 5)
    const now = new Date("2026-10-20T00:00:00.000Z").getTime();
    const activatedAt = new Date(now - 12 * 86400_000).toISOString();
    const program: SignalProgram = {
      ...baseProgram,
      activatedAt,
    };

    const signals = computeSignals(program, [], () => "Bench Press", null, now);
    const weekEnding = signals.filter((s) => s.kind === "week-ending");
    expect(weekEnding).toHaveLength(1);

    const sig = weekEnding[0];
    expect(sig.id).toBe(`week-ending:${program.id}:w3`);
    expect(sig.severity).toBe("info");
    expect(sig.targetWeek).toBe(3);
    expect(sig.evidence).toContain("directive +intensity");
    expect(sig.evidence).toContain("target +2.5% intensity");
  });

  test("week-ending is silent early in the week, in the final week, and without phasing", () => {
    const now = new Date("2026-10-20T00:00:00.000Z").getTime();

    // Early in week 2: 9 days ago -> day-into-week = 2 (< 5)
    const earlyProgram: SignalProgram = {
      ...baseProgram,
      activatedAt: new Date(now - 9 * 86400_000).toISOString(),
    };
    expect(
      computeSignals(earlyProgram, [], () => "Bench", null, now).filter((s) => s.kind === "week-ending")
    ).toHaveLength(0);

    // Final week (week 4 of 4): 26 days ago -> week 4 >= plannedWeeks (block-ending territory)
    const finalWeekProgram: SignalProgram = {
      ...baseProgram,
      activatedAt: new Date(now - 26 * 86400_000).toISOString(),
    };
    expect(
      computeSignals(finalWeekProgram, [], () => "Bench", null, now).filter((s) => s.kind === "week-ending")
    ).toHaveLength(0);

    // Without phasing
    const noPhasingProgram: SignalProgram = {
      ...baseProgram,
      phasing: null,
      activatedAt: new Date(now - 12 * 86400_000).toISOString(),
    };
    expect(
      computeSignals(noPhasingProgram, [], () => "Bench", null, now).filter((s) => s.kind === "week-ending")
    ).toHaveLength(0);

    // Inactive program returns []
    const inactiveProgram: SignalProgram = {
      ...baseProgram,
      status: "draft",
      activatedAt: new Date(now - 12 * 86400_000).toISOString(),
    };
    expect(computeSignals(inactiveProgram, [], () => "Bench", null, now)).toHaveLength(0);
  });
});
