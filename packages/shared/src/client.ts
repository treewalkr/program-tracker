import type { ClientExperience } from "./domain";

/** Experience labels with the training-age band they stand for. */
export const EXPERIENCE_LABEL: Record<ClientExperience, { label: string; band: string }> = {
  beginner: { label: "Beginner", band: "under 1 yr" },
  intermediate: { label: "Intermediate", band: "1–3 yrs" },
  advanced: { label: "Advanced", band: "3+ yrs" },
};

/** Whole years between a `YYYY-MM-DD` birth date and `today` (`YYYY-MM-DD`), birthday-aware.
 *  Pure calendar arithmetic — no Date parsing, so no timezone shift. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}
