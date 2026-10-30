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
      days: [
        {
          id: "d1",
          day: 1,
          sessions: [
            {
              id: "s1",
              name: "Day A",
              order: 0,
              exercises: [],
            },
          ],
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
});
