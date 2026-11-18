import { sessionTypePath, type SessionTypeFormat } from "@pt/shared";
import type { SessionTypeDto } from "$lib/api/types";

/** What a session of this format records, as trainers read it. Presets show no format; their name says it. */
export const FORMAT_LABEL: Record<SessionTypeFormat, string> = { exercises: "Exercises", cardio: "Cardio", any: "Exercises or cardio" };
/** One line under each choice when a custom type picks its format. */
export const FORMAT_HINT: Record<SessionTypeFormat, string> = {
  exercises: "Exercises with sets and reps",
  cardio: "Time, heart-rate zone and distance",
  any: "The session decides",
};

type Searchable = Pick<SessionTypeDto, "name" | "format" | "presetKey">;

/**
 * Types whose path ("Main › Sub"), name or format matches every word of the
 * query: name-prefix matches first, then a match inside the name, then a match
 * on the main type or format only; alphabetical within each. Empty query =
 * everything, in list order.
 */
export function searchSessionTypes<T extends Searchable>(types: readonly T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...types];
  const hay = (t: T) => `${sessionTypePath(t)} ${FORMAT_LABEL[t.format]}`.toLowerCase();
  const q = words.join(" ");
  const rank = (name: string) => (name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2);
  return types
    .filter((t) => words.every((w) => hay(t).includes(w)))
    .map((t) => ({ t, rank: rank(t.name.toLowerCase()) }))
    .sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name))
    .map((x) => x.t);
}
