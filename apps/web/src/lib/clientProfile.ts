import {
  BODYWEIGHT_KG_RANGE,
  EXPERIENCE_LABEL,
  HEIGHT_CM_RANGE,
  ageOn,
  birthDateError as birthDateRangeError,
  startedOnError as startedOnRangeError,
  type ClientExperience,
  type ClientSex,
} from "@pt/shared";
import type { ClientDto } from "./api/types";
import { localIso } from "./overview";

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
  /** Basics — "" / null = not set. */
  experience: ClientExperience | "";
  /** YYYY-MM-DD, or "". */
  birthDate: string;
  sex: ClientSex | "";
  bodyweightKg: number | null;
  heightCm: number | null;
  /** YYYY-MM-DD the client started, or "". Admin-only. */
  startedOn: string;
}

export interface OneRepMaxRow {
  exerciseId: string;
  kg: number | null;
  /** YYYY-MM-DD the 1RM was tested or set. */
  date: string;
}

/** A blank profile for a new client; "client since" starts at today's local date. */
export function emptyProfile(today: string = localIso(new Date())): ProfileForm {
  return {
    sessionsPerWeek: 3,
    trainingDays: [],
    cardioDays: [],
    longRunDay: null,
    oneRepMaxes: [],
    cardioUnit: "none",
    cardioValue: 120,
    goals: "",
    limitations: "",
    experience: "",
    birthDate: "",
    sex: "",
    bodyweightKg: null,
    heightCm: null,
    startedOn: today,
  };
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
    experience: c.experience ?? "",
    birthDate: c.birthDate ? calendarDate(c.birthDate) : "",
    sex: c.sex ?? "",
    bodyweightKg: c.bodyweightKg ?? null,
    heightCm: c.heightCm ?? null,
    startedOn: c.startedOn ? calendarDate(c.startedOn) : "",
  };
}

/** The API client revives date strings into Dates (or full ISO strings); a calendar day is its UTC date. */
export function calendarDate(d: string | Date): string {
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
    experience: f.experience || null,
    birthDate: isDay(f.birthDate) ? f.birthDate : null,
    sex: f.sex || null,
    bodyweightKg: positiveOrNull(f.bodyweightKg),
    heightCm: positiveOrNull(f.heightCm),
    startedOn: isDay(f.startedOn) ? f.startedOn : null,
  };
}

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** A number input's value (number, "" or null) as a positive number, or null. */
function positiveOrNull(v: number | string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return n > 0 ? n : null;
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

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const dayList = (days: number[]) => [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d - 1]).join(" ");

/** One-line reading of the training week: "3 lifts on Mon Wed Fri · cardio on lifting days · long run any day". */
export function weekSummary(f: Pick<ProfileForm, "sessionsPerWeek" | "trainingDays" | "cardioDays" | "longRunDay">): string {
  const n = Number(f.sessionsPerWeek);
  const lifts = `${n} ${n === 1 ? "lift" : "lifts"} on ${f.trainingDays.length ? dayList(f.trainingDays) : "any day"}`;
  const cardio = `cardio on ${f.cardioDays.length ? dayList(f.cardioDays) : "lifting days"}`;
  const long = f.longRunDay == null ? "long run any day" : `long run ${DAY_SHORT[f.longRunDay - 1]}`;
  return [lifts, cardio, long].join(" · ");
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

/** Out-of-range basics, matching the API's limits. Empty values are fine (all optional). */
function rangeError(v: number | string | null, range: { min: number; max: number }, what: string, unit: string): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return n >= range.min && n <= range.max ? null : `${what} must be ${range.min}–${range.max} ${unit}`;
}

export function bodyweightError(kg: number | string | null): string | null {
  return rangeError(kg, BODYWEIGHT_KG_RANGE, "Bodyweight", "kg");
}

export function heightError(cm: number | string | null): string | null {
  return rangeError(cm, HEIGHT_CM_RANGE, "Height", "cm");
}

export function birthDateError(date: string, today: string = localIso(new Date())): string | null {
  return isDay(date) ? birthDateRangeError(date, today) : null;
}

export function startedOnError(date: string, today: string = localIso(new Date())): string | null {
  return isDay(date) ? startedOnRangeError(date, today) : null;
}

/** True when any basics field would be refused by the API. */
export function basicsInvalid(f: ProfileForm): boolean {
  return !!(bodyweightError(f.bodyweightKg) || heightError(f.heightCm) || birthDateError(f.birthDate) || startedOnError(f.startedOn));
}

/** A phone field's value for the API: trimmed, empty → null. */
export function phonePayload(phone: string): string | null {
  return phone.trim() || null;
}

/** The set basics for the client header: "Intermediate", "34 yrs", "Female", "72 kg". */
export function basicsSummary(c: ClientDto, today: string = localIso(new Date())): string[] {
  const parts: string[] = [];
  if (c.experience) parts.push(EXPERIENCE_LABEL[c.experience].label);
  if (c.birthDate) parts.push(`${ageOn(calendarDate(c.birthDate), today)} yrs`);
  if (c.sex) parts.push(c.sex === "female" ? "Female" : "Male");
  if (c.bodyweightKg != null) parts.push(`${c.bodyweightKg} kg`);
  return parts;
}
