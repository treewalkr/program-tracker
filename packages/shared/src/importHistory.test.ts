import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ProgramWeeksDocument, SessionLog } from "./domain";
import { blockLabel, buildImportResult, importLines, type ImportChunk, type ImportResult } from "./import";
import { WEEK11_12_EXTRACTION } from "./importFixture";
import {
  addDays,
  buildHistory,
  dayDates,
  defaultWeekStarts,
  hasActuals,
  historyExerciseKey,
  historySummary,
  isoWeekday,
  weekdayFromLabel,
} from "./importHistory";

const days = (...labels: string[]) => labels.map((label) => ({ label }));

describe("weekdayFromLabel", () => {
  test("English full and short names, any case", () => {
    expect(weekdayFromLabel("Mon - Upper A")).toBe(1);
    expect(weekdayFromLabel("Tuesday lower")).toBe(2);
    expect(weekdayFromLabel("TUES: legs")).toBe(2);
    expect(weekdayFromLabel("wed")).toBe(3);
    expect(weekdayFromLabel("Thurs pull")).toBe(4);
    expect(weekdayFromLabel("Friday")).toBe(5);
    expect(weekdayFromLabel("Sat (long run)")).toBe(6);
    expect(weekdayFromLabel("sunday")).toBe(7);
  });

  test("whole words only", () => {
    expect(weekdayFromLabel("Day 1 Back/Biceps")).toBeNull();
    expect(weekdayFromLabel("Monster day")).toBeNull();
    expect(weekdayFromLabel("Wedge drills")).toBeNull();
    expect(weekdayFromLabel("Saturation")).toBeNull();
  });

  test("Thai names, short Thursday too", () => {
    expect(weekdayFromLabel("วันจันทร์ ช่วงบน")).toBe(1);
    expect(weekdayFromLabel("อังคาร")).toBe(2);
    expect(weekdayFromLabel("วันพุธ")).toBe(3);
    expect(weekdayFromLabel("พฤหัส ขา")).toBe(4);
    expect(weekdayFromLabel("วันพฤหัสบดี")).toBe(4);
    expect(weekdayFromLabel("ศุกร์")).toBe(5);
    expect(weekdayFromLabel("เสาร์")).toBe(6);
    expect(weekdayFromLabel("วันอาทิตย์")).toBe(7);
  });

  test("อาทิตย์ meaning a week is not Sunday", () => {
    expect(weekdayFromLabel("อาทิตย์ที่ 2")).toBeNull();
  });

  test("the first name written wins", () => {
    expect(weekdayFromLabel("Fri (moved from Mon)")).toBe(5);
  });
});

