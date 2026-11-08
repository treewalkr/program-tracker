import type { ImportMatch } from "./import";

/**
 * Exercise matching for paste import (docs/paste-import-plan.md §3):
 * alias (personal, then global) → exact catalog name → fuzzy → new.
 * Pure, so the API and the web's mock adapter match the same way.
 */

/** Gym shorthand expanded before fuzzy matching. Version 1.1 replaces this with the glossary. */
export const IMPORT_ABBREVIATIONS: Record<string, string> = {
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
export function expandAbbreviations(s: string): string {
  return normalizeAlias(s)
    .split(" ")
    .map((w) => IMPORT_ABBREVIATIONS[w] ?? w)
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

/** 0…1: token overlap (typo-tolerant Dice) blended with whole-string edit similarity. */
export function nameSimilarity(query: string, candidate: string): number {
  const q = expandAbbreviations(query);
  const c = expandAbbreviations(candidate);
  if (!q || !c) return 0;
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
  const dice = (2 * matched) / (qt.length + ct.length);
  const str = 1 - editDistance(q, c) / Math.max(q.length, c.length);
  return Math.round((0.7 * dice + 0.3 * str) * 1000) / 1000;
}

export const FUZZY_MIN_SCORE = 0.5;

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
): ImportMatch {
  const byId = new Map(catalog.map((c) => [c.id, c]));

  // 1. alias — a personal one overrides a global one
  const key = normalizeAlias(ex.sourceName);
  const hits = aliases.filter((a) => a.alias === key && byId.has(a.exerciseId));
  const alias = hits.find((a) => a.trainerId !== null) ?? hits[0];
  if (alias) return { kind: "alias", exerciseId: alias.exerciseId, exerciseName: byId.get(alias.exerciseId)!.name };

  // 2. exact catalog name (case-insensitive, like the draft flow's resolveRef): name, then as written
  for (const n of [ex.name, ex.sourceName]) {
    const hit = catalog.find((c) => c.name.toLowerCase() === n.trim().toLowerCase());
    if (hit) return { kind: "exact", exerciseId: hit.id, exerciseName: hit.name };
  }

  // 3. fuzzy — shorthand expanded, typo-tolerant; the top 3 are offered
  const ranked = catalog
    .map((c) => ({
      exerciseId: c.id,
      name: c.name,
      score: Math.max(nameSimilarity(ex.sourceName, c.name), nameSimilarity(ex.name, c.name)),
    }))
    .filter((c) => c.score >= FUZZY_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3);
  if (ranked.length > 0) {
    return { kind: "fuzzy", exerciseId: ranked[0].exerciseId, exerciseName: ranked[0].name, candidates: ranked };
  }

  // 4. new custom exercise, named as the LLM expanded it
  return { kind: "new", exerciseName: ex.name.trim() };
}
