/**
 * How long after arming a two-step confirm ignores the confirming click.
 *
 * 500 ms is the classic double-click interval (Windows' default, and about
 * where iOS stops treating two taps as a double tap), so a double tap, a
 * bouncing tap or a nervous second tap only arms. A deliberate "read the new
 * label, tap again" takes longer than that, so real confirms are unaffected.
 */
export const CONFIRM_GUARD_MS = 500;

/** True when a click at `now` may confirm a step armed at `armedAt` (both `performance.now()` ms). */
export function confirmAccepted(armedAt: number, now: number, guardMs = CONFIRM_GUARD_MS): boolean {
  return now - armedAt >= guardMs;
}
