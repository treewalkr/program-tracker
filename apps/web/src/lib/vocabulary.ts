import { GLOSSARY_KIND_LABELS, type GlossaryKind, type GlossaryTermInput, type ImportNewTerm, type RoleLabel } from "@pt/shared";
import type { AliasDto, AliasInput, GlossaryTermDto } from "./api/types";

/**
 * The Vocabulary page (/vocabulary) and the import's "New words" panel: pure
 * helpers, so the filtering, override and ordering logic is unit-tested.
 */

// —— tabs ————————————————————————————————————————————————————————————————

export const VOCAB_TABS = [
  { id: "aliases", label: "Aliases" },
  { id: "glossary", label: "Glossary" },
  { id: "roles", label: "Role labels" },
] as const;
export type VocabTab = (typeof VOCAB_TABS)[number]["id"];

/** ?tab= → a known tab; anything else is Aliases. */
export const parseVocabTab = (v: string | null | undefined): VocabTab =>
  VOCAB_TABS.some((t) => t.id === v) ? (v as VocabTab) : "aliases";

// —— search ——————————————————————————————————————————————————————————————

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
/** Every word of the query appears in one of the fields. */
const matchesAll = (q: string, fields: string[]) => {
  const hay = fields.join(" ").toLowerCase();
  return words(q).every((w) => hay.includes(w));
};

/** By what was written or the exercise it points at. */
export const searchAliases = (list: readonly AliasDto[], query: string): AliasDto[] =>
  list.filter((a) => matchesAll(query, [a.alias, a.exerciseName]));

/** By term, meaning or kind. */
export const searchGlossary = (list: readonly GlossaryTermDto[], query: string): GlossaryTermDto[] =>
  list.filter((g) => matchesAll(query, [g.term, g.meaning, GLOSSARY_KIND_LABELS[g.kind]]));

// —— override: a personal copy of a global row ——————————————————————————————

/** A personal alias with the same words — matched before the global one. */
export const aliasOverride = (a: AliasDto, exerciseId = a.exerciseId): AliasInput => ({ alias: a.alias, exerciseId, source: "manual" });

/** A personal term with the same text — it hides the global one. */
export const termOverride = (g: GlossaryTermDto): GlossaryTermInput => ({ term: g.term, meaning: g.meaning, kind: g.kind });

/** The trainer's own alias for these words, once saved. */
export const personalAliasFor = (list: readonly AliasDto[], alias: string): AliasDto | undefined =>
  list.find((a) => a.scope === "personal" && a.alias === alias);

/** Personal aliases whose words a global one also has — the global row is overridden. */
export function overriddenAliases(list: readonly AliasDto[]): Set<string> {
  const mine = new Set(list.filter((a) => a.scope === "personal").map((a) => a.alias));
  return new Set(list.filter((a) => a.scope === "global" && mine.has(a.alias)).map((a) => a.id));
}

// —— role labels ————————————————————————————————————————————————————————————

/** Active labels by rank, then the archived ones. */
export function labelsInOrder(labels: readonly RoleLabel[]): { active: RoleLabel[]; archived: RoleLabel[] } {
  const byRank = [...labels].sort((a, b) => a.rank - b.rank);
  return { active: byRank.filter((l) => !l.archived), archived: byRank.filter((l) => l.archived) };
}

/**
 * The rank that puts `key` right after `after` ("" = first) among the other
 * active labels; null when that is where it already sits.
 */
export function rankToMove(labels: readonly RoleLabel[], key: string, after: string): number | null {
  const { active } = labelsInOrder(labels);
  const at = active.findIndex((l) => l.key === key);
  const before = at > 0 ? active[at - 1].key : "";
  if (at >= 0 && before === after) return null;
  const others = active.filter((l) => l.key !== key);
  if (others.length === 0) return null;
  if (!after) return others[0].rank - 100;
  const i = others.findIndex((l) => l.key === after);
  if (i === -1 || i === others.length - 1) return others[others.length - 1].rank + 100;
  return (others[i].rank + others[i + 1].rank) / 2;
}

/** The label right before `key` ("" when first). */
export function labelBefore(labels: readonly RoleLabel[], key: string): string {
  const { active } = labelsInOrder(labels);
  const at = active.findIndex((l) => l.key === key);
  return at > 0 ? active[at - 1].key : "";
}

// —— new words from an import ———————————————————————————————————————————————

export interface NewWordRow {
  term: string;
  line: number;
  /** The suggested meaning, editable; "" when the model wasn't sure. */
  meaning: string;
  /** The read suggested a meaning (labelled "suggested"). */
  suggested: boolean;
  kind: GlossaryKind;
  status: "open" | "saving" | "added" | "dismissed";
  error?: string;
}

/** Short all-caps shorthand ("LPD", "KBs") reads as an abbreviation; anything else as a technique. */
export const guessKind = (term: string): GlossaryKind => (/^[A-Z]{2,5}s?$/.test(term.trim()) ? "abbreviation" : "technique");

export const newWordRows = (terms: readonly ImportNewTerm[] | undefined): NewWordRow[] =>
  (terms ?? []).map((t) => ({
    term: t.term,
    line: t.line,
    meaning: t.meaning ?? "",
    suggested: !!t.meaning,
    kind: guessKind(t.term),
    status: "open",
  }));

/** Rows still on screen — dismissed ones hide for this import only. */
export const shownNewWords = (rows: readonly NewWordRow[]): NewWordRow[] => rows.filter((r) => r.status !== "dismissed");

/** The glossary term "Add" saves, or null while the meaning is empty. */
export function newWordInput(row: NewWordRow): GlossaryTermInput | null {
  const term = row.term.trim();
  const meaning = row.meaning.trim().replace(/\s+/g, " ");
  return term && meaning ? { term, meaning, kind: row.kind } : null;
}
