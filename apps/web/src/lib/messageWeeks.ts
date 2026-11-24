import { blockAnchorDate, type SignalLog, type SignalProgram } from "@pt/shared";

const DAY_MS = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/**
 * Block weeks (1-indexed) of `program` that have at least one logged session.
 * Log dates arrive as `YYYY-MM-DD` or as full ISO timestamps (Eden revives
 * date strings), so compare calendar days only; unparseable dates are skipped
 * rather than becoming NaN keys.
 */
export function loggedBlockWeeks(program: SignalProgram, logs: SignalLog[]): number[] {
  const anchorDay = blockAnchorDate(program, logs).slice(0, 10);
  const anchor = dayMs(anchorDay);
  const weeks = new Set<number>();
  for (const l of logs) {
    if (l.programId !== program.id || l.date.slice(0, 10) < anchorDay) continue;
    const days = (dayMs(l.date) - anchor) / DAY_MS;
    if (!Number.isFinite(days)) continue;
    weeks.add(Math.floor(days / 7) + 1);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** A drafted message open in the editor, with the trainer's edits. */
export interface OpenDraft<M> {
  msg: M;
  text: string;
}

/**
 * Switch the message editor from week `from` to `to`. A draft still awaiting
 * approval is set aside under its week (it cost an AI call and isn't in
 * history yet) and `to`'s own parked draft, if any, comes back.
 */
export function switchDraftWeek<M extends { status: string }>(
  parked: Record<number, OpenDraft<M>>,
  from: number | null,
  open: OpenDraft<M> | null,
  to: number
): { parked: Record<number, OpenDraft<M>>; open: OpenDraft<M> | null } {
  const { [to]: back, ...rest } = parked;
  const keep = open?.msg.status === "validated" && from != null;
  return { parked: keep ? { ...rest, [from]: open } : rest, open: back ?? null };
}