describe("dates", () => {
  test("addDays and isoWeekday", () => {
    expect(addDays("2026-10-27", 7)).toBe("2026-11-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
  });

  test("defaultWeekStarts counts back a week at a time", () => {
    expect(defaultWeekStarts(3, "2026-11-02")).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(defaultWeekStarts(1, "2026-11-02")).toEqual(["2026-11-02"]);
    expect(defaultWeekStarts(0, "2026-11-02")).toEqual([]);
  });
});

describe("dayDates", () => {
  const MON = "2026-10-26";
  const WED = "2026-10-28";

  test("Day N goes on the Nth training day", () => {
    expect(dayDates(MON, days("Day 1", "Day 2", "Day 3"), [1, 3, 5])).toEqual(["2026-10-26", "2026-10-28", "2026-10-30"]);
  });

  test("training days are counted from the start's weekday", () => {
    // starts Wed; training Mon/Wed/Fri → Wed, Fri, next Mon
    expect(dayDates(WED, days("Day 1", "Day 2", "Day 3"), [5, 1, 3])).toEqual(["2026-10-28", "2026-10-30", "2026-11-02"]);
  });

  test("no training days → consecutive days", () => {
    expect(dayDates(MON, days("Day 1", "Day 2", "Day 3"), [])).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(dayDates(MON, days("Day 1", "Day 2"), null)).toEqual(["2026-10-26", "2026-10-27"]);
  });

  test("more days than training days → consecutive days", () => {
    expect(dayDates(MON, days("A", "B", "C"), [1, 4])).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
  });

  test("a weekday in the label wins", () => {
    expect(dayDates(MON, days("Mon - Upper A", "Thu - Lower", "Sat - Upper B"), [1, 2, 3])).toEqual([
      "2026-10-26",
      "2026-10-29",
      "2026-10-31",
    ]);
    // a named day before the start's weekday lands later in the week
    expect(dayDates(WED, days("Mon"), null)).toEqual(["2026-11-02"]);
  });

  test("labeled and unlabeled days mix", () => {
    expect(dayDates(MON, days("Day 1", "Fri - Legs", "Day 3"), [1, 3])).toEqual(["2026-10-26", "2026-10-30", "2026-10-28"]);
  });

  test("never past start + 6", () => {
    const eight = days("1", "2", "3", "4", "5", "6", "7", "8");
    expect(dayDates(MON, eight, null).at(-1)).toBe("2026-11-01");
  });
});

// —— buildHistory against the Week 11–12 notes ——————————————————————————

const FIXTURE = readFileSync(new URL("../fixtures/import/week11-12.txt", import.meta.url), "utf8");
const LINE_COUNT = importLines(FIXTURE).length;

const resultOf = (edit: (c: ImportChunk) => void = () => {}): ImportResult => {
  const data = structuredClone(WEEK11_12_EXTRACTION);
  edit(data);
  return buildImportResult(FIXTURE, [{ from: 1, to: LINE_COUNT, ok: true, data }]);
};

/** Every name → a fake catalog id derived from it. */
const allIds = (r: ImportResult): Record<string, string> => {
  const out: Record<string, string> = {};
  let n = 0;
  for (const w of r.weeks)
    for (const d of w.days)
      for (const s of d.sessions)
        for (const e of s.exercises) out[historyExerciseKey(e.sourceName)] ??= `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return out;
};

const MON_WED_FRI = [1, 3, 5];
const plan = (r = resultOf(), over: Partial<Parameters<typeof buildHistory>[1]> = {}) =>
  buildHistory(r, {
    weekStarts: defaultWeekStarts(r.weeks.length, "2026-10-26"),
    trainingDays: MON_WED_FRI,
    exerciseIds: allIds(r),
    today: "2026-11-09",
    ...over,
  });

describe("buildHistory", () => {
  test("one archived program per block, named after it", () => {
    const r = resultOf();
    const p = plan(r);
    expect(p.programs.map((x) => x.name)).toEqual([blockLabel(r, 0), blockLabel(r, 1)]);
    expect(p.programs[0].name).toBe("Week 11 (Back/Biceps · Chest/Triceps · Lower)");
    expect(p.programs.map((x) => x.activatedAt)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(p.skipped).toEqual([]);
  });

  test("Day 1–3 land on Mon/Wed/Fri; cardio is in the program but not logged", () => {
    const [w11, w12] = plan().programs;
    expect(w11.logs.map((l) => [l.date, l.dayLabel])).toEqual([
      ["2026-10-19", "Day 1 Back/Biceps"],
      ["2026-10-21", "Day 2 Chest/Triceps"],
      ["2026-10-23", "Day 3 Lower"],
    ]);
    expect(w12.logs.map((l) => l.date)).toEqual(["2026-10-26", "2026-10-28", "2026-10-30"]);
    const sessions = w11.weeks[0].sessions;
    expect(sessions.filter((s) => s.kind === "cardio").map((s) => [s.seq, s.weekday])).toEqual([
      [1, 1],
      [2, 3],
    ]);
    expect(sessions.filter((s) => s.kind === "lifting").map((s) => [s.seq, s.weekday, s.order])).toEqual([
      [1, 1, 0],
      [2, 3, 0],
      [3, 5, 0],
    ]);
    expect(sessions.find((s) => s.kind === "cardio" && s.weekday === 1)?.order).toBe(1);
  });

  test("counts: 6 sessions, every logged set", () => {
    const p = plan();
    const day1 = p.programs[0].logs[0];
    expect(day1.exercises).toBe(7);
    expect(day1.sets).toHaveLength(2 + 3 + 3 + 5 + 4 + 4 + 4);
    expect(day1.notes).toBe("From notes: Week 11 · Day 1 Back/Biceps");
    expect(historySummary(p)).toEqual({ programs: 2, sessions: 6, sets: 122, from: "2026-10-19", to: "2026-10-30" });
  });

  test("program documents pass ProgramWeeksDocument, without roles", () => {
    for (const prog of plan().programs) {
      expect(ProgramWeeksDocument.safeParse(prog.weeks).success).toBe(true);
      expect(prog.weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises)).some((e) => "role" in e)).toBe(false);
    }
  });

  test("logs link to their week's session and exercise ids", () => {
    for (const prog of plan().programs) {
      for (const log of prog.logs) {
        const week = prog.weeks.find((w) => w.week === log.week)!;
        const session = week.sessions.find((s) => s.id === log.programSessionId)!;
        expect(session.kind).toBe("lifting");
        const ids = new Set(session.exercises.map((e) => e.id));
        for (const set of log.sets) {
          expect(ids.has(set.programExerciseId)).toBe(true);
          const slot = session.exercises.find((e) => e.id === set.programExerciseId)!;
          expect(slot.exerciseId).toBe(set.exerciseId);
        }
        const parsed = SessionLog.safeParse({
          id: crypto.randomUUID(),
          clientId: crypto.randomUUID(),
          programId: crypto.randomUUID(),
          programSessionId: log.programSessionId,
          date: log.date,
          kind: "lifting",
          notes: log.notes,
          sets: log.sets.map((s) => ({ ...s, id: crypto.randomUUID() })),
        });
        expect(parsed.success).toBe(true);
      }
    }
  });

  test("program exercises keep the mapped sets and notes", () => {
    const day1 = plan().programs[0].weeks[0].sessions.find((s) => s.kind === "lifting")!;
    const lat = day1.exercises.find((e) => e.exerciseName === "Lat Pulldown")!;
    expect(lat.prescribedSets.map((s) => s.reps)).toEqual([10, 8, 6, 5]);
    expect(lat.notes).toBe("Pyramid · machine");
  });

  test("the timed KB swing logs seconds, its counted reps go in the notes", () => {
    const day3 = plan().programs[0].logs[2];
    const prog = plan().programs[0];
    const swing = prog.weeks[0].sessions.flatMap((s) => s.exercises).find((e) => e.exerciseName === "Kettlebell American Swing")!;
    expect(swing.prescribedSets[0].durationSeconds).toBe(60);
    const swingSets = day3.sets.filter((s) => s.exerciseId === swing.exerciseId);
    expect(swingSets.map((s) => [s.setNumber, s.reps, s.weightKg])).toEqual([
      [1, 60, 12],
      [2, 60, 12],
      [3, 60, 12],
    ]);
    expect(day3.notes).toBe("From notes: Week 11 · Day 3 Lower\nKB American Swing: 25, 25, 25 reps");
  });

  test("reps fall back to the prescription; none at all drops the set", () => {
    const r = resultOf((c) => {
      const ex = c.weeks[0].days[0].sessions[0].exercises[2]; // Pull up 6 × 3
      ex.actuals = [{ kg: null, reps: null, seconds: null }, { reps: 6 }];
      const push = c.weeks[1].days[0].sessions[0].exercises[4]; // Push up to failure
      push.actuals = [{ reps: 9 }, { reps: null }];
    });
    const p = plan(r);
    const pull = p.programs[0].logs[0].sets.filter((s) => s.exerciseId === allIds(r)[historyExerciseKey("Pull up")]);
    expect(pull.map((s) => [s.setNumber, s.reps])).toEqual([
      [1, 6],
      [2, 6],
    ]);
    const push = p.programs[1].logs[0].sets.filter((s) => s.exerciseId === allIds(r)[historyExerciseKey("Push up")]);
    expect(push.map((s) => [s.setNumber, s.reps])).toEqual([[1, 9]]);
  });

  test("actuals flagged as not in the text are skipped, and said", () => {
    const r = resultOf((c) => {
      c.weeks[0].days[0].sessions[0].exercises[2].actuals = [{ reps: 7 }, { reps: 6 }, { reps: 6 }];
    });
    const pullFlags = r.weeks[0].days[0].sessions[0].exercises[2].flags;
    expect(pullFlags.some((f) => f.field === "actual" && f.code === "not_found")).toBe(true);
    const p = plan(r);
    expect(p.skipped).toEqual([
      { week: "Week 11", day: "Day 1 Back/Biceps", exercise: "Pull up", reason: "flagged", message: "numbers not found in the text" },
    ]);
    expect(p.programs[0].logs[0].exercises).toBe(6);
  });

  test("implausible logged values carry the actual field too", () => {
    const r = resultOf((c) => {
      c.weeks[1].days[2].sessions[0].exercises[1].actuals = [{ reps: 12, kg: 1200 }];
    });
    const flags = r.weeks[1].days[2].sessions[0].exercises[1].flags.filter((f) => f.field === "actual");
    expect(flags.map((f) => f.code).sort()).toEqual(["implausible", "not_found"]);
    expect(plan(r).skipped.map((s) => [s.exercise, s.reason])).toEqual([["Leg press", "flagged"]]);
  });

  test("prescription flags don't stop the logged numbers", () => {
    const r = resultOf();
    const scap = r.weeks[0].days[0].sessions[0].exercises[1];
    expect(scap.flags.length).toBeGreaterThan(0);
    expect(plan(r).programs[0].logs[0].sets.filter((s) => s.exerciseId === allIds(r)[historyExerciseKey("Scapular Depression")])).toHaveLength(2);
  });

  test("an exercise with numbers and no pick is skipped", () => {
    const r = resultOf();
    const ids = allIds(r);
    delete ids[historyExerciseKey("SA Row")];
    const p = plan(r, { exerciseIds: ids });
    expect(p.skipped.map((s) => [s.exercise, s.reason])).toEqual([["SA Row", "no_exercise"]]);
    expect(p.programs[0].weeks[0].sessions[0].exercises.map((e) => e.exerciseName)).not.toContain("Single-Arm Row");
  });

  test("more than 20 logged sets is skipped", () => {
    const r = resultOf((c) => {
      c.weeks[0].days[0].sessions[0].exercises[2].actuals = Array.from({ length: 21 }, () => ({ reps: 6 }));
    });
    expect(plan(r).skipped.map((s) => [s.exercise, s.reason])).toEqual([["Pull up", "too_many_sets"]]);
  });

  test("days after today are skipped; a block with nothing logged is left out", () => {
    const p = plan(resultOf(), { today: "2026-10-27" });
    expect(p.programs).toHaveLength(2);
    expect(p.programs[1].logs.map((l) => l.date)).toEqual(["2026-10-26"]);
    expect(p.skipped.map((s) => [s.day, s.reason])).toEqual([
      ["Day 2 Upper Pull", "future"],
      ["Day 3 Lower", "future"],
    ]);
    expect(plan(resultOf(), { today: "2026-10-01" }).programs).toEqual([]);
  });

  test("each week start is its own (gaps between weeks)", () => {
    const p = plan(resultOf(), { weekStarts: ["2026-09-07", "2026-10-26"] });
    expect(p.programs[0].logs[0].date).toBe("2026-09-07");
    expect(p.programs[0].activatedAt).toBe("2026-09-07");
  });

  test("a block of several weeks becomes weeks 1…k with fresh ids per week", () => {
    const r = resultOf();
    const merged: ImportResult = { ...r, blocks: [{ weeks: [0, 1] }], defaultBlock: 0 };
    const p = plan(merged);
    expect(p.programs).toHaveLength(1);
    const [prog] = p.programs;
    expect(prog.weeks.map((w) => w.week)).toEqual([1, 2]);
    expect(prog.logs.map((l) => l.week)).toEqual([1, 1, 1, 2, 2, 2]);
    const ids1 = new Set(prog.weeks[0].sessions.map((s) => s.id));
    expect(prog.weeks[1].sessions.some((s) => ids1.has(s.id))).toBe(false);
    expect(ProgramWeeksDocument.safeParse(prog.weeks).success).toBe(true);
  });

  test("hasActuals", () => {
    expect(hasActuals(resultOf())).toBe(true);
    expect(
      hasActuals(
        resultOf((c) => {
          for (const w of c.weeks) for (const d of w.days) for (const s of d.sessions) for (const e of s.exercises) e.actuals = null;
        }),
      ),
    ).toBe(false);
  });
});
