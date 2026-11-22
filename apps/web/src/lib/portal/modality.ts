import { MODALITY_PRESETS } from "@pt/shared";
import type { Locale } from "./messages";

/**
 * The preset modalities in Thai, as a coach says them. Stored names stay
 * English (the coach's library and the AI read them); the portal shows and
 * accepts these, and maps a typed Thai preset name back before saving.
 * A trainer's own modality keeps the name they gave it.
 */
const TH: Record<string, string> = {
  running: "วิ่ง",
  walking: "เดิน",
  cycling: "ปั่นจักรยาน",
  rowing: "เครื่องพาย",
  skierg: "SkiErg",
  elliptical: "อีลิปติคอล",
  "stair-climber": "เครื่องขึ้นบันได",
  other: "อื่น ๆ",
};

const byName = new Map(MODALITY_PRESETS.map((p) => [p.name.toLowerCase(), p.key]));
const byThai = new Map(MODALITY_PRESETS.map((p) => [TH[p.key], p.name]));

/** A stored modality as the member reads it: "Running" → "วิ่ง" in Thai; anything else unchanged. */
export function modalityName(stored: string, locale: Locale): string {
  if (locale !== "th") return stored;
  const key = byName.get(stored.trim().toLowerCase());
  return key ? TH[key] : stored;
}

/** What the member typed, back to the stored name: "วิ่ง" → "Running"; anything else unchanged. */
export function modalityStored(typed: string): string {
  return byThai.get(typed.trim()) ?? typed;
}
