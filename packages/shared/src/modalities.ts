import type { CardioMetric } from "./domain";

/**
 * Cardio modalities: a fixed preset list every trainer gets (archive/restore
 * only, like session-type presets) plus the trainer's own. The metric decides
 * how pace shows for a log (cardioPace).
 */

export interface ModalityPreset {
  key: string;
  name: string;
  metric: CardioMetric;
}

export const MODALITY_NAME_MAX = 40;

export const MODALITY_PRESETS: readonly ModalityPreset[] = [
  { key: "running", name: "Running", metric: "pace" },
  { key: "walking", name: "Walking", metric: "pace" },
  { key: "cycling", name: "Cycling", metric: "speed" },
  { key: "rowing", name: "Rowing", metric: "split" },
  { key: "skierg", name: "SkiErg", metric: "split" },
  { key: "elliptical", name: "Elliptical", metric: "none" },
  { key: "stair-climber", name: "Stair climber", metric: "none" },
  { key: "other", name: "Other", metric: "none" },
];

const BY_KEY = new Map(MODALITY_PRESETS.map((m) => [m.key, m]));

export const modalityPreset = (key: string | null | undefined): ModalityPreset | null => (key && BY_KEY.get(key)) || null;

export interface ModalityLike {
  id: string;
  name: string;
  metric: CardioMetric;
  presetKey?: string | null;
  archivedAt?: string | Date | null;
}

/**
 * The metric for a logged modality name: the trainer's row by case-insensitive
 * name, else a preset by name, else "none" (no pace shown, never guessed).
 */
export function modalityMetric(name: string | null | undefined, rows: readonly Pick<ModalityLike, "name" | "metric">[] = []): CardioMetric {
  const key = name?.trim().toLowerCase();
  if (!key) return "none";
  const row = rows.find((r) => r.name.toLowerCase() === key) ?? MODALITY_PRESETS.find((p) => p.name.toLowerCase() === key);
  return row?.metric ?? "none";
}
