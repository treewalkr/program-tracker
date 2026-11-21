import { cardioTotals, type CardioMetric, type CardioPrescription } from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";

type Shape = Omit<CardioPrescription, "modality"> & { modality?: string };

/** One line for a template: "Intervals · 33:00 · Z5 work · RPE 8" or "40 min · Z2 · RPE 3". */
export function templateSummary(rx: Shape): string {
  const t = cardioTotals(rx);
  const ivs = rx.intervals ?? [];
  const parts: string[] = [];
  if (ivs.length) {
    const work = ivs.filter((iv) => iv.type === "work");
    const reps = work.map((iv) => `${iv.repeat > 1 ? `${iv.repeat} × ` : ""}${iv.durationSec != null ? formatDuration(iv.durationSec) : iv.distanceM ? `${iv.distanceM} m` : "—"}`);
    parts.push(reps.length ? reps.join(" + ") : `${ivs.length} intervals`);
    parts.push(t.durationSec != null ? `${formatDuration(t.durationSec)} total` : "time by distance");
    const zone = work.find((iv) => iv.hrZone)?.hrZone;
    if (zone) parts.push(`Z${zone} work`);
  } else {
    if (rx.durationMin) parts.push(`${rx.durationMin} min`);
    if (rx.distanceKm) parts.push(`${rx.distanceKm} km`);
    if (rx.hrZone) parts.push(`Z${rx.hrZone}`);
  }
  if (rx.targetRpe) parts.push(`RPE ${rx.targetRpe}`);
  return parts.join(" · ");
}

export const METRIC_LABEL: Record<CardioMetric, string> = {
  pace: "Pace per km",
  split: "Split per 500 m",
  speed: "Speed (km/h)",
  none: "No pace",
};

export const METRIC_HINT: Record<CardioMetric, string> = {
  pace: "Running, walking: minutes per km",
  split: "Rowing, SkiErg: time per 500 m",
  speed: "Cycling: km per hour",
  none: "Machines without a fair distance",
};
