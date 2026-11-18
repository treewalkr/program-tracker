import type { SessionKind } from "./domain";
import { normalizeKind } from "./sessionKind";

/**
 * Session types label a session over the two fixed formats in `SESSION_KINDS`.
 * The format decides what a session holds — exercises + sets ("exercises") or a
 * cardio prescription — so it stays in code.
 *
 * Two kinds of type share one table:
 * - **presets**: the fixed two-level taxonomy below (main type → sub-types).
 *   Every trainer has them; names and formats are locked, they can only be
 *   archived and restored. A row carries its `presetKey`.
 * - **custom**: trainer-named, no sub-types, exercises or cardio; fully editable.
 */

/** A type's format. "any" (Metabolic) fits an exercises or a cardio session; the session decides. */
export type SessionTypeFormat = SessionKind | "any";

export interface SessionTypeLike {
  id: string;
  name: string;
  format: SessionTypeFormat;
  /** Set on preset rows (`SESSION_TYPE_PRESETS`); null/absent = a custom type. */
  presetKey?: string | null;
  archivedAt?: string | Date | null;
}

export const SESSION_TYPE_NAME_MAX = 40;

export interface SessionTypeMain {
  key: string;
  name: string;
  format: SessionTypeFormat;
  subs: readonly { key: string; name: string }[];
}

/** The fixed taxonomy, in display order. Sub-types share their main type's format. */
export const SESSION_TYPE_TAXONOMY: readonly SessionTypeMain[] = [
  {
    key: "cardiovascular",
    name: "Cardiovascular",
    format: "cardio",
    subs: [
      { key: "cardiovascular.aerobic-base", name: "Aerobic base" },
      { key: "cardiovascular.anaerobic-endurance", name: "Anaerobic endurance" },
      { key: "cardiovascular.anaerobic-power", name: "Anaerobic power" },
    ],
  },
  {
    key: "strength-training",
    name: "Strength training",
    format: "exercises",
    subs: [
      { key: "strength-training.stability-mobility", name: "Stability & mobility" },
      { key: "strength-training.functional-movement", name: "Functional movement" },
      { key: "strength-training.loaded-strength", name: "Loaded strength" },
      { key: "strength-training.performance", name: "Performance" },
    ],
  },
  {
    key: "metabolic",
    name: "Metabolic",
    format: "any",
    subs: [
      { key: "metabolic.circuit", name: "Circuit" },
      { key: "metabolic.amrap", name: "AMRAP" },
    ],
  },
];

export interface SessionTypePreset {
  key: string;
  name: string;
  format: SessionTypeFormat;
  /** The main type's key; null for a main type. */
  parent: string | null;
}

/** The taxonomy flattened: each main type followed by its sub-types. Seeded for every trainer. */
export const SESSION_TYPE_PRESETS: readonly SessionTypePreset[] = SESSION_TYPE_TAXONOMY.flatMap((m) => [
  { key: m.key, name: m.name, format: m.format, parent: null },
  ...m.subs.map((s) => ({ key: s.key, name: s.name, format: m.format, parent: m.key })),
]);

const PRESET_BY_KEY = new Map(SESSION_TYPE_PRESETS.map((p) => [p.key, p]));

export const isPresetKey = (key: string | null | undefined): key is string => !!key && PRESET_BY_KEY.has(key);

export const presetByKey = (key: string | null | undefined): SessionTypePreset | null => (key && PRESET_BY_KEY.get(key)) || null;

/** The main type a sub-type belongs to; null for a main type or an unknown key. */
export const presetParent = (key: string | null | undefined): SessionTypePreset | null => presetByKey(presetByKey(key)?.parent);

/** "Main › Sub" for a sub-type, the plain name otherwise. */
export function sessionTypePath(t: Pick<SessionTypeLike, "name" | "presetKey">): string {
  const parent = presetParent(t.presetKey);
  return parent ? `${parent.name} › ${t.name}` : t.name;
}

/** A type can label a session of this kind: same format, or "any". Both sides read through the kind alias. */
export const typeFitsKind = (format: SessionTypeFormat, kind: SessionKind): boolean => {
  const f = normalizeKind(format);
  return f === "any" || f === normalizeKind(kind);
};

/** The kind a session takes when given this type: the type's format, or the session's own for "any". Read through the kind alias. */
export const kindForType = (format: SessionTypeFormat, current: SessionKind): SessionKind => {
  const f = normalizeKind(format);
  return f === "any" ? normalizeKind(current) : f;
};

export interface SessionTypeGroup<T> {
  main: SessionTypeMain;
  /** The main type's own row; null when it isn't in the list (archived, filtered out). */
  row: T | null;
  subs: T[];
}

/**
 * Types grouped by the taxonomy (main types in order, each with its sub-types in
 * order), then everything else as custom in list order. Groups with no rows are
 * dropped.
 */
export function groupSessionTypes<T extends SessionTypeLike>(types: readonly T[]): { groups: SessionTypeGroup<T>[]; custom: T[] } {
  const byKey = new Map<string, T>();
  for (const t of types) if (isPresetKey(t.presetKey) && !byKey.has(t.presetKey)) byKey.set(t.presetKey, t);
  const groups = SESSION_TYPE_TAXONOMY.map((main) => ({
    main,
    row: byKey.get(main.key) ?? null,
    subs: main.subs.flatMap((s) => byKey.get(s.key) ?? []),
  })).filter((g) => g.row || g.subs.length > 0);
  const custom = types.filter((t) => !isPresetKey(t.presetKey));
  return { groups, custom };
}

/** Trim + collapse inner whitespace — the form names are stored and compared in. */
export const normalizeTypeName = (name: string): string => name.trim().replace(/\s+/g, " ");

/** Case-insensitive exact match on a type name; archived types still resolve. */
export function findSessionType<T extends SessionTypeLike>(types: readonly T[], name: string | null | undefined): T | null {
  if (!name) return null;
  const key = normalizeTypeName(name).toLowerCase();
  return types.find((t) => t.name.toLowerCase() === key) ?? null;
}
