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

function datesToIso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(datesToIso);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, datesToIso(v)]));
  }
  return value;
}
