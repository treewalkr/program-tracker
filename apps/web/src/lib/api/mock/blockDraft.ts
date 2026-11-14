import { rotationOfWeek, type WeekDirective } from "@pt/shared";
import type { AiDraftDto, AiDraftSessionDto, AiDraftWeekDto, ProgramPhasingDto } from "../types";

/**
 * Mock block drafts: a one-week routine written the old way, spread over every
 * week like the real API's mock provider — +2.5 kg per same-letter week on
 * loaded sets, a lighter last week (4+ weeks). With `alternate`, even weeks run
 * a B routine: each exercise swapped for a sibling movement.
 */

/** A → B swaps over the demo catalog (same pattern, different movement). */
const B_SWAP: Record<string, string> = {
  "ex-squat": "ex-frontsquat",
  "ex-rdl": "ex-hipthrust",
  "ex-dead": "ex-kbswing",
  "ex-bench": "ex-dbbench",
  "ex-incline": "ex-kinesisincline",
  "ex-row": "ex-sarow",
  "ex-crow": "ex-sarow",
  "ex-pulldown": "ex-pullup",
  "ex-chin": "ex-pulldown",
  "ex-ohp": "ex-pushpress",
  "ex-landmine": "ex-kinesisincline",
  "ex-bss": "ex-walklunge",
  "ex-plank": "ex-sideplank",
  "ex-hlr": "ex-deadbug",
  "ex-facepull": "ex-reardelt",
  "ex-curl": "ex-bbcurl",
};

export interface LegacyMockDraft extends Omit<AiDraftDto, "weeks"> {
  sessions: AiDraftSessionDto[];
}

function directive(week: number, plannedWeeks: number): WeekDirective {
  if (plannedWeeks >= 4 && week === plannedWeeks) return "deload";
  if (week === 1) return "base";
  return week % 2 === 0 ? "+volume" : "+intensity";
}

export function mockPhasing(plannedWeeks: number): ProgramPhasingDto {
  return {
    plannedWeeks,
    phase: "accumulation",
    nextPhase: "intensification",
    weeks: Array.from({ length: plannedWeeks }, (_, i) => ({ week: i + 1, directive: directive(i + 1, plannedWeeks) })),
  } as ProgramPhasingDto;
}

const bRoutine = (sessions: AiDraftSessionDto[]): AiDraftSessionDto[] =>
  sessions.map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      const to = e.exerciseId ? B_SWAP[e.exerciseId] : undefined;
      return to ? { ...e, exerciseId: to, exerciseName: undefined, notes: undefined } : e;
    }),
  }));

/** `base` progressed `steps` same-letter weeks: +2.5 kg per step; a deload drops a set and 10% load. */
export function progressedSessions(base: AiDraftSessionDto[], steps: number, deload: boolean): AiDraftSessionDto[] {
  return structuredClone(base).map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      let sets = e.prescribedSets.map((p) =>
        p.targetWeightKg != null ? { ...p, targetWeightKg: Math.round((p.targetWeightKg + 2.5 * steps) * (deload ? 0.9 : 1) * 2) / 2 } : p
      );
      if (deload && sets.length > 1) sets = sets.slice(0, -1);
      return { ...e, prescribedSets: sets };
    }),
  }));
}

/** The old one-week draft as a full block of `plannedWeeks` weeks (A/B when `alternate`). */
export function mockBlock(d: LegacyMockDraft, opts: { plannedWeeks: number; alternate: boolean }): AiDraftDto {
  const { sessions, ...rest } = d;
  const b = bRoutine(sessions);
  const weeks: AiDraftWeekDto[] = Array.from({ length: opts.plannedWeeks }, (_, i) => {
    const week = i + 1;
    const letter = opts.alternate ? rotationOfWeek(week) : undefined;
    const steps = opts.alternate ? Math.floor(i / 2) : i;
    return {
      week,
      ...(letter ? { rotation: letter } : {}),
      sessions: progressedSessions(letter === "B" ? b : sessions, steps, directive(week, opts.plannedWeeks) === "deload"),
    };
  });
  return { ...rest, phasing: mockPhasing(opts.plannedWeeks), weeks };
}

/**
 * Mock fill (Fill with AI): every week not in `locked` is built from the last
 * earlier week with its letter (the trainer's to start) at +2.5 kg; the
 * trainer's weeks ride along locked. Same shape the API returns.
 */
export function mockFillWeeks(
  locked: AiDraftWeekDto[],
  opts: { plannedWeeks: number; alternate: boolean; phasing?: ProgramPhasingDto | null }
): AiDraftWeekDto[] {
  const all = locked.map((w) => ({ ...w, locked: true }));
  const lockedNos = new Set(locked.map((w) => w.week));
  for (let week = 1; week <= opts.plannedWeeks; week++) {
    if (lockedNos.has(week)) continue;
    const letter = opts.alternate ? rotationOfWeek(week) : undefined;
    const basis = [...all].reverse().find((w) => w.week < week && (!letter || w.rotation === letter)) ?? all[0];
    const deload = opts.phasing?.weeks?.find((w) => w.week === week)?.directive === "deload";
    all.push({ week, ...(letter ? { rotation: letter } : {}), locked: false, sessions: progressedSessions(basis.sessions, 1, deload) });
    all.sort((a, b) => a.week - b.week);
  }
  return all.map(({ locked: l, ...w }) => (l ? { ...w, locked: true } : w));
}
