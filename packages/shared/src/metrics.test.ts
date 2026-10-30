import { describe, expect, test } from "bun:test";
import {
  blockPulse,
  chainBalanceText,
  chainSetCounts,
  chainsForExercise,
  pulseSummary,
  weekSessions,
  type ChainCatalogEntry,
  type ChainDef,
  type ProgramWeek,
  type SignalLog,
  type SignalProgram,
} from "./index";

describe("chainsForExercise", () => {
  test("maps primary and secondary groups onto chains", () => {
    const chains: ChainDef[] = [
      { id: "c-deep", name: "Deep Longitudinal", muscleGroups: ["hamstrings", "calves"] },
      { id: "c-lateral", name: "Lateral", muscleGroups: ["quads"] },
      { id: "c-posterior", name: "Posterior Spiral", muscleGroups: ["glutes"] },
    ];
    const rdl: ChainCatalogEntry = {
      id: "ex-rdl",
      primaryMuscleGroup: "hamstrings",
      secondaryMuscleGroups: ["glutes", "back"],
    };
    expect(chainsForExercise(rdl, chains)).toEqual(["c-deep", "c-posterior"]);

    const cardio: ChainCatalogEntry = {
      id: "ex-cardio",
      primaryMuscleGroup: "cardio",
      secondaryMuscleGroups: [],
    };
    expect(chainsForExercise(cardio, chains)).toEqual([]);
  });
});

describe("chainSetCounts", () => {
  test("counts only working sets since the window start", () => {
    const chains: ChainDef[] = [
      { id: "c-deep", name: "Deep Longitudinal", muscleGroups: ["hamstrings"] },
      { id: "c-lateral", name: "Lateral", muscleGroups: ["quads"] },
    ];
    const catalog: ChainCatalogEntry[] = [
      { id: "ex-rdl", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: [] },
    ];
    const logs = [
      {
        date: "2026-10-20",
        sets: [
          { exerciseId: "ex-rdl", type: "working" },
          { exerciseId: "ex-rdl", type: "working" },
          { exerciseId: "ex-rdl", type: "backoff" },
        ],
      },
      {
        date: "2026-10-10",
        sets: [
          { exerciseId: "ex-rdl", type: "working" },
        ],
      },
    ];

    const counts = chainSetCounts(chains, logs, catalog, "2026-10-15");
    expect(counts["c-deep"]).toBe(2);
    expect(counts["c-lateral"]).toBe(0);
  });
});

describe("chainBalanceText", () => {
  test("names every chain and flags untrained", () => {
    const chains: ChainDef[] = [
      { id: "c-1", name: "Intrinsic", muscleGroups: ["core"] },
      { id: "c-2", name: "Deep Longitudinal", muscleGroups: ["back"] },
      { id: "c-3", name: "Lateral", muscleGroups: ["quads"] },
    ];
    const countsWithZero = {
      "c-1": 5,
      "c-2": 31,
      "c-3": 0,
    };
    const textWithZero = chainBalanceText(chains, countsWithZero);
    expect(textWithZero).toContain("untrained: Lateral");
    expect(textWithZero).toBe(
      "Intrinsic 5 · Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral"
    );

    const countsNoZero = {
      "c-1": 5,
      "c-2": 31,
      "c-3": 2,
    };
    const textNoZero = chainBalanceText(chains, countsNoZero);
    expect(textNoZero).not.toContain("untrained");
    expect(textNoZero).toBe(
      "Intrinsic 5 · Deep Longitudinal 31 · Lateral 2 working sets"
    );
  });
});

