import type { ClientDto } from "./api/types";

/** Editable client profile shared by the new-client form and the Settings tab. */
export interface ProfileForm {
  sessionsPerWeek: number;
  trainingDays: number[];
  cardioUnit: "none" | "minutes" | "sessions" | "zone_minutes";
  cardioValue: number;
  goals: string;
  limitations: string;
}

export function emptyProfile(): ProfileForm {
  return { sessionsPerWeek: 3, trainingDays: [], cardioUnit: "none", cardioValue: 120, goals: "", limitations: "" };
}

export function profileFromClient(c: ClientDto): ProfileForm {
  return {
    sessionsPerWeek: c.sessionsPerWeek ?? 3,
    trainingDays: c.trainingDays ? [...c.trainingDays] : [],
    cardioUnit: c.cardioTarget?.unit ?? "none",
    cardioValue: c.cardioTarget?.value ?? 120,
    goals: c.goals ?? "",
    limitations: c.limitations ?? "",
  };
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
  };
}

/** Comparable snapshot for dirty tracking (ignores whitespace-only edits). */
export function profileKey(f: ProfileForm): string {
  return JSON.stringify(profilePayload(f));
}
