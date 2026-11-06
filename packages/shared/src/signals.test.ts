import { describe, expect, test } from "bun:test";
import { cardioBehindSignal, computeSignals, type SignalLog, type SignalProgram } from "./index";

const owner = { programId: "pg-1", clientId: "cl-1" };

const cardioLog = (date: string, durationMin: number | null, hrZone?: number | null) => ({
  programId: "pg-1",
  date,
  kind: "cardio" as const,
  cardio: { modality: "Run", durationMin, hrZone: hrZone ?? null },
  sets: [],
});

// Thursday 2026-10-29 12:00 local — ISO week Monday 2026-10-26.
const THU = new Date(2026, 9, 29, 12).getTime();
const FRI = new Date(2026, 9, 30, 12).getTime();
const MON = new Date(2026, 9, 26, 12).getTime();

describe("cardioBehindSignal", () => {
  test("fires Thursday below 60% of pro-rata", () => {
    const logs = [cardioLog("2026-10-27", 30)];
    const signal = cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, THU);
    expect(signal).toBeDefined();
    expect(signal!.id).toBe("cardio-behind:cl-1");
    expect(signal!.kind).toBe("cardio-behind");
    expect(signal!.severity).toBe("attention");
    expect(signal!.title).toBe("Cardio behind weekly target");
    // Math.round(0.6 * 150 * 4 / 7) = Math.round(51.43) = 51
    expect(signal!.evidence).toBe("30 of 150 min logged this week — pace expects ≥ 51 by Thu.");
    expect(signal!.programId).toBe("pg-1");
    expect(signal!.clientId).toBe("cl-1");
    expect(signal!.altHref).toBe("/clients/cl-1");
    expect(signal!.altLabel).toBe("Review client");
  });

  test("Fri further behind → still fires", () => {
    const logs = [cardioLog("2026-10-27", 30)];
    const signal = cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, FRI);
    expect(signal).toBeDefined();
    expect(signal!.evidence).toBe("30 of 150 min logged this week — pace expects ≥ 64 by Fri.");
  });

  test("silent before Thursday", () => {
    const logs = [cardioLog("2026-10-26", 30)];
    expect(cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, MON)).toBeNull();
  });

  test("silent at/above the Thursday threshold", () => {
    const logs = [cardioLog("2026-10-27", 51)]; // expected 51 → at pace
    expect(cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, THU)).toBeNull();
  });

  test("counts only this ISO week's cardio in the target unit", () => {
    const logs = [
      cardioLog("2026-10-25", 120), // last week — excluded by window
      cardioLog("2026-10-26", 30, 2),
    ];
    // 30 min × zone 2 = 60 zone-min ≥ round(0.6·150·4/7) = 51 → at pace, silent
    expect(cardioBehindSignal(owner, { unit: "zone_minutes", value: 150 }, logs, THU)).toBeNull();
  });

  test("zone_minutes picks up the hrZone weighting", () => {
    const logs = [cardioLog("2026-10-26", 20, 2)]; // 40 zone-min < 51 → behind
    const signal = cardioBehindSignal(owner, { unit: "zone_minutes", value: 150 }, logs, THU);
    expect(signal).toBeDefined();
    expect(signal!.evidence).toBe("40 of 150 zone-min logged this week — pace expects ≥ 51 by Thu.");
  });
});

// ---------------------------------------------------------------------------
// computeSignals — adherence counts lifting logs only
// ---------------------------------------------------------------------------

const liftProgram = (activatedAt: string): SignalProgram => ({
  id: "pg-1",
  clientId: "cl-1",
  name: "Block",
  status: "active",
  weeks: [
    {
      week: 1,
      sessions: [
        {
          id: "s1",
          name: "Session A",
          seq: 1,
          order: 0,
          kind: "lifting",
          exercises: [],
        },
      ],
    },
  ],
  activatedAt,
  createdAt: activatedAt,
});

describe("adherence counts lifting logs only", () => {
  test("cardio logs never inflate the session count", () => {
    const now = new Date(2026, 9, 29, 12).getTime();
    const program = liftProgram("2026-10-16"); // 13 days → week 2
    const lifting: SignalLog[] = [
      { programId: "pg-1", date: "2026-10-20", sets: [{ exerciseId: "ex-squat", type: "working", reps: 5 }] },
      { programId: "pg-1", date: "2026-10-22", sets: [{ exerciseId: "ex-squat", type: "working", reps: 5 }] },
    ];
    const cardio: SignalLog[] = [
      cardioLog("2026-10-21", 30),
      cardioLog("2026-10-23", 40),
      cardioLog("2026-10-24", 35),
      cardioLog("2026-10-26", 45),
    ];

    const withCardio = computeSignals(program, [...lifting, ...cardio], () => "Squat", 3, now);
    // 2 lifting logs of 6 expected (3/wk × 2 wks) → 0.33 < 0.6 → fires
    const adherence = withCardio.find((s) => s.kind === "adherence");
    expect(adherence).toBeDefined();
    expect(adherence!.evidence).toContain("2 of ~6");

    // if cardio counted (6/6) it would NOT fire — proving the filter
    const onlyLifting = computeSignals(program, lifting, () => "Squat", 3, now);
    expect(onlyLifting.find((s) => s.kind === "adherence")).toBeDefined();
  });

  test("planned count is the program week's lifting sessions, not cardio or the client's setting", () => {
    const now = new Date(2026, 9, 22, 12).getTime();
    const lift = (n: number) => ({ id: `s${n}`, name: `S${n}`, seq: n, order: 0, kind: "lifting" as const, exercises: [] });
    const program: SignalProgram = {
      ...liftProgram("2026-10-16"), // 6 days → week 1
      weeks: [
        {
          week: 1,
          sessions: [
            lift(1),
            lift(2),
            lift(3),
            lift(4),
            { id: "c1", name: "Z2", seq: 1, order: 0, kind: "cardio", exercises: [], cardio: { modality: "Bike", durationMin: 30 } },
          ],
        },
      ],
    };
    const logs: SignalLog[] = [
      { programId: "pg-1", date: "2026-10-20", sets: [{ exerciseId: "ex-squat", type: "working", reps: 5 }] },
    ];
    // 4 lifting planned (cardio excluded), client setting 6 ignored → 1 of ~4
    const adherence = computeSignals(program, logs, () => "Squat", 6, now).find((s) => s.kind === "adherence");
    expect(adherence).toBeDefined();
    expect(adherence!.evidence).toContain("1 of ~4");
  });
});

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