describe("blockPulse & pulseSummary", () => {
  const baseProgram: SignalProgram = {
    id: "prog-1",
    clientId: "client-1",
    name: "Block 1",
    status: "active",
    weeks: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    activatedAt: "2026-10-01T00:00:00.000Z",
    phasing: {
      plannedWeeks: 4,
      phase: "accumulation",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
        { week: 3, directive: "+volume", target: { metric: "rep_volume", deltaPercent: 5 } },
        { week: 4, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
      ],
    },
  };

  test("blockPulse carries target and computes targetMet for overall_volume", () => {
    // Week 1: 1000kg
    const logsMeet: SignalLog[] = [
      {
        programId: "prog-1",
        date: "2026-10-02",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 10 }],
      },
      // Week 2: 1070kg (+7% actual vs +5% target -> met)
      {
        programId: "prog-1",
        date: "2026-10-09",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 107, reps: 10 }],
      },
    ];
    const pulseMeet = blockPulse(baseProgram, logsMeet);
    expect(pulseMeet[1].target).toEqual({ metric: "overall_volume", deltaPercent: 5 });
    expect(pulseMeet[1].overallVolumeDelta).toBe(7);
    expect(pulseMeet[1].targetDelta).toBe(7);
    expect(pulseMeet[1].targetMet).toBe(true);

    // Week 2 with +2% actual (1020kg vs 1000kg -> not met)
    const logsMiss: SignalLog[] = [
      {
        programId: "prog-1",
        date: "2026-10-02",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 10 }],
      },
      {
        programId: "prog-1",
        date: "2026-10-09",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 102, reps: 10 }],
      },
    ];
    const pulseMiss = blockPulse(baseProgram, logsMiss);
    expect(pulseMiss[1].overallVolumeDelta).toBe(2);
    expect(pulseMiss[1].targetDelta).toBe(2);
    expect(pulseMiss[1].targetMet).toBe(false);
  });

  test("rep_volume target uses the new repsDelta", () => {
    const logs: SignalLog[] = [
      {
        programId: "prog-1",
        date: "2026-10-02",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 10 }],
      },
      // Week 2: 100 reps
      {
        programId: "prog-1",
        date: "2026-10-09",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 10, reps: 100 }],
      },
      // Week 3: 110 reps (+10% actual vs +5% target -> met)
      {
        programId: "prog-1",
        date: "2026-10-16",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 10, reps: 110 }],
      },
    ];
    const pulse = blockPulse(baseProgram, logs);
    expect(pulse[2].repsDelta).toBe(10);
    expect(pulse[2].targetDelta).toBe(10);
    expect(pulse[2].targetMet).toBe(true);
  });

  test("intensity target uses e1rmDelta", () => {
    const logs: SignalLog[] = [
      {
        programId: "prog-1",
        date: "2026-10-02",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 1 }],
      },
      {
        programId: "prog-1",
        date: "2026-10-09",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 1 }],
      },
      // Week 3: e1rm 100 (100kg x 1)
      {
        programId: "prog-1",
        date: "2026-10-16",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 1 }],
      },
      // Week 4: e1rm 100 (flat -> e1rmDelta 0% vs +2.5% target -> not met)
      {
        programId: "prog-1",
        date: "2026-10-23",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 1 }],
      },
    ];
    const pulse = blockPulse(baseProgram, logs);
    expect(pulse[3].e1rmDelta).toBe(0);
    expect(pulse[3].targetDelta).toBe(0);
    expect(pulse[3].targetMet).toBe(false);
  });

  test("targetMet is null when the previous week is unplanned", () => {
    // Only week 2 logged, week 1 unplanned
    const logs: SignalLog[] = [
      {
        programId: "prog-1",
        date: "2026-10-09",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 10 }],
      },
    ];
    const pulse = blockPulse(baseProgram, logs);
    expect(pulse[0].targetDelta).toBeNull();
    expect(pulse[0].targetMet).toBeNull();
    expect(pulse[1].targetDelta).toBeNull();
    expect(pulse[1].targetMet).toBeNull();
  });

  test("pulseSummary says \"weekly overall volume\"", () => {
    const logs: SignalLog[] = [
      {
        programId: "prog-1",
        date: "2026-10-02",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 100, reps: 10 }], // 1000kg = 1.0t
      },
      {
        programId: "prog-1",
        date: "2026-10-09",
        sets: [{ exerciseId: "ex-1", type: "working", weightKg: 120, reps: 10 }], // 1200kg = 1.2t (+20%)
      },
    ];
    const pulse = blockPulse(baseProgram, logs);
    const summary = pulseSummary(pulse);
    expect(summary).toBeTruthy();
    expect(summary).toContain("weekly overall volume");
    expect(summary).not.toContain("tonnage");
  });

  test("weekSessions adherence-shape: flattens sessions of the requested week", () => {
    const weeks: ProgramWeek[] = [
      {
        week: 1,
        days: [
          {
            id: "d1",
            day: 1,
            sessions: [
              {
                id: "s1",
                name: "S1",
                order: 0,
                kind: "lifting",
                exercises: [{ id: "e1", exerciseId: "ex1", order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] }],
              },
            ],
          },
          {
            id: "d2",
            day: 2,
            sessions: [
              {
                id: "s2",
                name: "S2",
                order: 0,
                kind: "lifting",
                exercises: [{ id: "e2", exerciseId: "ex1", order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] }],
              },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            id: "d3",
            day: 1,
            sessions: [
              {
                id: "s3",
                name: "S3",
                order: 0,
                kind: "lifting",
                exercises: [{ id: "e3", exerciseId: "ex1", order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] }],
              },
            ],
          },
        ],
      },
    ];
    expect(weekSessions(weeks, 1).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(weekSessions(weeks, 2).map((s) => s.id)).toEqual(["s3"]);
    expect(weekSessions(weeks, 3)).toEqual([]);
  });
});
