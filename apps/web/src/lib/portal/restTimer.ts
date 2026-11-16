/**
 * Rest timer math, pure. The countdown runs off a wall-clock end time, not a
 * tick count, so a throttled tab or a locked phone still lands on time.
 */

/** Whole seconds left until `endsAt` (never negative). */
export const secondsLeft = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));

/** "2:05", "0:45". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The rest an exercise block prescribes: its first set with a rest, else none. */
export function restOf(sets: readonly { restSeconds?: number | null }[]): number | null {
  const r = sets.find((s) => s.restSeconds != null && s.restSeconds > 0)?.restSeconds;
  return r ?? null;
}
