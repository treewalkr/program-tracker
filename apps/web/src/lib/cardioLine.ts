import type { CardioLog, CardioPrescription } from "@pt/shared";

/** What a cardio line reads: a prescription (targetRpe) or a log (rpe). */
export type CardioLineSource = Partial<Pick<CardioPrescription, "durationMin" | "hrZone" | "intensity" | "distanceKm" | "targetRpe">> &
  Partial<Pick<CardioLog, "rpe">> & { modality: string };

/**
 * One line for a cardio session or log: "Run · 35 min · Z2 · easy · 5.5 km · RPE 6".
 * The one place the week view, the session card and the log chips read cardio from.
 */
export function cardioLine(c: CardioLineSource | null | undefined): string {
  if (!c) return "";
  const rpe = c.targetRpe ?? c.rpe;
  return [
    c.modality,
    c.durationMin ? `${c.durationMin} min` : null,
    c.hrZone ? `Z${c.hrZone}` : null,
    c.intensity || null,
    c.distanceKm ? `${c.distanceKm} km` : null,
    rpe ? `RPE ${rpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
