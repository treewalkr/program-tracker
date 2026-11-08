import { deloadWeek, type ProgramWeek } from "@pt/shared";

/** Per block week: the week before the deload, and the deloaded result it produced. */
export type DeloadUndo = Map<number, { before: ProgramWeek; after: string }>;

/** A week is "deloaded" while it still equals what the deload produced; any edit ends the undo window. */
export function isDeloaded(undo: DeloadUndo, week: ProgramWeek): boolean {
  const entry = undo.get(week.week);
  return entry != null && entry.after === JSON.stringify(week);
}

/** Deload `week` once, or undo it if it is still the deloaded result. Returns the week to show. */
export function toggleDeload(undo: DeloadUndo, week: ProgramWeek): ProgramWeek {
  if (isDeloaded(undo, week)) {
    const { before } = undo.get(week.week)!;
    undo.delete(week.week);
    return before;
  }
  const after = deloadWeek(week);
  undo.set(week.week, { before: structuredClone(week), after: JSON.stringify(after) });
  return after;
}
