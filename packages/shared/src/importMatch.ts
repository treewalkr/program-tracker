import type { ImportMatch } from "./import";

/**
 * Exercise matching for paste import (docs/paste-import-plan.md §3):
 * personal alias → exact catalog name → global alias → fuzzy → new, so a
 * global alias never beats the trainer's own exercise. Pure, so the API and
 * the web's mock adapter match the same way.
 */

/** Lowercase word → its expansion, normalized (normalizeAlias). */
export type AbbreviationMap = Record<string, string>;

/**
 * Default gym shorthand — the global glossary seed's abbreviations. The API
 * passes the trainer's effective glossary instead (glossaryAbbreviations);
 * this stays as the fallback for tests, the mock and the eval.
 */
export const IMPORT_ABBREVIATIONS: AbbreviationMap = {
  bb: "barbell",
  db: "dumbbell",
  kb: "kettlebell",
  sa: "single arm",
  sl: "single leg",
  ovh: "overhead",
  oh: "overhead",
  rdl: "romanian deadlift",
  ohp: "overhead press",
  bw: "bodyweight",
  ext: "extension",
};

/** Alias key: lowercase, trimmed, punctuation removed, single spaces. */
export function normalizeAlias(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** normalizeAlias, then shorthand expanded word by word. */
export function expandAbbreviations(s: string, abbreviations: AbbreviationMap = IMPORT_ABBREVIATIONS): string {
  return normalizeAlias(s)
    .split(" ")
    .map((w) => (Object.hasOwn(abbreviations, w) ? abbreviations[w] : w))
    .join(" ");
}

/** Optimal string alignment distance — a swapped pair ("bicpes") costs 1. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const tokenMatch = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= 1);

export interface NameMatchParts {
  /** Share of the query's tokens the candidate has (typo-tolerant). */
  coverage: number;
  /** Share of the candidate's tokens that are the query's. */
  precision: number;
  /** Whole-string edit similarity. */
  str: number;
}

/** The parts nameSimilarity weighs; null when either name is blank. */
export function nameMatchParts(query: string, candidate: string, abbreviations: AbbreviationMap = IMPORT_ABBREVIATIONS): NameMatchParts | null {
  const q = expandAbbreviations(query, abbreviations);
  const c = expandAbbreviations(candidate, abbreviations);
  if (!q || !c) return null;
  const qt = q.split(" ");
  const ct = c.split(" ");
  const left = [...ct];
  let matched = 0;
  for (const t of qt) {
    const i = left.findIndex((u) => tokenMatch(t, u));
    if (i >= 0) {
      matched++;
      left.splice(i, 1);
    }
  }
  return { coverage: matched / qt.length, precision: matched / ct.length, str: 1 - editDistance(q, c) / Math.max(q.length, c.length) };
}

const score = (p: NameMatchParts | null) => (p ? Math.round((0.5 * p.coverage + 0.3 * p.precision + 0.2 * p.str) * 1000) / 1000 : 0);

/**
 * 0…1: how much of the query the candidate covers (typo-tolerant tokens),
 * how much of the candidate is the query, and whole-string edit similarity.
 * Coverage weighs most: "Push press" must not land on "Bench Press".
 */
export function nameSimilarity(query: string, candidate: string, abbreviations: AbbreviationMap = IMPORT_ABBREVIATIONS): number {
  return score(nameMatchParts(query, candidate, abbreviations));
}

/** Fuzzy candidates at or above this are offered. */
export const FUZZY_MIN_SCORE = 0.6;
/** A fuzzy match is picked for the trainer only at or above this, with every written word covered. */
export const FUZZY_AUTO_SCORE = 0.85;

export interface MatchCatalogEntry {
  id: string;
  name: string;
}

export interface MatchAlias {
  /** Normalized (normalizeAlias). */
  alias: string;
  exerciseId: string;
  /** null = global. */
  trainerId: string | null;
}

export function matchExercise(
  ex: { sourceName: string; name: string },
  catalog: MatchCatalogEntry[],
  aliases: MatchAlias[] = [],
  abbreviations: AbbreviationMap = IMPORT_ABBREVIATIONS,
): ImportMatch {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const key = normalizeAlias(ex.sourceName);
  const aliasHit = (personal: boolean) =>
    aliases.find((a) => a.alias === key && (a.trainerId !== null) === personal && byId.has(a.exerciseId));
  const viaAlias = (a: MatchAlias): ImportMatch => ({ kind: "alias", exerciseId: a.exerciseId, exerciseName: byId.get(a.exerciseId)!.name });

  // 1. the trainer's own alias
  const personal = aliasHit(true);
  if (personal) return viaAlias(personal);

  // 2. exact catalog name (case-insensitive, like the draft flow's resolveRef): name, then as written
  for (const n of [ex.name, ex.sourceName]) {
    const hit = catalog.find((c) => c.name.toLowerCase() === n.trim().toLowerCase());
    if (hit) return { kind: "exact", exerciseId: hit.id, exerciseName: hit.name };
  }
  // …and the same name up to case, punctuation and gym shorthand ("Pull up" = "Pull-Up", "BB Row" = "Barbell Row")
  for (const n of [ex.name, ex.sourceName]) {
    const key = expandAbbreviations(n, abbreviations);
    const hit = key ? catalog.find((c) => expandAbbreviations(c.name, abbreviations) === key) : undefined;
    if (hit) return { kind: "exact", exerciseId: hit.id, exerciseName: hit.name };
  }

  // 3. a global (seed) alias — after exact names, so it never beats the trainer's own exercise
  const global = aliasHit(false);
  if (global) return viaAlias(global);

  // 4. fuzzy — shorthand expanded, typo-tolerant; the top 3 are offered. Only a strong match that
  //    covers every written word is picked ("Single leg throwball" ≠ "Single-Leg Hop"); else the
  //    trainer chooses, and it stays a new exercise until they do.
  const ranked = catalog
    .map((c) => {
      const parts = [ex.sourceName, ex.name].map((n) => nameMatchParts(n, c.name, abbreviations));
      return {
        exerciseId: c.id,
        name: c.name,
        score: Math.max(...parts.map(score)),
        sure: parts.some((p) => p !== null && p.coverage === 1 && score(p) >= FUZZY_AUTO_SCORE),
      };
    })
    .filter((c) => c.score >= FUZZY_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3);
  if (ranked.length > 0) {
    const candidates = ranked.map(({ exerciseId, name, score }) => ({ exerciseId, name, score }));
    const top = ranked[0];
    return top.sure
      ? { kind: "fuzzy", exerciseId: top.exerciseId, exerciseName: top.name, candidates }
      : { kind: "fuzzy", exerciseName: ex.name.trim(), candidates };
  }

  // 5. new custom exercise, named as the LLM expanded it
  return { kind: "new", exerciseName: ex.name.trim() };
}
