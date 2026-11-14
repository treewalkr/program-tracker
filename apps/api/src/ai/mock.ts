import {
  mockChatReply,
  mockImportExtraction,
  rotationOfWeek,
  type AiProgramDraft,
  type DraftSession,
  type DraftWeek,
  type Phasing,
  type WeekDirective,
} from "@pt/shared";

const sets = (n: number, reps: number, rest: number, extra: Partial<DraftSession["exercises"][number]["prescribedSets"][number]> = {}) =>
  Array.from({ length: n }, (_, i) => ({ setNumber: i + 1, type: "working" as const, reps, amrap: false, targetRpe: 8, restSeconds: rest, ...extra }));

/** Week A (and the only routine of a same-every-week block). Suggests Mon / Fri lifting and a Wednesday ride. */
const ROUTINE_A: DraftSession[] = [
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
      { exerciseName: "Romanian Deadlift", role: "strength", prescribedSets: sets(3, 8, 120) },
    ],
  },
  {
    name: "Day B — Upper",
    weekday: 5,
    kind: "lifting",
    exercises: [
      { exerciseName: "Bench Press", role: "primary", prescribedSets: sets(1, 5, 150) },
      {
        exerciseName: "Seated Cable Row",
        role: "accessory",
        prescribedSets: [...sets(2, 10, 90), { setNumber: 3, type: "working", reps: 10, amrap: true, targetRpe: 9, restSeconds: 90 }],
      },
    ],
  },
  { name: "Cardio 1", weekday: 3, kind: "cardio", cardio: { modality: "Bike", durationMin: 30, hrZone: 2 }, exercises: [] },
];

/** Week B: same days, different lifts. */
const ROUTINE_B: DraftSession[] = [
  {
    name: "Day A — Lower",
    weekday: 1,
    kind: "lifting",
    exercises: [
      { exerciseName: "Front Squat", role: "primary", prescribedSets: sets(3, 5, 180, { targetWeightKg: 80 }) },
      { exerciseName: "Hip Thrust", role: "strength", prescribedSets: sets(3, 10, 120) },
    ],
  },
  {
    name: "Day B — Upper",
    weekday: 5,
    kind: "lifting",
    exercises: [
      { exerciseName: "Overhead Press", role: "primary", prescribedSets: sets(3, 5, 150, { targetWeightKg: 45 }) },
      { exerciseName: "Lat Pulldown", role: "accessory", prescribedSets: sets(3, 10, 90) },
    ],
  },
  { name: "Cardio 1", weekday: 3, kind: "cardio", cardio: { modality: "Bike", durationMin: 30, hrZone: 2 }, exercises: [] },
];

/** base → +volume → +intensity → … with the last week a deload (blocks of 4+). */
function mockDirective(week: number, plannedWeeks: number): WeekDirective {
  if (plannedWeeks >= 4 && week === plannedWeeks) return "deload";
  if (week === 1) return "base";
  return week % 2 === 0 ? "+volume" : "+intensity";
}

function mockPhasing(plannedWeeks: number): Phasing {
  return {
    plannedWeeks,
    phase: "accumulation",
    nextPhase: "intensification",
    weeks: Array.from({ length: plannedWeeks }, (_, i) => {
      const directive = mockDirective(i + 1, plannedWeeks);
      return {
        week: i + 1,
        directive,
        ...(directive === "+volume" ? { target: { metric: "overall_volume" as const, deltaPercent: 5 } } : {}),
        ...(directive === "+intensity" ? { target: { metric: "intensity" as const, deltaPercent: 2.5 } } : {}),
      };
    }),
  };
}

/** `base` progressed `steps` times: +2.5 kg on loaded sets; a deload week drops a set and 10% load. */
function progressed(base: DraftSession[], steps: number, deload: boolean): DraftSession[] {
  return structuredClone(base).map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      let prescribedSets = e.prescribedSets.map((p) =>
        p.targetWeightKg != null ? { ...p, targetWeightKg: Math.round((p.targetWeightKg + 2.5 * steps) * (deload ? 0.9 : 1) * 2) / 2 } : p
      );
      if (deload && prescribedSets.length > 1) prescribedSets = prescribedSets.slice(0, -1);
      return { ...e, prescribedSets };
    }),
  }));
}

