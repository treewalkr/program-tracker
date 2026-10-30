import type { CardioLog, CardioTarget, CardioTargetUnit } from "./domain";

/**
 * Weekly cardio math: ISO-week windows and target progress.
 * Pure functions over logs the client page / overview already hold —
 * same pattern as metrics.ts. No server round-trip for progress.
 */

/** YYYY-MM-DD of the ISO week's Monday containing `now`. */
export function isoWeekStart(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOffset = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
  d.setDate(d.getDate() - dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Minimal log shape the totals need — SessionLog DTOs fit structurally. */
export interface CardioCountLog {
  date: string;
  kind?: string;
  cardio?: CardioLog | null;
}

export interface CardioTotals {
  minutes: number;
  sessions: number;
  zoneMinutes: number;
}

/** Totals over cardio logs with `date >= since` (string compare on YYYY-MM-DD).
 *  Lifting logs and other clients' rows are ignored by the caller's filter. */
export function cardioWeekTotals(logs: CardioCountLog[], since: string): CardioTotals {
  const totals: CardioTotals = { minutes: 0, sessions: 0, zoneMinutes: 0 };
  for (const log of logs) {
    if (log.kind !== "cardio") continue;
    if (log.date < since) continue;
    totals.sessions += 1;
    if (log.cardio?.durationMin != null) {
      totals.minutes += log.cardio.durationMin;
      totals.zoneMinutes += log.cardio.durationMin * (log.cardio.hrZone ?? 1);
    }
  }
  return totals;
}

/** Done-value in the target's unit. */
export function cardioDone(target: CardioTarget, totals: CardioTotals): number {
  if (target.unit === "minutes") return totals.minutes;
  if (target.unit === "sessions") return totals.sessions;
  return totals.zoneMinutes;
}

export function cardioUnitLabel(unit: CardioTargetUnit): "min" | "sessions" | "zone-min" {
  if (unit === "minutes") return "min";
  if (unit === "sessions") return "sessions";
  return "zone-min";
}
