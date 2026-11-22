import { fmtDistance } from "./units.svelte";
import { cardioTotals, type CardioInterval, type CardioIntervalResult, type CardioLog, type CardioPrescription } from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";

/** What a cardio line reads: a prescription (targetRpe) or a log (rpe). */
export type CardioLineSource = Partial<Pick<CardioPrescription, "durationMin" | "hrZone" | "intensity" | "distanceKm" | "targetRpe">> &
  Partial<Pick<CardioLog, "rpe">> & {
    modality: string;
    /** A prescription's intervals; a log's per-rep results are ignored here. */
    intervals?: readonly (CardioInterval | CardioIntervalResult)[];
  };

/** Slugs the old presets stamped on every session; they say nothing the plan doesn't. */
const PRESET_SLUGS = new Set(["easy", "tempo", "intervals", "long"]);

/** The coach's own intensity words, or null for an old preset slug. */
export function coachIntensity(s: string | null | undefined): string | null {
  const v = s?.trim();
  return v && !PRESET_SLUGS.has(v.toLowerCase()) ? v : null;
}

const planned = (xs: CardioLineSource["intervals"]): CardioInterval[] => (xs ?? []).filter((x): x is CardioInterval => "type" in x);

/** One rep's amount, compact: 2′, 1′30″, 45″, 400 m. */
function repAmount(iv: Pick<CardioInterval, "durationSec" | "distanceM">): string | null {
  if (iv.durationSec) {
    const m = Math.floor(iv.durationSec / 60);
    const s = iv.durationSec % 60;
    return m && s ? `${m}′${s}″` : m ? `${m}′` : `${s}″`;
  }
  return iv.distanceM ? `${iv.distanceM} m` : null;
}

/** The work of an interval session: "5×2′", "20′", "6×400 m"; several work lines join with " + ". */
export function intervalSummary(intervals: readonly CardioInterval[]): string | null {
  const work = intervals.filter((iv) => iv.type === "work");
  const parts = work.map((iv) => {
    const a = repAmount(iv);
    if (!a) return null;
    return (iv.repeat ?? 1) > 1 ? `${iv.repeat}×${a}` : a;
  });
  const shown = parts.filter(Boolean);
  return shown.length ? shown.join(" + ") : null;
}

/**
 * One line for a cardio session or log: "Run · 35 min · Z2 · easy · 5.5 km · RPE 6".
 * An interval session reads its work and total instead: "Run · 5×2′ · 33:00 · RPE 8".
 * The one place the week view, the session card and the log chips read cardio from.
 */
export function cardioLine(c: CardioLineSource | null | undefined): string {
  if (!c) return "";
  const rpe = c.targetRpe ?? c.rpe;
  const intervals = planned(c.intervals);
  if (intervals.length) {
    const total = cardioTotals({ intervals }).durationSec;
    return [c.modality, intervalSummary(intervals), total ? formatDuration(total) : null, rpe ? `RPE ${rpe}` : null].filter(Boolean).join(" · ");
  }
  return [
    c.modality,
    c.durationMin ? `${c.durationMin} min` : null,
    c.hrZone ? `Z${c.hrZone}` : null,
    coachIntensity(c.intensity),
    c.distanceKm ? fmtDistance(c.distanceKm) : null,
    rpe ? `RPE ${rpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
