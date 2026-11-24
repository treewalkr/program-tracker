import { localDateOf, type PortalCardio, type PortalCardioLog } from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";
import type { MessageKey } from "./messages";
import { distanceText } from "./rx";

/** The Progress tab's words and numbers. Pure — the caller passes the portal's `t`. */
type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** "45 min", "2 h 15 min", "3 h". */
export function hoursMinutes(minutes: number, t: T): string {
  const total = Math.round(minutes);
  if (total < 60) return t("rx.minutes", { n: total });
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? t("progress.h", { h }) : t("progress.hm", { h, m });
}

/** "11.4 km" / "7.08 mi", in the member's unit. */
export const cardioDistance = (km: number, t: T): string => distanceText(km, t);

/** The newest test against the one before, unrounded (to 0.1, past float noise); null with fewer than two.
 *  Round only to show it (`vo2Shown`): the "real change" rule reads this. */
export function vo2Delta(points: readonly { value: number }[]): number | null {
  if (points.length < 2) return null;
  return Math.round((points[points.length - 1].value - points[points.length - 2].value) * 10) / 10;
}

/** The change as shown: whole ml/kg/min, since a field test isn't precise past that. */
export const vo2Shown = (delta: number): number => Math.sign(delta) * Math.round(Math.abs(delta));

/** A change worth the green badge: at least 2 ml/kg/min up (unrounded: +1.7 isn't), on the same protocol. */
export const VO2_REAL_CHANGE = 2;
export const vo2Tone = (delta: number): "good" | "neutral" => (delta >= VO2_REAL_CHANGE ? "good" : "neutral");

/** The y-axis ends for the trend: whole numbers just outside the values. */
export function trendAxis(points: readonly { value: number }[]): { top: number; bottom: number } | null {
  if (points.length < 2) return null;
  const vs = points.map((p) => p.value);
  return { top: Math.ceil(Math.max(...vs)), bottom: Math.floor(Math.min(...vs)) };
}

const DAY = 86_400_000;

/** A small trend line: x by test date, y by value, inset so the dots aren't clipped. */
export function trendPath(points: readonly { testedOn: string; value: number }[], w: number, h: number) {
  const pad = 6;
  if (points.length === 0) return { line: "", dots: [] as { x: number; y: number }[] };
  const ts = points.map((p) => Date.parse(`${p.testedOn}T00:00:00Z`) / DAY);
  const vs = points.map((p) => p.value);
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
  const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
  const x = (d: number) => (t1 === t0 ? w / 2 : pad + ((d - t0) / (t1 - t0)) * (w - 2 * pad));
  const y = (v: number) => (v1 === v0 ? h / 2 : h - pad - ((v - v0) / (v1 - v0)) * (h - 2 * pad));
  const dots = points.map((p, i) => ({ x: Math.round(x(ts[i]) * 10) / 10, y: Math.round(y(p.value) * 10) / 10 }));
  return { line: dots.map((d) => `${d.x},${d.y}`).join(" "), dots };
}

/** One recent log: its time on the right, then distance · RPE · average HR. */
export function logLine(l: PortalCardioLog, t: T, distance: (km: number) => string = (km) => cardioDistance(km, t)): { time: string; detail: string } {
  if (l.skipped) return { time: t("progress.skipped"), detail: "" };
  const detail = [
    l.distanceKm ? distance(l.distanceKm) : null,
    l.rpe != null ? t("rx.rpe", { n: l.rpe }) : null,
    l.avgHr != null ? t("progress.avgHr", { n: l.avgHr }) : null,
  ].filter(Boolean);
  return { time: l.durationSec != null ? formatDuration(l.durationSec) : "—", detail: detail.join(" · ") };
}

/** A review timestamp as the member's own calendar day (a Bangkok evening is the next UTC day's morning). */
export function reviewDay(at: string): string {
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? at.slice(0, 10) : localDateOf(ms);
}

/**
 * This week's cardio as the member reads it: sessions and time first. A load
 * (or zone-minutes) target is the coach's yardstick, so it comes second, as a
 * plain number; a sessions or minutes target is already the lead.
 */
export function cardioSummary(c: PortalCardio, t: T): { lead: string; second: string | null } {
  const target = t(`week.cardio.${c.unit}` as MessageKey, { done: Math.round(c.done), target: c.target });
  const coachYardstick = c.unit === "session_load" || c.unit === "zone_minutes";
  if (!coachYardstick || c.sessions == null || c.minutes == null) return { lead: target, second: null };
  const time = hoursMinutes(c.minutes, t);
  const lead = c.sessions === 1 ? t("week.cardio.leadOne", { time }) : t("week.cardio.lead", { sessions: c.sessions, time });
  return { lead, second: target };
}
