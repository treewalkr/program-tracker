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

/** Client-basics limits — shared by the API body checks and the web form. */
export const BODYWEIGHT_KG_RANGE = { min: 20, max: 400 } as const;
export const HEIGHT_CM_RANGE = { min: 80, max: 250 } as const;
export const BIRTH_DATE_MIN = "1900-01-01";
export const STARTED_ON_MIN = "2000-01-01";
export const PHONE_MAX = 40;

/** Latest allowed "client since" day: one year after `today` (`YYYY-MM-DD`). */
export function startedOnMax(today: string): string {
  return `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
}

/** Why a `YYYY-MM-DD` birth date is out of range for `today`, or null when it's fine. */
export function birthDateError(birthDate: string, today: string): string | null {
  if (birthDate < BIRTH_DATE_MIN) return "Date of birth must be after 1900";
  if (birthDate > today) return "Date of birth can't be in the future";
  return null;
}

/** Why a `YYYY-MM-DD` "client since" day is out of range for `today`, or null when it's fine. */
export function startedOnError(startedOn: string, today: string): string | null {
  if (startedOn < STARTED_ON_MIN) return "Client since must be 2000 or later";
  if (startedOn > startedOnMax(today)) return "Client since can't be more than a year ahead";
  return null;
}
