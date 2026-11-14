import { draftWeek, type AiProgramDraft, type Rotation } from "@pt/shared";

/**
 * A week draft (`kind: "week"`) is one week: number it as the target week and
 * give it that week's A/B letter (a re-drafted A/B week keeps its letter),
 * whatever the AI wrote.
 */
export function stampWeekDraft(d: AiProgramDraft, targetWeek: number, rotation: Rotation | undefined): AiProgramDraft {
  const { rotation: _r, locked: _l, ...w } = draftWeek(d);
  return { ...d, weeks: [{ ...w, week: targetWeek, ...(rotation ? { rotation } : {}) }] };
}
