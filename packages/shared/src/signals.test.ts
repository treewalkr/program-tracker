import { describe, expect, test } from "bun:test";
import { cardioBehindSignal, computeSignals, DELOAD_RULES, type SignalLog, type SignalProgram } from "./index";

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
    // 0.6 × 150 × 4/7 = 51.43, no rounding down (F18) → shown as ≥ 52
    expect(signal!.evidence).toBe("30 of 150 min logged this week — pace expects ≥ 52 by Thu.");
    expect(signal!.programId).toBe("pg-1");
    expect(signal!.clientId).toBe("cl-1");
    expect(signal!.altHref).toBe("/clients/cl-1");
    expect(signal!.altLabel).toBe("Review client");
  });

  test("Fri further behind → still fires", () => {
    const logs = [cardioLog("2026-10-27", 30)];
    const signal = cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, FRI);
    expect(signal).toBeDefined();
    expect(signal!.evidence).toBe("30 of 150 min logged this week — pace expects ≥ 65 by Fri.");
  });

  test("silent before Thursday", () => {
    const logs = [cardioLog("2026-10-26", 30)];
    expect(cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, MON)).toBeNull();
  });

  test("silent at/above the Thursday threshold", () => {
    const logs = [cardioLog("2026-10-27", 52)]; // 52 ≥ 51.43 → at pace (51 is now behind: F18 drops the rounding)
    expect(cardioBehindSignal(owner, { unit: "minutes", value: 150 }, logs, THU)).toBeNull();
  });

  test("counts only this ISO week's cardio in the target unit", () => {
    const logs = [
      cardioLog("2026-10-25", 120), // last week — excluded by window
      cardioLog("2026-10-26", 30, 2),
    ];
    // 30 min × zone 2 = 60 zone-min ≥ 0.6·150·4/7 = 51.43 → at pace, silent
    expect(cardioBehindSignal(owner, { unit: "zone_minutes", value: 150 }, logs, THU)).toBeNull();
  });

  test("zone_minutes picks up the hrZone weighting", () => {
    const logs = [cardioLog("2026-10-26", 20, 2)]; // 40 zone-min < 51.43 → behind
    const signal = cardioBehindSignal(owner, { unit: "zone_minutes", value: 150 }, logs, THU);
    expect(signal).toBeDefined();
    expect(signal!.evidence).toBe("40 of 150 zone-min logged this week — pace expects ≥ 52 by Thu.");
  });
});

