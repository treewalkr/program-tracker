import { mockChatReply, type AiProgramDraft } from "@pt/shared";

/**
 * Canned draft for the "mock" provider — keyless pipeline testing and UI dev.
 * Uses exerciseName refs only, so approve exercises the create-custom path.
 * Suggests Mon / Fri lifting and a Wednesday ride, like a real draft would;
 * placement keeps them for Mon-Wed-Fri clients and re-places them otherwise.
 */
export const MOCK_DRAFT: AiProgramDraft = {
  name: "Mock Block — Progressive Overload",
  rationale:
    "Volume held constant vs previous block; +2.5kg on primary lifts, first set RPE targets held at 8; each day pairs push with equal pull work and knee with hip work (squat/RDL, bench/row) for pattern balance.",
  clientSummary: "Same split as before — small jumps on the main lifts, everything else unchanged.",
  phasing: {
    plannedWeeks: 4,
    phase: "accumulation",
    nextPhase: "intensification",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
      { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
      { week: 4, directive: "deload" },
    ],
  },
  sessions: [
    {
      name: "Day A — Lower",
      weekday: 1,
      kind: "lifting",
      exercises: [
        {
          exerciseName: "Back Squat",
          role: "primary",
          prescribedSets: [
            { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 180, targetWeightKg: 102.5 },
            { setNumber: 2, type: "working", reps: 5, amrap: true, targetRpe: 9, restSeconds: 180, targetWeightKg: 102.5 },
          ],
        },
        {
          exerciseName: "Romanian Deadlift",
          role: "strength",
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
      weekday: 5,
      kind: "lifting",
      exercises: [
        {
          exerciseName: "Bench Press",
          role: "primary",
          prescribedSets: [
            { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 150 },
          ],
        },
        {
          exerciseName: "Seated Cable Row",
          role: "accessory",
          prescribedSets: [
            { setNumber: 1, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
            { setNumber: 2, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
            { setNumber: 3, type: "working", reps: 10, amrap: true, targetRpe: 9, restSeconds: 90 },
          ],
        },
      ],
    },
    {
      name: "Cardio 1",
      weekday: 3,
      kind: "cardio",
      cardio: { modality: "Bike", durationMin: 30, hrZone: 2 },
      exercises: [],
    },
  ],
};

export function mockWeekDraft(targetWeek: number, directive: string | null): AiProgramDraft {
  return {
    name: `Week ${targetWeek}${directive ? ` — ${directive}` : ""}`,
    rationale: `Weekly re-draft (mock) for week ${targetWeek} repeats this week's sessions with small load progressions.`,
    clientSummary: "Same week again with small jumps where you earned them.",
    sessions: structuredClone(MOCK_DRAFT.sessions),
  };
}

import type { AiClientMessageDraft, WeekSummaryStats } from "@pt/shared";

/** Deterministic canned client message — keyless pipeline testing and UI dev.
 *  Templated from the computed stats so the numbers are always real. */
export function mockClientMessage(stats: WeekSummaryStats): AiClientMessageDraft {
  const lines: string[] = [];
  const sessions =
    stats.sessionsPlanned != null
      ? `${stats.sessionsLogged} of ${stats.sessionsPlanned} sessions`
      : `${stats.sessionsLogged} sessions`;
  lines.push(
    `Strong week — ${sessions} logged and ${stats.overallVolume}kg lifted across ${stats.sets} sets.`
  );
  if (stats.prs.length > 0) {
    const pr = stats.prs[0];
    lines.push(
      `Highlight: ${pr.exerciseName} at ${pr.weightKg}kg for ${pr.reps} — your best yet on that lift (previous best ${pr.prevBest}kg est. 1RM).`
    );
  } else {
    lines.push(`Every planned rep got done — that consistency is exactly what progress is built on.`);
  }
  if (stats.nextWeek) {
    const what =
      stats.nextWeek.directive === "+volume"
        ? "a bit more total work"
        : stats.nextWeek.directive === "+intensity"
          ? "slightly heavier top sets"
          : stats.nextWeek.directive === "deload"
            ? "an easier week to absorb all this work"
            : "the same rhythm with small steps forward";
    lines.push(`Next week we move into ${what} — same plan, just turn up as you did this week.`);
  } else {
    lines.push(`That wraps the block — great way to finish it. I'll have your next program ready shortly.`);
  }
  return { message: lines.join("\n") };
}

/** Mock chat reply, grounded like a real answer: cites the newest dated
 *  TRAINING LOG entry when there is one (unchanged canned text otherwise). */
export function mockGroundedChatReply(message: string, clientName: string | null, trainingLog?: string | null): string {
  const base = mockChatReply(message, clientName);
  const latest = trainingLog?.split("\n")[0];
  return latest ? `${base} Latest logged: ${latest}` : base;
}
