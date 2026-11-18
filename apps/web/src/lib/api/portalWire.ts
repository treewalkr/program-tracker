import { normalizeKind } from "@pt/shared";

/** Fields that carry a calendar day (YYYY-MM-DD) — everything else that Eden revived is a timestamp. */
const DAY_KEYS = new Set(["date", "startDate", "endDate"]);

/**
 * Eden revives ISO-looking strings into Dates; the portal DTOs hold strings.
 * Day fields go back to `YYYY-MM-DD` (Eden reads "2026-11-16" as UTC midnight),
 * timestamps to full ISO — so pages see the same shapes as in mock mode.
 * Session kinds read through the kind alias (docs/kind-rename-plan.md), so an
 * open portal tab keeps working against a newer API that writes "exercises".
 */
export function portalWire(value: unknown, key?: string): unknown {
  if (key === "kind" && typeof value === "string") return normalizeKind(value);
  if (value instanceof Date) return key && DAY_KEYS.has(key) ? value.toISOString().slice(0, 10) : value.toISOString();
  if (Array.isArray(value)) return value.map((v) => portalWire(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, portalWire(v, k)]));
  }
  return value;
}
