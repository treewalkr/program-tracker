import { describe, expect, test } from "bun:test";
import type { LegacyProgramSession, Phasing } from "@pt/shared";
import { migrateProgramDocument } from "./migrate-v7s4y";

const uuid = () => crypto.randomUUID();

describe("migrateProgramDocument", () => {
  const baseExercise = {
    id: uuid(),
    exerciseId: uuid(),
    order: 0,
    prescribedSets: [{ setNumber: 1, reps: 5 }],
  };

  test("migrates flat sessions into stamped weeks, week-1 ids preserved", () => {
    const legacy: LegacyProgramSession[] = [
      {
        id: uuid(),
        name: "Day 1",
        order: 0,
        exercises: [baseExercise],
      },
    ];
    const phasing: Phasing = {
      plannedWeeks: 3,
      phase: "accumulation",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
      ],
    };

    const result = migrateProgramDocument(legacy, phasing);
    expect(result).toHaveLength(3);
    expect(result[0].week).toBe(1);
    expect(result[1].week).toBe(2);
    expect(result[2].week).toBe(3);

    // Week 1 preserves session and exercise IDs
    expect(result[0].days[0].sessions[0].id).toBe(legacy[0].id);
    expect(result[0].days[0].sessions[0].exercises[0].id).toBe(baseExercise.id);
    expect(result[0].days[0].sessions[0].exercises[0].exerciseId).toBe(baseExercise.exerciseId);

    // Week 2 has fresh IDs for session and exercise, keeping exerciseId catalog ref
    expect(result[1].days[0].sessions[0].id).not.toBe(legacy[0].id);
    expect(result[1].days[0].sessions[0].exercises[0].id).not.toBe(baseExercise.id);
    expect(result[1].days[0].sessions[0].exercises[0].exerciseId).toBe(baseExercise.exerciseId);

    // Week 3 has fresh IDs too
    expect(result[2].days[0].sessions[0].id).not.toBe(legacy[0].id);
    expect(result[2].days[0].sessions[0].id).not.toBe(result[1].days[0].sessions[0].id);
  });

  test("conditioning becomes a cardio session", () => {
    const legacy: LegacyProgramSession[] = [
      {
        id: uuid(),
        name: "Day A",
        order: 0,
        exercises: [baseExercise],
        conditioning: {
          label: "Zone 2",
          detail: "30 min easy bike",
        },
      },
    ];

    const result = migrateProgramDocument(legacy, null);
    const daySessions = result[0].days[0].sessions;
    expect(daySessions).toHaveLength(2);

    expect(daySessions[0].kind).toBe("lifting");
    expect(daySessions[0].exercises).toHaveLength(1);

    expect(daySessions[1].kind).toBe("cardio");
    expect(daySessions[1].exercises).toEqual([]);
    expect(daySessions[1].cardio).toEqual({
      modality: "Zone 2",
      intensity: "30 min easy bike",
    });
  });

  test("weekday defaults from sorted trainingDays; plannedWeeks fallback 4 without phasing", () => {
    const legacy: LegacyProgramSession[] = [
      { id: uuid(), name: "Day 1", order: 0, exercises: [baseExercise] },
      { id: uuid(), name: "Day 2", order: 1, exercises: [baseExercise] },
      { id: uuid(), name: "Day 3", order: 2, exercises: [baseExercise] },
    ];

    const result = migrateProgramDocument(legacy, null, [4, 2]);
    // plannedWeeks fallback is 4 without phasing
    expect(result).toHaveLength(4);

    // [4, 2] sorted is [2, 4] -> day 1 is 2, day 2 is 4, day 3 is null
    for (const w of result) {
      expect(w.days[0].weekday).toBe(2);
      expect(w.days[1].weekday).toBe(4);
      expect(w.days[2].weekday).toBeNull();
    }
  });

  test("idempotent on already-migrated documents", () => {
    const legacy: LegacyProgramSession[] = [
      { id: uuid(), name: "Day 1", order: 0, exercises: [baseExercise] },
    ];

    const firstPass = migrateProgramDocument(legacy, { plannedWeeks: 2, phase: "acc" });
    const secondPass = migrateProgramDocument(firstPass, { plannedWeeks: 2, phase: "acc" });
    expect(secondPass).toEqual(firstPass);
  });
});
