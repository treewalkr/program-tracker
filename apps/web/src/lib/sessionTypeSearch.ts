import type { SessionKind } from "@pt/shared";
import type { SessionTypeDto } from "$lib/api/types";

export const FORMAT_LABEL: Record<SessionKind, string> = { lifting: "Lifting", cardio: "Cardio" };
export const FORMAT_HINT: Record<SessionKind, string> = {
  lifting: "exercises and sets",
  cardio: "time, zone and distance",
};

/**
 * Types whose name or format matches every word of the query, name-prefix
 * matches first, then alphabetical. Empty query = everything, in list order.
 */
export function searchSessionTypes<T extends Pick<SessionTypeDto, "name" | "format">>(types: readonly T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...types];
  const hay = (t: T) => `${t.name} ${FORMAT_LABEL[t.format]}`.toLowerCase();
  const q = words.join(" ");
  return types
    .filter((t) => words.every((w) => hay(t).includes(w)))
    .map((t) => ({ t, rank: t.name.toLowerCase().startsWith(q) ? 0 : t.name.toLowerCase().includes(q) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name))
    .map((x) => x.t);
}

/** Lifting group first, then cardio; empty groups dropped. */
export function groupByFormat<T extends Pick<SessionTypeDto, "format">>(types: readonly T[]): { format: SessionKind; items: T[] }[] {
  return (["lifting", "cardio"] as const)
    .map((format) => ({ format, items: types.filter((t) => t.format === format) }))
    .filter((g) => g.items.length > 0);
}
