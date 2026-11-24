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

/**
 * One rest at a time per session, kept above the timer so paging to an exercise
 * without a prescribed rest (which shows no timer) doesn't end it.
 */
export interface RestRun {
  session: string | null;
  endsAt: number | null;
  total: number;
  finished: boolean;
}

export const idleRest = (session: string | null): RestRun => ({ session, endsAt: null, total: 0, finished: false });

/** The rest as `session` should see it: the running one if it's this session's, else none. */
export const restIn = (run: RestRun, session: string): RestRun => (run.session === session ? run : idleRest(session));

/** A rest of `seconds` starting at `now`. */
export const startRest = (session: string, seconds: number, now: number): RestRun => ({ session, endsAt: now + seconds * 1000, total: seconds, finished: false });

/** Counting down at `now`. */
export const restRunning = (run: RestRun, now: number): boolean => run.endsAt != null && secondsLeft(run.endsAt, now) > 0;
