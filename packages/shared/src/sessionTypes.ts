import type { SessionKind } from "./domain";

/**
 * Session types are trainer-owned labels ("Mobility", "Intervals", …) over
 * the two fixed formats in `SESSION_KINDS`. The format decides what a session
 * holds — exercises + sets (lifting) or a cardio prescription — so it stays
 * in code; the label is data the trainer adds, renames and archives.
 */
export interface SessionTypeLike {
  id: string;
  name: string;
  format: SessionKind;
  archivedAt?: string | Date | null;
}

export const SESSION_TYPE_NAME_MAX = 40;

/** Every trainer starts with these; all editable and archivable. */
export const SESSION_TYPE_DEFAULTS: readonly { name: string; format: SessionKind }[] = [
  { name: "Strength", format: "lifting" },
  { name: "Hypertrophy", format: "lifting" },
  { name: "Mobility", format: "lifting" },
  { name: "Circuit", format: "lifting" },
  { name: "Intervals", format: "cardio" },
  { name: "Zone 2", format: "cardio" },
];

/** Trim + collapse inner whitespace — the form names are stored and compared in. */
export const normalizeTypeName = (name: string): string => name.trim().replace(/\s+/g, " ");

/** Case-insensitive exact match on a type name; archived types still resolve. */
export function findSessionType<T extends SessionTypeLike>(types: readonly T[], name: string | null | undefined): T | null {
  if (!name) return null;
  const key = normalizeTypeName(name).toLowerCase();
  return types.find((t) => t.name.toLowerCase() === key) ?? null;
}
