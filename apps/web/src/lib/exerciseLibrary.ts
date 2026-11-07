import {
  EQUIPMENT,
  FUNCTIONAL_MOVEMENT_INFO,
  FUNCTIONAL_MOVEMENTS,
  MOVEMENT_PATTERN_INFO,
  MOVEMENT_PATTERNS,
  MUSCLE_GROUPS,
  type MovementPattern,
} from "@pt/shared";
import type { ExerciseDto } from "./api/types";

/** "full_body" → "Full body". */
export const humanize = (key: string) => {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const MUSCLE_OPTIONS = MUSCLE_GROUPS.map((k) => ({ key: k, label: humanize(k) }));
export const EQUIPMENT_OPTIONS = EQUIPMENT.map((k) => ({ key: k, label: humanize(k) }));
export const PATTERN_OPTIONS = MOVEMENT_PATTERNS.map((k) => ({ key: k, label: MOVEMENT_PATTERN_INFO[k].name }));
export const FUNCTIONAL_OPTIONS = FUNCTIONAL_MOVEMENTS.map((k) => ({ key: k, label: FUNCTIONAL_MOVEMENT_INFO[k].label }));

export const patternName = (k: string | null) =>
  k && k in MOVEMENT_PATTERN_INFO ? MOVEMENT_PATTERN_INFO[k as MovementPattern].name : "Untagged";
export const patternShort = (k: string) =>
  k in MOVEMENT_PATTERN_INFO ? MOVEMENT_PATTERN_INFO[k as MovementPattern].label : humanize(k);
export const functionalName = (k: string | null) =>
  k && k in FUNCTIONAL_MOVEMENT_INFO ? FUNCTIONAL_MOVEMENT_INFO[k as keyof typeof FUNCTIONAL_MOVEMENT_INFO].label : "Untagged";

/** Map row groups: Upper (push/pull), Lower (knee/hip), Core. */
export const PATTERN_GROUPS: { label: string; patterns: MovementPattern[] }[] = [
  { label: "Upper", patterns: MOVEMENT_PATTERNS.filter((p) => /push|pull/.test(p)) },
  { label: "Lower", patterns: MOVEMENT_PATTERNS.filter((p) => p === "knee_dominant" || p === "hip_dominant") },
  { label: "Core", patterns: MOVEMENT_PATTERNS.filter((p) => MOVEMENT_PATTERN_INFO[p].core) },
];

/** The "untagged" filter value for the pattern axis. */
export const NONE = "none";

export type Tab = "all" | "mine" | "untagged" | "archived";
export type Sort = "name" | "uses" | "muscle";
export interface Filters {
  muscle: string[];
  pattern: string[]; // MovementPattern keys or NONE
  equipment: string[];
}
export const emptyFilters = (): Filters => ({ muscle: [], pattern: [], equipment: [] });

export const needsTagging = (e: ExerciseDto) => !e.movementPattern || !e.functionalMovement;

export function inTab(e: ExerciseDto, tab: Tab): boolean {
  if (tab === "archived") return e.archivedAt !== null;
  if (e.archivedAt !== null) return false;
  if (tab === "mine") return e.custom;
  if (tab === "untagged") return needsTagging(e);
  return true;
}

export function tabCounts(list: readonly ExerciseDto[]): Record<Tab, number> {
  const live = list.filter((e) => e.archivedAt === null);
  return {
    all: live.length,
    mine: live.filter((e) => e.custom).length,
    untagged: live.filter(needsTagging).length,
    archived: list.length - live.length,
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function visibleRows(
  list: readonly ExerciseDto[],
  o: { tab: Tab; q: string; filters: Filters; sort: Sort }
): ExerciseDto[] {
  const q = norm(o.q);
  const { muscle, pattern, equipment } = o.filters;
  const rows = list.filter(
    (e) =>
      inTab(e, o.tab) &&
      (!q || norm(e.name).includes(q)) &&
      (!muscle.length || muscle.includes(e.primaryMuscleGroup)) &&
      (!pattern.length || pattern.includes(e.movementPattern ?? NONE)) &&
      (!equipment.length || equipment.includes(e.equipment))
  );
  const byName = (a: ExerciseDto, b: ExerciseDto) => a.name.localeCompare(b.name);
  const cmp = {
    name: byName,
    uses: (a: ExerciseDto, b: ExerciseDto) => b.usedIn - a.usedIn || byName(a, b),
    muscle: (a: ExerciseDto, b: ExerciseDto) => a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup) || byName(a, b),
  }[o.sort];
  return rows.sort(cmp);
}

// ---------------------------------------------------------------------------
// Coverage map
// ---------------------------------------------------------------------------

export interface Coverage {
  /** `${pattern|NONE}|${equipment}` → count of live exercises. */
  cells: Map<string, number>;
  rowTotal: (p: string) => number;
  placed: number;
  live: number;
  /** Pattern × equipment cells with no live exercise. */
  gaps: number;
}

export function coverage(list: readonly ExerciseDto[]): Coverage {
  const live = list.filter((e) => e.archivedAt === null);
  const cells = new Map<string, number>();
  const rows = new Map<string, number>();
  for (const e of live) {
    const p = e.movementPattern ?? NONE;
    const k = `${p}|${e.equipment}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
    rows.set(p, (rows.get(p) ?? 0) + 1);
  }
  let gaps = 0;
  for (const p of MOVEMENT_PATTERNS) for (const q of EQUIPMENT) if (!cells.get(`${p}|${q}`)) gaps++;
  return {
    cells,
    rowTotal: (p) => rows.get(p) ?? 0,
    placed: live.filter((e) => e.movementPattern).length,
    live: live.length,
    gaps,
  };
}

/** Shade on the done ramp: z (none) · l1 (1) · l2 (2–3) · l3 (4+). */
export const coverageLevel = (n: number) => (n === 0 ? "z" : n === 1 ? "l1" : n <= 3 ? "l2" : "l3");

export interface MapScope {
  pattern?: string;
  equipment?: string;
}

/** The map cell the filters point at, or null when they don't map onto one. */
export function mapScope(f: Filters): MapScope | null {
  if (f.muscle.length || f.pattern.length > 1 || f.equipment.length > 1) return null;
  return { pattern: f.pattern[0], equipment: f.equipment[0] };
}

/** Clicking a cell replaces the muscle/pattern/equipment filters; clicking the active one clears them. */
export function pickCell(f: Filters, pattern?: string, equipment?: string): Filters {
  const cur = mapScope(f);
  if (cur && cur.pattern === pattern && cur.equipment === equipment) return emptyFilters();
  return { muscle: [], pattern: pattern ? [pattern] : [], equipment: equipment ? [equipment] : [] };
}

/** Pattern + equipment to prefill a new exercise from single-value filters. */
export function prefillFrom(f: Filters): { movementPattern: string | null; equipment: string } {
  const p = f.pattern.length === 1 && f.pattern[0] !== NONE ? f.pattern[0] : null;
  return { movementPattern: p, equipment: f.equipment.length === 1 ? f.equipment[0] : "" };
}

// ---------------------------------------------------------------------------
// Edit rules
// ---------------------------------------------------------------------------

export type RemoveKind = "hide" | "archive" | "delete";

/** Seed → hide; custom in a program → archive; unused custom → delete. */
export function removeAction(e: ExerciseDto): { kind: RemoveKind; label: string; why: string } {
  if (!e.custom)
    return { kind: "hide", label: "Hide from library", why: "Library entries can't be deleted. Hiding drops it from pickers and AI drafts; programs that use it keep it." };
  if (e.usedIn > 0)
    return {
      kind: "archive",
      label: "Archive",
      why: `Used in ${e.usedIn} program${e.usedIn === 1 ? "" : "s"}, so it can't be deleted. Archiving drops it from pickers and AI drafts; those programs and their logs keep it.`,
    };
  return { kind: "delete", label: "Delete", why: "Not used in any program. Deleting removes it for good." };
}

/** Library exercises whose names share most words with `name` (exact match first). */
export function similarNames(list: readonly ExerciseDto[], name: string, exceptId?: string): { exact: ExerciseDto | null; similar: ExerciseDto[] } {
  const n = norm(name);
  if (n.length < 3) return { exact: null, similar: [] };
  const words = n.split(/[\s-]+/).filter((w) => w.length > 2);
  const others = list.filter((e) => e.id !== exceptId);
  const exact = others.find((e) => norm(e.name) === n) ?? null;
  const similar = others
    .filter((e) => e !== exact)
    .filter((e) => {
      const en = norm(e.name);
      const hit = words.filter((w) => en.includes(w)).length;
      return words.length > 0 && hit >= Math.ceil(words.length / 2);
    })
    .slice(0, 3);
  return { exact, similar };
}

export interface ExerciseForm {
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string;
  movementPattern: string;
  functionalMovement: string;
  note: string;
}

export const formFrom = (e: ExerciseDto | null, pre?: Partial<ExerciseForm>): ExerciseForm => ({
  name: e?.name ?? pre?.name ?? "",
  primaryMuscleGroup: e?.primaryMuscleGroup ?? "",
  secondaryMuscleGroups: [...(e?.secondaryMuscleGroups ?? [])],
  equipment: e?.equipment ?? pre?.equipment ?? "",
  movementPattern: e?.movementPattern ?? pre?.movementPattern ?? "",
  functionalMovement: e?.functionalMovement ?? "",
  note: e?.note ?? "",
});

export function validateForm(f: ExerciseForm, list: readonly ExerciseDto[], exceptId?: string): Partial<Record<keyof ExerciseForm, string>> {
  const errs: Partial<Record<keyof ExerciseForm, string>> = {};
  if (!f.name.trim()) errs.name = "Give it a name.";
  else if (similarNames(list, f.name, exceptId).exact) errs.name = "An exercise with this name is already in the library.";
  if (!f.primaryMuscleGroup) errs.primaryMuscleGroup = "Pick the primary muscle.";
  if (!f.equipment) errs.equipment = "Pick the equipment.";
  return errs;
}

/** Name for a copy that doesn't collide: "X (mine)", "X (mine 2)"… */
export function copyName(list: readonly ExerciseDto[], name: string): string {
  const taken = new Set(list.map((e) => norm(e.name)));
  let candidate = `${name} (mine)`;
  for (let i = 2; taken.has(norm(candidate)); i++) candidate = `${name} (mine ${i})`;
  return candidate;
}
