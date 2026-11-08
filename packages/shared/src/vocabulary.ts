import { z } from "zod";
import { normalizeAlias, type AbbreviationMap } from "./importMatch";

/**
 * Vocabulary (paste import v1.1): the trainer's glossary — shorthand,
 * techniques and equipment words — plus aliases, which live in
 * exercise_aliases. A null-trainer row is global (seeded); a personal term
 * with the same lower(term) overrides it.
 */

export const GLOSSARY_KINDS = ["abbreviation", "technique", "equipment", "other"] as const;
export type GlossaryKind = (typeof GLOSSARY_KINDS)[number];

export const GLOSSARY_KIND_LABELS: Record<GlossaryKind, string> = {
  abbreviation: "Abbreviation",
  technique: "Technique",
  equipment: "Equipment",
  other: "Other",
};

export const GLOSSARY_TERM_MAX = 60;
export const GLOSSARY_MEANING_MAX = 200;
/** How many glossary terms the import prompt carries, personal first. */
export const GLOSSARY_PROMPT_LIMIT = 200;

export type VocabularyScope = "personal" | "global";

export const GlossaryTermInput = z.object({
  term: z.string().trim().min(1).max(GLOSSARY_TERM_MAX),
  meaning: z.string().trim().min(1).max(GLOSSARY_MEANING_MAX),
  kind: z.enum(GLOSSARY_KINDS),
});
export type GlossaryTermInput = z.infer<typeof GlossaryTermInput>;

export interface GlossaryTerm {
  id: string;
  /** As written ("CARs"); matched case-insensitively. */
  term: string;
  meaning: string;
  kind: GlossaryKind;
  scope: VocabularyScope;
}

export interface VocabularyAlias {
  id: string;
  /** Normalized (normalizeAlias). */
  alias: string;
  exerciseId: string;
  exerciseName: string;
  source: string;
  scope: VocabularyScope;
}

/** A glossary row as stored: trainerId null = global. */
export interface GlossaryRowLike {
  id: string;
  trainerId: string | null;
  term: string;
  meaning: string;
  kind: GlossaryKind;
}

export const glossaryKey = (term: string) => term.trim().toLowerCase();

/**
 * The effective glossary: personal terms, then the global ones the trainer
 * hasn't overridden (same lower(term)). Each group sorted by term.
 */
export function mergeGlossary(rows: GlossaryRowLike[]): GlossaryTerm[] {
  const byTerm = (a: GlossaryRowLike, b: GlossaryRowLike) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" });
  const personal = rows.filter((r) => r.trainerId !== null).sort(byTerm);
  const mine = new Set(personal.map((r) => glossaryKey(r.term)));
  const global = rows.filter((r) => r.trainerId === null && !mine.has(glossaryKey(r.term))).sort(byTerm);
  const out = (r: GlossaryRowLike, scope: VocabularyScope): GlossaryTerm => ({ id: r.id, term: r.term, meaning: r.meaning, kind: r.kind, scope });
  return [...personal.map((r) => out(r, "personal")), ...global.map((r) => out(r, "global"))];
}

/**
 * Abbreviation-kind terms → the matcher's word map (term lowercased →
 * normalized meaning). Multi-word terms can't match a single word and are left out.
 */
export function glossaryAbbreviations(terms: Pick<GlossaryTerm, "term" | "meaning" | "kind">[]): AbbreviationMap {
  const map: AbbreviationMap = {};
  for (const t of terms) {
    if (t.kind !== "abbreviation") continue;
    const key = normalizeAlias(t.term);
    const meaning = normalizeAlias(t.meaning);
    if (!key || key.includes(" ") || !meaning || Object.hasOwn(map, key)) continue;
    map[key] = meaning;
  }
  return map;
}

/** The global glossary seed (migration 0041) — the default for the mock and tests. */
export const DEFAULT_GLOSSARY: Pick<GlossaryTerm, "term" | "meaning" | "kind">[] = [
  { term: "BB", meaning: "barbell", kind: "abbreviation" },
  { term: "DB", meaning: "dumbbell", kind: "abbreviation" },
  { term: "KB", meaning: "kettlebell", kind: "abbreviation" },
  { term: "SA", meaning: "single arm", kind: "abbreviation" },
  { term: "SL", meaning: "single leg", kind: "abbreviation" },
  { term: "OVH", meaning: "overhead", kind: "abbreviation" },
  { term: "OH", meaning: "overhead", kind: "abbreviation" },
  { term: "RDL", meaning: "romanian deadlift", kind: "abbreviation" },
  { term: "OHP", meaning: "overhead press", kind: "abbreviation" },
  { term: "BW", meaning: "bodyweight", kind: "abbreviation" },
  { term: "Ext", meaning: "extension", kind: "abbreviation" },
  { term: "CARs", meaning: "controlled articular rotations", kind: "technique" },
  { term: "PAILs/RAILs", meaning: "progressive/regressive angular isometric loading", kind: "technique" },
  { term: "AMRAP", meaning: "as many reps as possible", kind: "technique" },
  { term: "EMOM", meaning: "every minute on the minute", kind: "technique" },
  { term: "RPE", meaning: "rate of perceived exertion, 1–10", kind: "technique" },
  { term: "RIR", meaning: "reps in reserve", kind: "technique" },
];

// ---------------------------------------------------------------------------
// New words met in an import
// ---------------------------------------------------------------------------

export const ImportNewTerm = z.object({
  term: z.string().trim().min(1).max(GLOSSARY_TERM_MAX),
  line: z.number().int().min(1),
  meaning: z
    .string()
    .max(GLOSSARY_MEANING_MAX)
    .nullish()
    .transform((v) => v?.trim() || null),
});
export type ImportNewTerm = z.infer<typeof ImportNewTerm>;

/**
 * The LLM's new words, kept only when worth asking about: not already in the
 * glossary (case-insensitive), not a repeat across chunks, and written in
 * the line it cites.
 */
export function filterNewTerms(terms: ImportNewTerm[], lines: string[], glossary: Pick<GlossaryTerm, "term">[] = []): ImportNewTerm[] {
  const seen = new Set(glossary.map((g) => glossaryKey(g.term)));
  const out: ImportNewTerm[] = [];
  for (const t of terms) {
    const key = glossaryKey(t.term);
    if (!key || seen.has(key)) continue;
    if (!(lines[t.line - 1] ?? "").toLowerCase().includes(key)) continue;
    seen.add(key);
    out.push({ term: t.term.trim(), line: t.line, meaning: t.meaning });
  }
  return out;
}