/**
 * Canned block draft for the "mock" provider — keyless pipeline testing and UI dev.
 * Uses exerciseName refs only, so approve exercises the create-custom path.
 * Every week in full: loads step +2.5 kg per same-letter week, the last week
 * of a 4+ week block deloads. With `alternate`, odd weeks run routine A and
 * even weeks routine B (different lifts).
 */
export function mockBlockDraft(opts: { plannedWeeks?: number; alternate?: boolean } = {}): AiProgramDraft {
  const plannedWeeks = opts.plannedWeeks ?? 4;
  const weeks: DraftWeek[] = Array.from({ length: plannedWeeks }, (_, i) => {
    const week = i + 1;
    const letter = opts.alternate ? rotationOfWeek(week) : undefined;
    const steps = opts.alternate ? Math.floor(i / 2) : i;
    const base = letter === "B" ? ROUTINE_B : ROUTINE_A;
    return {
      week,
      ...(letter ? { rotation: letter } : {}),
      sessions: progressed(base, steps, mockDirective(week, plannedWeeks) === "deload"),
    };
  });
  return {
    name: opts.alternate ? "Mock Block — A/B Weeks" : "Mock Block — Progressive Overload",
    rationale:
      "Volume held constant vs previous block; +2.5kg on primary lifts, first set RPE targets held at 8; each day pairs push with equal pull work and knee with hip work (squat/RDL, bench/row) for pattern balance." +
      (opts.alternate ? " Week B swaps in front squat, hip thrust, overhead press and pulldowns for variety." : ""),
    clientSummary: "Same split as before — small jumps on the main lifts, everything else unchanged.",
    phasing: mockPhasing(plannedWeeks),
    weeks,
  };
}

/** The default mock block: 4 weeks, same every week. */
export const MOCK_DRAFT: AiProgramDraft = mockBlockDraft();

/** Week re-draft: one week (`targetWeek`, its letter kept) of routine A or B with small load steps. */
export function mockWeekDraft(targetWeek: number, directive: string | null, rotation?: "A" | "B"): AiProgramDraft {
  return {
    name: `Week ${targetWeek}${directive ? ` — ${directive}` : ""}`,
    rationale: `Weekly re-draft (mock) for week ${targetWeek} repeats this week's sessions with small load progressions.`,
    clientSummary: "Same week again with small jumps where you earned them.",
    weeks: [
      {
        week: targetWeek,
        ...(rotation ? { rotation } : {}),
        sessions: structuredClone(rotation === "B" ? ROUTINE_B : ROUTINE_A),
      },
    ],
  };
}

/**
 * Fill draft (mock): every week not in `locked`, each built from the last
 * earlier week with its letter (the trainer's W1/W2 to start) with +2.5 kg
 * per step; the AI-free stand-in for "write the rest of the block".
 */
export function mockFillDraft(
  locked: readonly DraftWeek[],
  opts: { plannedWeeks: number; alternate: boolean; lockedWeeks: readonly number[]; phasing?: Phasing | null }
): AiProgramDraft {
  const out: DraftWeek[] = [];
  const all = [...locked];
  for (let week = 1; week <= opts.plannedWeeks; week++) {
    if (opts.lockedWeeks.includes(week)) continue;
    const letter = opts.alternate ? rotationOfWeek(week) : undefined;
    const basis = [...all].reverse().find((w) => w.week < week && (!letter || w.rotation === letter)) ?? all[0];
    const deload = opts.phasing?.weeks?.find((w) => w.week === week)?.directive === "deload";
    const w: DraftWeek = { week, ...(letter ? { rotation: letter } : {}), sessions: progressed(basis.sessions, 1, deload) };
    out.push(w);
    all.push(w);
    all.sort((a, b) => a.week - b.week);
  }
  return {
    name: "Mock fill",
    rationale: "Filled the rest of the block from your weeks: same exercises, +2.5 kg per week on loaded sets, lighter in the deload.",
    clientSummary: "The rest of your block, built on the weeks your coach wrote.",
    weeks: out,
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

/** Canned paste-import extraction: the Week 11–12 fixture's items on lines from…to
 *  (packages/shared/fixtures/import). Other text reads as nothing found; a chunk
 *  with a "mock: unreadable" line returns invalid output (a chunk that fails). */
export const MOCK_UNREADABLE = "mock: unreadable";
export function mockImportContent(lines: string[], from: number, to: number): string {
  if (lines.slice(from - 1, to).some((l) => l.includes(MOCK_UNREADABLE))) return "not json";
  return JSON.stringify(mockImportExtraction(lines, from, to));
}
