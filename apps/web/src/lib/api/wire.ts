import { normalizeKinds } from "@pt/shared";

/**
 * Eden result data → the DTO shapes pages use. Eden revives ISO date strings
 * into Date objects; the DTOs model dates as ISO strings, so we deep-convert
 * back — pages then see identical shapes in mock and live modes. Session kinds
 * and type formats read through the kind alias (docs/kind-rename-plan.md), so
 * old "lifting" values (AI history, import results) read as "exercises".
 */
export function trainerWire(value: unknown): unknown {
  return normalizeKinds(datesToIso(value));
}

/** Fields the API sends as a calendar day ("2026-11-23", a Postgres `date`). Eden revives
 *  them into a Date at UTC midnight like any timestamp; they go back as the day, so a
 *  date input and day comparisons see what mock mode gives them. */
const CALENDAR_DAYS = new Set(["startsOn", "birthDate", "startedOn", "effectiveFrom", "maxHrTestedOn", "testedOn"]);

function datesToIso(value: unknown, key?: string): unknown {
  if (value instanceof Date) return key && CALENDAR_DAYS.has(key) ? value.toISOString().slice(0, 10) : value.toISOString();
  if (Array.isArray(value)) return value.map((v) => datesToIso(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, datesToIso(v, k)]));
  }
  return value;
}
