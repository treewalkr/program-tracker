import type { AiProgramDraft } from "@pt/shared";

/**
 * Canned draft for the "mock" provider — keyless pipeline testing and UI dev.
 * Uses exerciseName refs only, so approve exercises the create-custom path.
 */
export const MOCK_DRAFT: AiProgramDraft = {
  name: "Mock Block — Progressive Overload",
  rationale:
    "Volume held constant vs previous block; +2.5kg on primary lifts, first set RPE targets held at 8.",
  clientSummary: "Same split as before — small jumps on the main lifts, everything else unchanged.",
  sessions: [
    {
      name: "Day A — Lower",
      exercises: [
        {
          exerciseName: "Back Squat",
          prescribedSets: [
            { setNumber: 1, type: "warm_up", reps: 5, amrap: false, restSeconds: 90 },
            { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
            { setNumber: 3, type: "working", reps: 5, amrap: true, targetRpe: 9, restSeconds: 180 },
          ],
        },
        {
          exerciseName: "Romanian Deadlift",
          prescribedSets: [
            { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
            { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
            { setNumber: 3, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          ],
        },
      ],
    },
    {
      name: "Day B — Upper",
      exercises: [
        {
          exerciseName: "Bench Press",
          prescribedSets: [
            { setNumber: 1, type: "warm_up", reps: 5, amrap: false, restSeconds: 90 },
            { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 150 },
          ],
        },
        {
          exerciseName: "Seated Cable Row",
          prescribedSets: [
            { setNumber: 1, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
            { setNumber: 2, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
            { setNumber: 3, type: "working", reps: 10, amrap: true, targetRpe: 9, restSeconds: 90 },
          ],
        },
      ],
    },
  ],
};
