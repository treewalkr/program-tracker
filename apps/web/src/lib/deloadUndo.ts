import { DEFAULT_DELOAD, deloadWeek, type DeloadSettings, type ProgramWeek } from "@pt/shared";

/** Per block week: the week before the deload, and the deloaded result it produced. */
export type DeloadUndo = Map<number, { before: ProgramWeek; after: string }>;

/** A week is "deloaded" while it still equals what the deload produced; any edit ends the undo window. */
export function isDeloaded(undo: DeloadUndo, week: ProgramWeek): boolean {
  const entry = undo.get(week.week);
  return entry != null && entry.after === JSON.stringify(week);
}

/** Deload `week` once by `settings` (with the block's `week1` for the week-1 basis),
 *  or undo it if it is still the deloaded result. Returns the week to show. */
export function toggleDeload(
  undo: DeloadUndo,
  week: ProgramWeek,
  settings: DeloadSettings = DEFAULT_DELOAD,
  week1?: ProgramWeek
): ProgramWeek {
  if (isDeloaded(undo, week)) {
    const { before } = undo.get(week.week)!;
    undo.delete(week.week);
    return before;
  }
  const after = deloadWeek(week, settings, week1);
  undo.set(week.week, { before: structuredClone(week), after: JSON.stringify(after) });
  return after;
}
