import type { ClientDto } from "./api/types";

/** Editable client profile shared by the new-client form and the Settings tab. */
export interface ProfileForm {
  sessionsPerWeek: number;
  trainingDays: number[];
  /** Run / cardio days; empty = the lifting days. */
  cardioDays: number[];
  /** ISO weekday the long run is pinned to; null = the placer decides. */
  longRunDay: number | null;
  /** 1RM rows being edited; rows without an exercise, kg or date are dropped on save. */
  oneRepMaxes: OneRepMaxRow[];
  cardioUnit: "none" | "minutes" | "sessions" | "zone_minutes";
  cardioValue: number;
  goals: string;
  limitations: string;
}

export interface OneRepMaxRow {
  exerciseId: string;
  kg: number | null;
  /** YYYY-MM-DD the 1RM was tested or set. */
  date: string;
}

export function emptyProfile(): ProfileForm {
  return { sessionsPerWeek: 3, trainingDays: [], cardioDays: [], longRunDay: null, oneRepMaxes: [], cardioUnit: "none", cardioValue: 120, goals: "", limitations: "" };
}

export function profileFromClient(c: ClientDto): ProfileForm {
  return {
    sessionsPerWeek: c.sessionsPerWeek ?? 3,
    trainingDays: c.trainingDays ? [...c.trainingDays] : [],
    cardioDays: c.cardioDays ? [...c.cardioDays] : [],
    longRunDay: c.longRunDay ?? null,
    oneRepMaxes: Object.entries(c.oneRepMaxes ?? {}).map(([exerciseId, m]) => ({ exerciseId, kg: m.kg, date: calendarDate(m.date) })),
    cardioUnit: c.cardioTarget?.unit ?? "none",
    cardioValue: c.cardioTarget?.value ?? 120,
    goals: c.goals ?? "",
    limitations: c.limitations ?? "",
  };
}

/** The API client revives date strings into Dates (or full ISO strings); a 1RM date is a UTC calendar day. */
function calendarDate(d: string | Date): string {
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

/** API fields for a profile: trimmed text, empty → null, "no cardio target" → null. */
export function profilePayload(f: ProfileForm) {
  const goals = f.goals.trim();
  const limitations = f.limitations.trim();
  return {
    goals: goals || null,
    limitations: limitations || null,
    sessionsPerWeek: Number(f.sessionsPerWeek),
    trainingDays: [...f.trainingDays].sort((a, b) => a - b),
    cardioTarget: f.cardioUnit === "none" ? null : { unit: f.cardioUnit, value: Number(f.cardioValue) },
    cardioDays: f.cardioDays.length ? [...f.cardioDays].sort((a, b) => a - b) : null,
    longRunDay: f.longRunDay == null ? null : Number(f.longRunDay),
    oneRepMaxes: oneRepMaxPayload(f.oneRepMaxes),
  };
}

/** Complete rows as exerciseId → { kg, date }; null when there are none. */
function oneRepMaxPayload(rows: OneRepMaxRow[]): Record<string, { kg: number; date: string }> | null {
  const out: Record<string, { kg: number; date: string }> = {};
  for (const r of rows) {
    const kg = Number(r.kg);
    if (!r.exerciseId || r.kg == null || !(kg > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    out[r.exerciseId] = { kg, date: r.date };
  }
  return Object.keys(out).length ? out : null;
}

/** Comparable snapshot for dirty tracking (ignores whitespace-only edits). */
export function profileKey(f: ProfileForm): string {
  return JSON.stringify(profilePayload(f));
}

/** Sensible starting value per cardio unit, so switching units never yields "120 sessions". */
export const CARDIO_DEFAULT: Record<Exclude<ProfileForm["cardioUnit"], "none">, number> = {
  minutes: 120,
  sessions: 2,
  zone_minutes: 60,
};

/**
 * What stacking the lifting sessions onto the picked days means, stated exactly:
 * null when every session gets its own day (or no days are picked).
 */
export function stackNote(sessions: number, days: number): string | null {
  const n = Number(sessions);
  if (days <= 0 || n <= days) return null;
  const stacked = Math.min(days, n - days);
  const most = Math.ceil(n / days);
  const dayWord = stacked === 1 ? "1 day" : `${stacked} days`;
  return most === 2
    ? `${dayWord} will hold two sessions`
    : `${dayWord} will hold more than one session — up to ${most} on one day`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function nameError(name: string): string | null {
  return name.trim() === "" ? "Enter the client's name" : null;
}

export function emailError(email: string): string | null {
  const e = email.trim();
  if (e === "") return null; // optional
  return EMAIL.test(e) ? null : "Enter a full email, like ada@gym.com";
}
