import type { PortalCardioLog } from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";
import type { MessageKey } from "./messages";

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

/** "11.4 km". */
export function cardioDistance(km: number, t: T): string {
  return t("rx.km", { n: String(Math.round(km * 100) / 100) });
}

/** The newest test against the one before, to one decimal; null with fewer than two. */
export function vo2Delta(points: readonly { value: number }[]): number | null {
  if (points.length < 2) return null;
  return Math.round((points[points.length - 1].value - points[points.length - 2].value) * 10) / 10;
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
