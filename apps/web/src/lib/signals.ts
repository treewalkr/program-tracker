/**
 * Signal engine lives in @pt/shared (same ids, same thresholds) so the API's
 * GET /v1/notifications computes identical signals. Snooze stays local to the
 * web app — the source of truth differs per mode (localStorage here; the
 * signal_snoozes table when live wiring lands).
 */
export { computeSignals, weekOf } from "@pt/shared";
export type { Signal, SignalKind } from "@pt/shared";

const SNOOZE_KEY = "pt-snoozed-signals";

function snoozeMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function snoozeSignal(id: string, days = 7) {
  snoozeUntil(id, new Date(Date.now() + days * 86400_000).toISOString());
}

export function snoozeUntil(id: string, untilIso: string) {
  const map = snoozeMap();
  map[id] = untilIso;
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

export function isSnoozed(id: string): boolean {
  const until = snoozeMap()[id];
  return !!until && new Date(until).getTime() > Date.now();
}

export function activeSignals<T extends { id: string }>(signals: T[]): T[] {
  return signals.filter((s) => !isSnoozed(s.id));
}
