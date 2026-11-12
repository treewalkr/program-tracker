/** Login page copy and decoration shared by every layout (see @pt/shared loginTheme). */

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account hasn't been added as a trainer. Ask the platform admin to add your email, or pick another account.",
  disabled: "Your access has been turned off. Ask the platform admin to turn it back on.",
  unverified: "Google hasn't verified that account's email address yet.",
  cancelled: "Sign-in was cancelled before Google finished.",
  expired: "That sign-in attempt timed out. Start again.",
  google_failed: "Google didn't answer properly. Try again in a moment.",
  not_configured: "Google sign-in isn't set up on the server yet — see the README for the four env vars it needs.",
};

/** The `?error=` code from the OAuth callback → what to tell the trainer; null when there's no error. */
export const loginErrorMessage = (code: string | null | undefined): string | null =>
  code ? (ERRORS[code] ?? "Sign-in didn't go through. Try again.") : null;

/** 0 = rest … 4 = heaviest day; one row per week, Mon → Sun. */
export type TrainingWeeks = readonly (readonly number[])[];

/** Decorative: four training weeks, the same green ramp as the block pulse. */
export const BLOCK_WEEKS: TrainingWeeks = [
  [2, 0, 3, 0, 2, 1, 0],
  [3, 0, 3, 0, 3, 2, 0],
  [3, 1, 4, 0, 4, 2, 0],
  [1, 0, 2, 0, 1, 0, 0],
];

/** Decorative: a twelve-week season — three blocks of build, build, peak, deload, each a notch heavier. */
export const SEASON_WEEKS: TrainingWeeks = [
  [2, 0, 2, 0, 1, 1, 0],
  [2, 0, 3, 0, 2, 1, 0],
  [3, 1, 3, 0, 3, 2, 0],
  [1, 0, 1, 0, 1, 0, 0],
  [2, 0, 3, 0, 2, 1, 0],
  [3, 0, 3, 1, 3, 2, 0],
  [3, 1, 4, 0, 3, 2, 0],
  [1, 0, 2, 0, 1, 0, 0],
  [3, 0, 3, 1, 3, 2, 0],
  [3, 1, 4, 1, 3, 2, 1],
  [4, 1, 4, 0, 4, 3, 0],
  [2, 0, 1, 0, 2, 0, 0],
];