describe("cardioBehindSignal is pro-rated from the client's start (F18)", () => {
  const SAT = new Date(2026, 9, 31, 12).getTime();
  const SUN = new Date(2026, 10, 1, 12).getTime();
  const sessions = { unit: "sessions" as const, value: 4 };

  test("2 of 4 sessions on Sunday is behind (no rounding down to 2)", () => {
    const logs = [cardioLog("2026-10-27", 30), cardioLog("2026-10-29", 30)];
    const s = cardioBehindSignal(owner, sessions, logs, SUN);
    expect(s).toBeDefined();
    expect(s!.evidence).toBe("2 of 4 sessions logged this week — pace expects ≥ 3 by Sun.");
  });

  test("silent on the day the client was created", () => {
    expect(cardioBehindSignal(owner, sessions, [], THU, new Date(2026, 9, 29, 9).toISOString())).toBeNull();
  });

  test("pace counts only the days since the client was created", () => {
    const createdWed = new Date(2026, 9, 28, 9).toISOString();
    // Wed..Sat = 4 days: 0.6 × 150 × 4/7 = 51.4 → 45 is behind, 52 is not.
    const minutes = { unit: "minutes" as const, value: 150 };
    const behind = cardioBehindSignal(owner, minutes, [cardioLog("2026-10-29", 45)], SAT, createdWed);
    expect(behind!.evidence).toBe("45 of 150 min logged this week — pace expects ≥ 52 by Sat.");
    expect(cardioBehindSignal(owner, minutes, [cardioLog("2026-10-29", 52)], SAT, createdWed)).toBeNull();
    // A client created in an earlier week gets the whole week.
    expect(cardioBehindSignal(owner, minutes, [cardioLog("2026-10-29", 52)], SAT, "2026-09-01T00:00:00.000Z")).toBeDefined();
  });

  test("works without a program (programId null)", () => {
    const s = cardioBehindSignal({ programId: null, clientId: "cl-1" }, sessions, [], SUN);
    expect(s?.programId).toBeNull();
    expect(s?.id).toBe("cardio-behind:cl-1");
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
    // F07: the rule waits a full week, so judge on day 7 (week 2, same 4 + cardio doc).
    const now = new Date(2026, 9, 23, 12).getTime();
    const lift = (n: number) => ({ id: `s${n}`, name: `S${n}`, seq: n, order: 0, kind: "lifting" as const, exercises: [] });
    const sessions = [
      lift(1),
      lift(2),
      lift(3),
      lift(4),
      { id: "c1", name: "Z2", seq: 1, order: 0, kind: "cardio" as const, exercises: [], cardio: { modality: "Bike", durationMin: 30 } },
    ];
    const program: SignalProgram = {
      ...liftProgram("2026-10-16"), // 7 days → week 2
      weeks: [
        { week: 1, sessions },
        { week: 2, sessions },
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

  test("deload-week describes the shared deload rule (F12)", () => {
    const now = new Date("2026-10-20T00:00:00.000Z").getTime();
    const program: SignalProgram = { ...baseProgram, activatedAt: new Date(now - 23 * 86400_000).toISOString() };
    const sig = computeSignals(program, [], () => "Bench", null, now).find((s) => s.kind === "deload-week");
    expect(sig).toBeDefined();
    expect(sig!.evidence).toContain(DELOAD_RULES);
    expect(sig!.prefillNote).toContain(DELOAD_RULES);
    expect(`${sig!.evidence} ${sig!.prefillNote}`).not.toContain("60%");
  });
});

describe("rpe creep and stall see every set (F02, F15)", () => {
  const program: SignalProgram = {
    id: "pg-1",
    clientId: "cl-1",
    name: "Block",
    status: "active",
    weeks: [
      {
        week: 1,
        sessions: [
          {
            id: "s1", name: "S1", seq: 1, order: 0, kind: "lifting",
            exercises: [
              { id: "pe-pl", exerciseId: "ex-plank", prescribedSets: [{ setNumber: 1, type: "working", reps: 0, amrap: false, durationSeconds: 45 }] },
            ],
          },
        ],
      },
    ] as unknown as SignalProgram["weeks"],
    createdAt: "2026-10-01T00:00:00.000Z",
    activatedAt: "2026-10-01T00:00:00.000Z",
  };
  const L = (date: string, sets: SignalLog["sets"]): SignalLog => ({ programId: "pg-1", date, sets });
  const name = (id: string) => id;
  const now = Date.parse("2026-11-05T12:00:00Z");

  test("back-off RPE climbing at the same load raises rpe creep", () => {
    const logs = [
      L("2026-10-05", [{ exerciseId: "ex-squat", type: "backoff", weightKg: 137.5, reps: 4, rpe: 7.5 }]),
      L("2026-11-02", [
        { exerciseId: "ex-squat", type: "backoff", weightKg: 137.5, reps: 4, rpe: 9.5 },
        { exerciseId: "ex-squat", type: "backoff", weightKg: 137.5, reps: 4, rpe: 10 },
      ]),
    ];
    expect(computeSignals(program, logs, name, null, now).map((s) => s.kind)).toContain("rpe-creep");
  });

  test("a timed hold never reads as a stalled lift", () => {
    const hold = (date: string, kg: number) => L(date, [{ exerciseId: "ex-plank", type: "working", weightKg: kg, reps: 10 }]);
    const logs = [hold("2026-10-05", 20), hold("2026-10-12", 15), hold("2026-10-19", 15), hold("2026-10-26", 15), hold("2026-11-02", 15)];
    expect(computeSignals(program, logs, name, null, now).map((s) => s.kind)).not.toContain("stall");
  });
});

describe("+intensity off-plan reads main lifts, not the overall max (F27)", () => {
  const ex = (exerciseId: string, role?: string) => ({
    id: `pe-${exerciseId}`, exerciseId, role, order: 0,
    prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }],
  });
  const make = (roles: boolean): SignalProgram => ({
    id: "pg-i",
    clientId: "cl-1",
    name: "PL",
    status: "active",
    weeks: [
      {
        week: 1,
        sessions: [
          {
            id: "s1", name: "S1", seq: 1, order: 0, kind: "lifting",
            exercises: [ex("ex-sq", roles ? "primary" : undefined), ex("ex-dl", roles ? "power" : undefined), ex("ex-curl", roles ? "accessory" : undefined)],
          },
        ],
      },
    ] as unknown as SignalProgram["weeks"],
    createdAt: "2026-10-01T00:00:00.000Z",
    activatedAt: "2026-10-01T00:00:00.000Z",
    phasing: { plannedWeeks: 4, phase: "accumulation", weeks: [{ week: 1, directive: "base" }, { week: 2, directive: "+intensity" }] },
  });
  const L = (date: string, sets: SignalLog["sets"]): SignalLog => ({ programId: "pg-i", date, sets });
  const set = (exerciseId: string, weightKg: number, reps: number) => ({ exerciseId, type: "working" as const, weightKg, reps });
  const now = Date.parse("2026-10-10T12:00:00Z");
  const offPlan = (p: SignalProgram, logs: SignalLog[]) =>
    computeSignals(p, logs, (id) => id.replace("ex-", ""), null, now).find((s) => s.id.startsWith("offplan-int"));

  test("squat up while the heavier deadlift dips → silent", () => {
    const logs = [
      L("2026-10-02", [set("ex-dl", 192.5, 2), set("ex-sq", 140, 5)]),
      L("2026-10-09", [set("ex-dl", 190, 2), set("ex-sq", 145, 5)]),
    ];
    expect(offPlan(make(true), logs)).toBeUndefined();
  });

  test("main lifts flat → fires even when an accessory improved, and names the lifts", () => {
    const logs = [
      L("2026-10-02", [set("ex-dl", 192.5, 2), set("ex-sq", 140, 5), set("ex-curl", 20, 10)]),
      L("2026-10-09", [set("ex-dl", 192.5, 2), set("ex-sq", 140, 5), set("ex-curl", 25, 10)]),
    ];
    const s = offPlan(make(true), logs);
    expect(s).toBeDefined();
    expect(s!.evidence).toContain("sq 163 → 163");
    expect(s!.evidence).toContain("dl 205 → 205");
    expect(s!.evidence).not.toContain("curl");
  });

  test("without roles any loaded lift counts", () => {
    const logs = [
      L("2026-10-02", [set("ex-dl", 192.5, 2), set("ex-curl", 20, 10)]),
      L("2026-10-09", [set("ex-dl", 192.5, 2), set("ex-curl", 25, 10)]),
    ];
    expect(offPlan(make(false), logs)).toBeUndefined();
  });
});

describe("adherence counts only sessions due so far (F07)", () => {
  const lift = (n: number) => ({ id: `s${n}`, name: `S${n}`, seq: n, order: 0, kind: "lifting" as const, exercises: [] });
  const program = (activatedAt: string): SignalProgram => ({
    ...liftProgram(activatedAt),
    weeks: [1, 2, 3].map((week) => ({ week, sessions: [lift(1), lift(2), lift(3), lift(4)] })),
  });
  const log = (date: string): SignalLog => ({ programId: "pg-1", date, sets: [{ exerciseId: "ex-squat", type: "working", reps: 5 }] });
  const adherence = (p: SignalProgram, logs: SignalLog[], now: number) =>
    computeSignals(p, logs, () => "Squat", 4, now).find((s) => s.kind === "adherence");

  test("silent on activation day and for the first six days", () => {
    expect(adherence(program("2026-11-08T05:00:00.000Z"), [], Date.parse("2026-11-08T08:00:00Z"))).toBeUndefined();
    expect(adherence(program("2026-11-02T05:00:00.000Z"), [], Date.parse("2026-11-08T08:00:00Z"))).toBeUndefined();
  });

  test("pro-rates expected by elapsed days once a week has passed", () => {
    // 10 days × 4/week ÷ 7 = 5.7 due; 3 logged = 0.53 < 0.6 → fires
    const s = adherence(program("2026-10-29T05:00:00.000Z"), [log("2026-10-30"), log("2026-11-01"), log("2026-11-04")], Date.parse("2026-11-08T08:00:00Z"));
    expect(s).toBeDefined();
    expect(s!.evidence).toContain("3 of ~6");
    // 4 logged = 0.7 → silent (old rule expected 4 × 2 weeks = 8 → 0.5 → fired)
    expect(adherence(program("2026-10-29T05:00:00.000Z"), [log("2026-10-30"), log("2026-11-01"), log("2026-11-04"), log("2026-11-06")], Date.parse("2026-11-08T08:00:00Z"))).toBeUndefined();
  });

  test("backfilled logs before activation move the start, and count", () => {
    // Activated today, but 5 sessions logged over the last 2 weeks: due = 4 × 14/7 = 8 → 5/8 = 0.63 → silent.
    const logs = ["2026-10-25", "2026-10-28", "2026-11-01", "2026-11-04", "2026-11-06"].map(log);
    expect(adherence(program("2026-11-08T05:00:00.000Z"), logs, Date.parse("2026-11-08T08:00:00Z"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RPE creep and stall: identity (F16) and science (F17)
// ---------------------------------------------------------------------------

/** 5-week program; `loads[w-1]` is the squat's prescribed load in week w (null = none). */
const squatProgram = (loads: (number | null)[]): SignalProgram => ({
  id: "pg-s",
  clientId: "cl-1",
  name: "Squat block",
  status: "active",
  weeks: loads.map((load, i) => ({
    week: i + 1,
    sessions: [
      {
        id: `s${i}`, name: "S1", seq: 1, order: 0, kind: "lifting",
        exercises: [
          {
            id: `pe${i}`, exerciseId: "ex-squat", order: 0, role: "primary",
            prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, ...(load != null ? { targetWeightKg: load } : {}) }],
          },
        ],
      },
    ],
  })) as unknown as SignalProgram["weeks"],
  createdAt: "2026-10-01T00:00:00.000Z",
  activatedAt: "2026-10-01T00:00:00.000Z",
});
const SL = (date: string, sets: [number, number, number?][]): SignalLog => ({
  programId: "pg-s",
  date,
  sets: sets.map(([weightKg, reps, rpe]) => ({ exerciseId: "ex-squat", type: "working" as const, weightKg, reps, rpe: rpe ?? null })),
});
const kinds = (p: SignalProgram, logs: SignalLog[], now: number) =>
  computeSignals(p, logs, () => "Squat", null, now);
const NOW_W5 = Date.parse("2026-11-01T12:00:00Z"); // week 5 of a block anchored Oct 1

describe("signal ids are scoped to program and exercise (F16)", () => {
  test("rpe-creep and stall ids carry programId and exerciseId", () => {
    const creep = [SL("2026-10-02", [[140, 5, 7]]), SL("2026-10-23", [[140, 5, 9], [140, 5, 9]])];
    const c = kinds(squatProgram([null, null, null, null, null]), creep, NOW_W5).find((s) => s.kind === "rpe-creep");
    expect(c?.id).toBe("rpe-creep:pg-s:ex-squat");

    const flat = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"].map((d) => SL(d, [[140, 5]]));
    const s = kinds(squatProgram([null, null, null, null, null]), flat, NOW_W5).find((x) => x.kind === "stall");
    expect(s?.id).toBe("stall:pg-s:ex-squat");
  });
});

describe("rpe creep compares matched load and reps by block week (F17)", () => {
  const p = squatProgram([null, null, null, null, null]);
  const creep = (logs: SignalLog[]) => kinds(p, logs, NOW_W5).find((s) => s.kind === "rpe-creep");

  test("double progression (+1 rep at the same load) is not fatigue", () => {
    expect(creep([SL("2026-10-02", [[140, 5, 7], [140, 5, 7]]), SL("2026-10-23", [[140, 6, 8.5], [140, 6, 9]])])).toBeUndefined();
  });

  test("same load and reps rating harder fires, with weeks in the evidence", () => {
    const s = creep([SL("2026-10-02", [[140, 5, 7]]), SL("2026-10-23", [[140, 5, 8.5], [140, 5, 9]])]);
    expect(s).toBeDefined();
    expect(s!.evidence).toBe("140 kg × 5 rates +1.8 RPE in week 4 vs week 1 at the same load and reps.");
  });

  test("buckets by block week, not by day", () => {
    // Week 1 has a light day (RPE 6) and a normal day (8.5, 8.5): week avg 7.7.
    // Week 4 at 9 → +1.3, below the 1.5 bar. Day-bucketing would read 6 → 9 = +3.
    const logs = [
      SL("2026-10-02", [[140, 5, 6]]),
      SL("2026-10-04", [[140, 5, 8.5], [140, 5, 8.5]]),
      SL("2026-10-23", [[140, 5, 9], [140, 5, 9]]),
    ];
    expect(creep(logs)).toBeUndefined();
  });
});

describe("stall buckets by block week and respects planned-flat loads (F17)", () => {
  const stall = (p: SignalProgram, logs: SignalLog[], now = NOW_W5) => kinds(p, logs, now).find((s) => s.kind === "stall");
  const weekly = (loads: number[]) =>
    ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"].slice(0, loads.length).map((d, i) => SL(d, [[loads[i], 5]]));

  test("several sessions inside two weeks are not four weeks of data", () => {
    const logs = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-09"].map((d, i) => SL(d, [[i === 0 ? 145 : 140, 5]]));
    expect(stall(squatProgram([null, null, null, null, null]), logs, Date.parse("2026-10-10T12:00:00Z"))).toBeUndefined();
  });

  test("planned flat loads are the plan, not a stall", () => {
    expect(stall(squatProgram([140, 140, 140, 140, 140]), weekly([140, 140, 140, 140, 140]))).toBeUndefined();
  });

  test("fires when the plan progressed and the athlete did not", () => {
    const s = stall(squatProgram([140, 142.5, 145, 147.5, 150]), weekly([140, 140, 140, 140, 140]));
    expect(s).toBeDefined();
    expect(s!.evidence).toBe("Best estimated 1RM has not moved in the last 2 weeks (peak 163 kg in week 1).");
  });

  test("fires when the plan carries no load target", () => {
    expect(stall(squatProgram([null, null, null, null, null]), weekly([140, 140, 140, 140, 140]))).toBeDefined();
  });

  /** Same block, but the squat is prescribed as %1RM instead of kg. */
  const pctProgram = (pcts: number[]): SignalProgram => {
    const p = squatProgram(pcts.map(() => null));
    p.weeks.forEach((w, i) => {
      (w.sessions[0].exercises[0].prescribedSets[0] as { percent1rm?: number }).percent1rm = pcts[i];
    });
    return p;
  };

  test("a %1RM plan held flat is the plan, not a stall", () => {
    expect(stall(pctProgram([75, 75, 75, 75, 75]), weekly([140, 140, 140, 140, 140]))).toBeUndefined();
  });

  test("fires when a %1RM plan progressed and the athlete did not", () => {
    expect(stall(pctProgram([70, 72.5, 75, 77.5, 80]), weekly([140, 140, 140, 140, 140]))).toBeDefined();
  });
});
