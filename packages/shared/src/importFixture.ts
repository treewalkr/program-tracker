import type { ImportActual, ImportChunk, ImportExercise, ImportPrescription, ImportSession } from "./import";

/**
 * Hand-written expected extraction of fixtures/import/week11-12.txt — what a
 * correct model returns. The unit tests check the pipeline against it, and the
 * mock provider returns it (filtered to the chunk it is asked about), so CI
 * never calls a real model.
 */

const rx = (p: Partial<ImportPrescription>): ImportPrescription => ({ sets: null, ...p });
const logged = (...sets: [reps: number, kg?: number][]): ImportActual[] =>
  sets.map(([reps, kg]) => (kg === undefined ? { reps } : { reps, kg }));
const times = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

function ex(
  line: number,
  sourceName: string,
  name: string,
  prescription: ImportPrescription | null,
  extra: Partial<ImportExercise> = {},
): ImportExercise {
  return { line, sourceName, name, prescription, ...extra };
}

const lifting = (name: string, line: number, exercises: ImportExercise[]): ImportSession => ({
  name,
  kind: "lifting",
  line,
  exercises,
});

export const WEEK11_12_EXTRACTION: ImportChunk = {
  weeks: [
    {
      label: "Week 11",
      line: 1,
      days: [
        {
          label: "Day 1 Back/Biceps",
          line: 3,
          sessions: [
            lifting("Back/Biceps", 3, [
              ex(4, "Lateral Stretch", "Lateral Stretch", null, { variation: "Static Stretch" }),
              ex(5, "Scapular Depression", "Scapular Depression", rx({ reps: 10, sets: 2, setsLow: 1 }), {
                actuals: logged([10], [10]),
              }),
              ex(6, "Pull up", "Pull-Up", rx({ reps: 6, sets: 3 }), { variation: "Power", actuals: logged([6], [6], [6]) }),
              ex(7, "SA Row", "Single-Arm Row", rx({ reps: 10, repsLow: 6, sets: 3 }), {
                actuals: logged(...times(3, [10, 20] as [number, number])),
              }),
              ex(8, "Bent over row", "Bent-Over Row", rx({ reps: 5, sets: 5 }), {
                variation: "Supinate",
                actuals: logged([5, 60], [5, 65], [5, 67.5], [5, 70], [5, 70]),
              }),
              ex(9, "Lat pull down", "Lat Pulldown", rx({ sets: 4, repsList: [10, 8, 6, 5] }), {
                variation: "Pyramid",
                equipment: "machine",
                actuals: logged([10, 50], [8, 60], [6, 65], [5, 70]),
              }),
              ex(10, "Low row", "Low Row", rx({ sets: 4, repsList: [10, 8, 6, 5] }), {
                equipment: "machine",
                actuals: logged([10, 45], [8, 55], [6, 67.5], [5, 75]),
              }),
              ex(11, "BB standing bicpes", "Barbell Standing Biceps Curl", rx({ reps: 12, sets: 4 }), {
                actuals: logged([12, 17.5], [12, 20], [12, 20], [12, 20]),
              }),
            ]),
            {
              name: "Cardio",
              kind: "cardio",
              line: 13,
              cardio: { modality: "Cardio", hrZone: 3, hrZoneLow: 2, durationMin: 60, durationMinLow: 40 },
              exercises: [],
            },
          ],
        },
        {
          label: "Day 2 Chest/Triceps",
          line: 15,
          sessions: [
            lifting("Chest/Triceps", 15, [
              ex(16, "Chest stretch", "Chest Stretch", rx({ seconds: 15, secondsLow: 10, sets: 2, setsLow: 1 }), {
                variation: "PAILs/RAILs",
              }),
              ex(17, "Shoulder mobility", "Shoulder Mobility", rx({ reps: 5, repsLow: 3, unit: "rounds", sets: 2, setsLow: 1 }), {
                variation: "CARs",
              }),
              ex(18, "Shoulder external rotation", "Shoulder External Rotation", rx({ reps: 10, sets: 3, setsLow: 2 })),
              ex(19, "Close grip Military press", "Close-Grip Military Press", rx({ reps: 10, repsLow: 6, sets: 3 }), {
                variation: "Asymmetrical",
                actuals: logged([12, 25], [12, 27.5], [12, 27.5]),
              }),
              ex(20, "Bench press", "Bench Press", rx({ reps: 12, sets: 4 }), {
                actuals: logged([12, 45], [12, 50], [12, 50], [12, 50]),
              }),
              ex(21, "DB Incline 45 degrees Bench press", "Dumbbell Incline Bench Press", rx({ reps: 12, sets: 4 }), {
                actuals: logged([12, 16], [12, 16], [12, 18], [12, 18]),
              }),
              ex(22, "Wide chest press", "Wide Chest Press", rx({ reps: 12, sets: 4 }), {
                actuals: logged([12, 20], [12, 25], [12, 30], [12, 32.5]),
              }),
              ex(23, "Triceps OVH extension", "Triceps Overhead Extension", rx({ reps: 12, sets: 4 }), {
                actuals: logged([12, 14], [12, 14], [10, 16], [10, 16]),
              }),
            ]),
            {
              name: "Long run",
              kind: "cardio",
              line: 25,
              cardio: { modality: "Run", hrZone: 2, hrZoneLow: 1, distanceKm: 10, intensity: "10 km++" },
              exercises: [],
            },
          ],
        },
        {
          label: "Day 3 Lower",
          line: 27,
          sessions: [
            lifting("Lower", 27, [
              ex(28, "Hip flexor stretch", "Hip Flexor Stretch", rx({ seconds: 15, secondsLow: 10, sets: 2, setsLow: 1 }), {
                variation: "Static Stretch",
              }),
              ex(29, "Hip mobility", "Hip Mobility", rx({ reps: 5, repsLow: 3, unit: "rounds", sets: 2, setsLow: 1 }), {
                variation: "CARs",
              }),
              ex(30, "KB Deadlift to Squat", "Kettlebell Deadlift to Squat", rx({ reps: 10, sets: 3 }), {
                actuals: logged(...times(3, [10, 12] as [number, number])),
              }),
              ex(31, "KB American Swing", "Kettlebell American Swing", rx({ seconds: 60, sets: 3 }), {
                actuals: logged(...times(3, [25, 12] as [number, number])),
              }),
              ex(32, "Conventional Deadlift", "Conventional Deadlift", rx({ reps: 10, sets: 4 }), {
                actuals: logged(...times(4, [10, 50] as [number, number])),
              }),
              ex(33, "Front Squat", "Front Squat", rx({ reps: 10, sets: 4 }), {
                actuals: logged(...times(4, [10, 50] as [number, number])),
              }),
              ex(34, "BB Static Lunge", "Barbell Static Lunge", rx({ reps: 10, sets: 4 }), {
                actuals: logged(...times(4, [10, 25] as [number, number])),
              }),
              ex(35, "Hip thrust", "Hip Thrust", rx({ reps: 10, sets: 4 }), {
                actuals: logged(...times(4, [10, 50] as [number, number])),
              }),
            ]),
          ],
        },
      ],
    },
    {
      label: "Week 12",
      line: 37,
      days: [
        {
          label: "Day 1 Upper Push",
          line: 39,
          sessions: [
            lifting("Upper Push", 39, [
              ex(40, "Push press", "Push Press", rx({ reps: 6, sets: 5 }), {
                actuals: logged([6, 40], [6, 45], [6, 45], [6, 47.5], [6, 47.5]),
              }),
              ex(41, "DB Bench press", "Dumbbell Bench Press", rx({ reps: 8, repsLow: 6, sets: 4 }), {
                actuals: logged([8, 20], [8, 24], [8, 26]),
              }),
              ex(42, "Incline bench press", "Incline Bench Press", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                variation: "Kinesis",
                actuals: logged(...times(3, [12, 10] as [number, number])),
              }),
              ex(43, "Crossover / Dip", "Crossover / Dip", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12], [12], [12]),
              }),
              ex(44, "Push up", "Push-Up", rx({ failure: true, sets: 3 }), { actuals: logged([9], [10], [10]) }),
              ex(45, "Triceps rope push down", "Triceps Rope Pushdown", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12, 15], [10, 17.5], [10, 17.5]),
              }),
            ]),
          ],
        },
        {
          label: "Day 2 Upper Pull",
          line: 47,
          sessions: [
            lifting("Upper Pull", 47, [
              ex(48, "Power high pull", "Power High Pull", rx({ reps: 6, sets: 5 }), {
                actuals: logged([6, 40], [6, 45], [6, 47.5], [6, 50], [6, 52.5]),
              }),
              ex(49, "V-bar row", "V-Bar Row", rx({ reps: 8, repsLow: 6, sets: 4 }), {
                actuals: logged([8, 50], [8, 60], [6, 70], [6, 70]),
              }),
              ex(50, "Lat pull down", "Lat Pulldown", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                equipment: "machine",
                actuals: logged([12, 50], [12, 55], [10, 60]),
              }),
              ex(51, "Rear delt row", "Rear Delt Row", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12, 40], [12, 42.5], [10, 45]),
              }),
              ex(52, "Invert row", "Inverted Row", rx({ failure: true, sets: 3 }), { actuals: logged([16], [16], [15]) }),
              ex(53, "Biceps rope curl", "Biceps Rope Curl", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12, 15], [12, 15], [12, 17.5]),
              }),
            ]),
          ],
        },
        {
          label: "Day 3 Lower",
          line: 55,
          sessions: [
            lifting("Lower", 55, [
              ex(56, "Squat", "Squat", rx({ reps: 8, repsLow: 6, sets: 4 }), {
                actuals: logged([8, 60], [8, 70], [8, 80], [7, 85]),
              }),
              ex(57, "Leg press", "Leg Press", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12, 120], [12, 140]),
              }),
              ex(58, "Walking lunge", "Walking Lunge", rx({ reps: 20, unit: "steps", sets: 3 }), {
                actuals: logged(...times(3, [20, 20] as [number, number])),
              }),
              ex(59, "Leg extensions", "Leg Extension", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12, 30], [12, 40], [12, 45]),
              }),
              ex(60, "Leg curl", "Leg Curl", rx({ reps: 12, repsLow: 9, sets: 3 }), {
                actuals: logged([12, 30], [12, 35], [12, 37.5]),
              }),
            ]),
          ],
        },
      ],
    },
  ],
  skipped: [],
};

/**
 * The mock provider's extraction for lines `from`…`to` of a paste: the
 * fixture's items whose line is in range and still reads as the fixture
 * does. Any other text comes back empty, so the review shows it as unused.
 */
export function mockImportExtraction(lines: string[], from: number, to: number): ImportChunk {
  const has = (line: number | null | undefined, text: string) =>
    line != null && line >= from && line <= to && (lines[line - 1] ?? "").toLowerCase().includes(text.toLowerCase());
  const weeks = WEEK11_12_EXTRACTION.weeks.flatMap((w) => {
    const days = w.days.flatMap((d) => {
      const sessions = d.sessions.flatMap((s) => {
        const exercises = s.exercises.filter((e) => has(e.line, e.sourceName));
        if (!has(s.line, s.name) || (s.kind === "lifting" && exercises.length === 0)) return [];
        return [{ ...s, exercises }];
      });
      return has(d.line, d.label) && sessions.length > 0 ? [{ ...d, sessions }] : [];
    });
    return has(w.line, w.label ?? "") && days.length > 0 ? [{ ...w, days }] : [];
  });
  return structuredClone({ weeks, skipped: [] });
}
