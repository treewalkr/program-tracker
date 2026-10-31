import { describe, expect, test } from "bun:test";
import {
  blockPulse,
  chainBalanceText,
  chainSetCounts,
  chainsForExercise,
  daysIntoBlock,
  pulseSummary,
  weekOf,
  weekSessions,
  weekSummary,
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
                exercises: [{ id: "e1", exerciseId: "ex1", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
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
                exercises: [{ id: "e2", exerciseId: "ex1", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
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
                exercises: [{ id: "e3", exerciseId: "ex1", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
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

  test("daysIntoBlock and weekOf anchor to activatedAt, first log, or createdAt", () => {
    const baseProgram: SignalProgram = {
      id: "p1",
      clientId: "c1",
      name: "Block A",
      status: "active",
      weeks: [],
      createdAt: "2026-10-01T00:00:00.000Z",
    };

    // Case 1: uses activatedAt
    const pActivated: SignalProgram = {
      ...baseProgram,
      activatedAt: "2026-10-10T00:00:00.000Z",
    };
    const now1 = new Date("2026-10-15T12:00:00.000Z").getTime();
    expect(daysIntoBlock(pActivated, [], now1)).toBeCloseTo(5.5, 4);
    expect(weekOf(pActivated, [], now1)).toBe(1);

    const now2 = new Date("2026-10-24T00:00:00.000Z").getTime();
    expect(daysIntoBlock(pActivated, [], now2)).toBe(14);
    expect(weekOf(pActivated, [], now2)).toBe(3);

    // Case 2: falls back to first log
    const logs: SignalLog[] = [
      { programId: "p1", date: "2026-10-05T00:00:00.000Z", sets: [] },
      { programId: "p1", date: "2026-10-08T00:00:00.000Z", sets: [] },
    ];
    const nowLog = new Date("2026-10-12T00:00:00.000Z").getTime();
    expect(daysIntoBlock(baseProgram, logs, nowLog)).toBe(7);
    expect(weekOf(baseProgram, logs, nowLog)).toBe(2);

    // Case 3: falls back to createdAt
    const nowCreated = new Date("2026-10-03T00:00:00.000Z").getTime();
    expect(daysIntoBlock(baseProgram, [], nowCreated)).toBe(2);
    expect(weekOf(baseProgram, [], nowCreated)).toBe(1);
  });
});

describe("weekSummary", () => {
  const catalog = [
    { id: "ex-squat", name: "Back Squat" },
    { id: "ex-bench", name: "Bench Press" },
  ];
  const session = (n: number) => ({
    id: `s-${n}`,
    name: `Day ${n}`,
    order: 0,
    kind: "lifting" as const,
    exercises: [],
  });
  const summaryProgram: SignalProgram = {
    id: "prog-s",
    clientId: "client-1",
    name: "Summary Block",
    status: "active",
    weeks: [
      { week: 1, days: [{ id: "d1", day: 1, sessions: [session(1), session(2)] }] },
      { week: 2, days: [{ id: "d2", day: 1, sessions: [session(3), session(4), session(5)] }] },
    ],
    createdAt: "2026-09-30T00:00:00.000Z",
    activatedAt: "2026-10-01T00:00:00.000Z",
    phasing: {
      plannedWeeks: 3,
      phase: "accumulation",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
      ],
    },
  };
  const L = (date: string, sets: SignalLog["sets"], programId = "prog-s"): SignalLog => ({
    programId,
    date,
    sets,
  });

  test("weekSummary buckets logs by block week and computes volume, sets, avgRpe, bestE1rm", () => {
    const logs: SignalLog[] = [
      // Week 1 (2026-10-01 .. 2026-10-07): 1300kg, 3 working sets, avg RPE 8
      L("2026-10-02", [
        { exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5, rpe: 8 },
        { exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5, rpe: 8 },
        { exerciseId: "ex-bench", type: "working", weightKg: 60, reps: 5 },
        { exerciseId: "ex-squat", type: "backoff", weightKg: 80, reps: 5 },
      ]),
      // Week 2 (2026-10-08 .. 2026-10-14): 950kg, 2 sets, avg RPE 9
      L("2026-10-09", [
        { exerciseId: "ex-squat", type: "working", weightKg: 110, reps: 5 },
        { exerciseId: "ex-bench", type: "working", weightKg: 80, reps: 5, rpe: 9 },
      ]),
    ];

    const w1 = weekSummary({ program: summaryProgram, logs, week: 1, catalog })!;
    expect(w1.weekStart).toBe("2026-10-01");
    expect(w1.sessionsLogged).toBe(1);
    expect(w1.overallVolume).toBe(1300);
    expect(w1.sets).toBe(3);
    expect(w1.avgRpe).toBe(8);
    expect(w1.bestE1rm).toBe(116.7); // squat 100×5
    expect(w1.overallVolumeDelta).toBeNull(); // week 1 has no previous week

    const w2 = weekSummary({ program: summaryProgram, logs, week: 2, catalog })!;
    expect(w2.weekStart).toBe("2026-10-08");
    expect(w2.overallVolume).toBe(950);
    expect(w2.sets).toBe(2);
    expect(w2.avgRpe).toBe(9);
    expect(w2.bestE1rm).toBe(128.3); // squat 110×5
    expect(w2.overallVolumeDelta).toBe(-27); // (950 - 1300) / 1300
  });

  test("weekSummary flags PRs only when this week beats a prior week's best in the same program", () => {
    const logs: SignalLog[] = [
      // Week 1: squat 100×5 (e1RM 116.7) — first-ever lift, no PR to beat
      L("2026-10-02", [
        { exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5 },
      ]),
      // Week 2: squat 105×5 (e1RM 122.5) — beats 116.7 → PR
      L("2026-10-09", [
        { exerciseId: "ex-squat", type: "working", weightKg: 105, reps: 5 },
      ]),
      // Week 3: squat 95×5 (e1RM 110.8) — regress, no PR
      L("2026-10-16", [
        { exerciseId: "ex-squat", type: "working", weightKg: 95, reps: 5 },
      ]),
      // Same exercise, another program — must not count as prior best
      L("2026-10-04", [
        { exerciseId: "ex-squat", type: "working", weightKg: 140, reps: 5 },
      ], "prog-other"),
    ];

    const w1 = weekSummary({ program: summaryProgram, logs, week: 1, catalog })!;
    expect(w1.prs).toEqual([]); // nothing beaten

    const w2 = weekSummary({ program: summaryProgram, logs, week: 2, catalog })!;
    expect(w2.prs).toEqual([
      {
        exerciseId: "ex-squat",
        exerciseName: "Back Squat",
        weightKg: 105,
        reps: 5,
        e1rm: 122.5,
        prevBest: 116.7,
      },
    ]);

    const w3 = weekSummary({ program: summaryProgram, logs, week: 3, catalog })!;
    expect(w3.prs).toEqual([]); // regress, and other program's logs ignored
  });

  test("weekSummary computes adherence and nextWeek; null when no logs in window", () => {
    const logs: SignalLog[] = [
      // Week 1: 1 of 2 planned sessions → 50%
      L("2026-10-02", [{ exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5 }]),
      // Week 2: 3 of 3 planned → 100%
      L("2026-10-09", [{ exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5 }]),
      L("2026-10-10", [{ exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5 }]),
      L("2026-10-11", [{ exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5 }]),
    ];

    const w1 = weekSummary({ program: summaryProgram, logs, week: 1, catalog })!;
    expect(w1.sessionsPlanned).toBe(2);
    expect(w1.adherencePct).toBe(50);
    expect(w1.nextWeek).toEqual({ week: 2, directive: "+volume", target: null });

    const w2 = weekSummary({ program: summaryProgram, logs, week: 2, catalog })!;
    expect(w2.sessionsPlanned).toBe(3);
    expect(w2.adherencePct).toBe(100);
    expect(w2.nextWeek).toEqual({
      week: 3,
      directive: "+intensity",
      target: { metric: "intensity", deltaPercent: 2.5 },
    });

    // Week 3 is logged → beyond the program doc (2 weeks): planned/adherence null,
    // and phasing has no week 4 entry → nextWeek null.
    const w3 = weekSummary({
      program: summaryProgram,
      logs: [...logs, L("2026-10-16", [{ exerciseId: "ex-squat", type: "working", weightKg: 100, reps: 5 }])],
      week: 3,
      catalog,
    })!;
    expect(w3.sessionsPlanned).toBeNull();
    expect(w3.adherencePct).toBeNull();
    expect(w3.nextWeek).toBeNull();

    // Unlogged week → null
    expect(
      weekSummary({ program: summaryProgram, logs, week: 3, catalog })
    ).toBeNull();
  });
});
