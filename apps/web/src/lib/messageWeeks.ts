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
