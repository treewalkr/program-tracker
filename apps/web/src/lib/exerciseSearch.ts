import { MOVEMENT_PATTERN_INFO, MOVEMENT_PATTERNS, type MovementPattern } from "@pt/shared";
import type { ExerciseDto } from "./api/types";

/** Pure search for the exercise picker: every query word must hit; name hits rank first. */

type Searchable = Pick<
  ExerciseDto,
  "id" | "name" | "primaryMuscleGroup" | "secondaryMuscleGroups" | "equipment" | "movementPattern"
>;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .trim();

export const patternName = (p: string | null): string =>
  (p && MOVEMENT_PATTERN_INFO[p as MovementPattern]?.name) || "No pattern";

/** One-line context under a name: "Quads · barbell · Knee dominant". */
export function exerciseMeta(e: Searchable): string {
  const muscle = e.primaryMuscleGroup ? e.primaryMuscleGroup[0].toUpperCase() + e.primaryMuscleGroup.slice(1) : "";
  return [muscle, e.equipment, e.movementPattern ? patternName(e.movementPattern) : ""].filter(Boolean).join(" · ");
}

/** 0 best → 3 worst; null = no match. */
function score(e: Searchable, words: string[], whole: string): number | null {
  const name = norm(e.name);
  const rest = norm(
    [e.primaryMuscleGroup, ...e.secondaryMuscleGroups, e.equipment, e.movementPattern ?? "", patternName(e.movementPattern)].join(" ")
  );
  if (!words.every((w) => name.includes(w) || rest.includes(w))) return null;
  if (name.startsWith(whole)) return 0;
  const nameWords = name.split(/\s+/);
  if (words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 1;
  if (words.every((w) => name.includes(w))) return 2;
  return 3;
}

export function searchExercises<T extends Searchable>(list: readonly T[], query: string): T[] {
  const whole = norm(query);
  if (!whole) return [...list].sort((a, b) => a.name.localeCompare(b.name));
  const words = whole.split(/\s+/);
  return list
    .map((e) => ({ e, s: score(e, words, whole) }))
    .filter((x): x is { e: T; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
    .map((x) => x.e);
}

/** Browse view: grouped by movement pattern in taxonomy order, unpatterned last. */
export function groupByPattern<T extends Searchable>(list: readonly T[]): { label: string; items: T[] }[] {
  const order = (p: string | null) => {
    const i = MOVEMENT_PATTERNS.indexOf(p as MovementPattern);
    return i === -1 ? MOVEMENT_PATTERNS.length : i;
  };
  const groups = new Map<number, T[]>();
  for (const e of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    const k = order(e.movementPattern);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => ({ label: patternName(items[0].movementPattern), items }));
}

const EQUIPMENT_WORDS: [RegExp, string][] = [
  [/\bbarbell|\bbb\b/, "barbell"],
  [/\bdumbbells?\b|\bdb\b/, "dumbbell"],
  [/\bkettlebells?\b|\bkb\b/, "kettlebell"],
  [/\bcable\b/, "cable"],
  [/\bmachine\b|\bsmith\b/, "machine"],
  [/\bband(ed)?\b/, "band"],
  [/\bplate loaded\b|\blandmine\b/, "plate_loaded"],
  [/\bbodyweight\b|\bpush ?ups?\b|\bpull ?ups?\b|\bchin ?ups?\b|\bdips?\b/, "bodyweight"],
];

/**
 * Prefill for a new exercise named `name`: equipment from a keyword in the name,
 * muscle and pattern copied from the catalog exercise sharing the most name words.
 */
export function guessExercise(
  name: string,
  catalog: readonly Searchable[]
): { primaryMuscleGroup: string; equipment: string; movementPattern: string | null } {
  const n = norm(name);
  const equipment = EQUIPMENT_WORDS.find(([re]) => re.test(n))?.[1] ?? "";
  const words = new Set(n.split(/\s+/).filter((w) => w.length > 2));
  let best: Searchable | null = null;
  let bestHits = 0;
  for (const e of catalog) {
    const hits = norm(e.name).split(/\s+/).filter((w) => words.has(w)).length;
    if (hits > bestHits) [best, bestHits] = [e, hits];
  }
  return {
    primaryMuscleGroup: best?.primaryMuscleGroup ?? "",
    equipment: equipment || best?.equipment || "",
    movementPattern: best?.movementPattern ?? null,
  };
}
