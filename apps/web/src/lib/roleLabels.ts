import {
  ROLE_CATEGORIES,
  ROLE_CATEGORY_NAMES,
  resolveRole,
  suggestRole,
  type BuiltinRole,
  type Equipment,
  type MovementPattern,
  type MuscleGroup,
  type RoleHints,
  type RoleLabel,
} from "@pt/shared";

/**
 * Role picker helpers (docs/role-labels-plan.md): search, grouping and how a
 * stored role reads. Pure — the picker and RoleChip render what these return.
 */

/** What a chip shows for a role the label list doesn't know (deleted, or not loaded yet). */
export const UNKNOWN_LABEL = { name: "Unknown label", chip: "Label", description: "A label that isn't in your list any more." };

/** How a stored role reads: its label, or a neutral stand-in. Archived labels still resolve. */
export function roleDisplay(role: string, labels: readonly RoleLabel[]): { name: string; chip: string; description: string } {
  return resolveRole(role, labels) ?? UNKNOWN_LABEL;
}

/** Active labels matching every word of the query on name, chip or meaning; name hits first, else rank order. */
export function searchRoleLabels(labels: readonly RoleLabel[], query: string): RoleLabel[] {
  const active = labels.filter((l) => !l.archived).sort((a, b) => a.rank - b.rank);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return active;
  const hay = (l: RoleLabel) => `${l.name} ${l.chip} ${l.description}`.toLowerCase();
  const q = words.join(" ");
  const score = (l: RoleLabel) => {
    const name = l.name.toLowerCase();
    return name.startsWith(q) || l.chip.toLowerCase().startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
  };
  return active
    .filter((l) => words.every((w) => hay(l).includes(w)))
    .map((l) => ({ l, s: score(l) }))
    .sort((a, b) => a.s - b.s || a.l.rank - b.l.rank)
    .map((x) => x.l);
}

/** Built-ins by category (priority, training quality, body region), then "Your labels"; empty groups dropped. */
export function groupRoleLabels(labels: readonly RoleLabel[]): { label: string; items: RoleLabel[] }[] {
  const byRank = [...labels].sort((a, b) => a.rank - b.rank);
  return [
    ...ROLE_CATEGORIES.map((c) => ({ label: ROLE_CATEGORY_NAMES[c], items: byRank.filter((l) => l.category === c) })),
    { label: "Your labels", items: byRank.filter((l) => l.category === null) },
  ].filter((g) => g.items.length > 0);
}

/** Offer "+ New label" unless the query is empty or already names an active label. */
export function canCreateLabel(labels: readonly RoleLabel[], typed: string): boolean {
  const name = typed.trim().replace(/\s+/g, " ").toLowerCase();
  return name.length > 0 && !labels.some((l) => !l.archived && l.name.toLowerCase() === name);
}

/** Catalog fields suggestRole reads (ExerciseDto keeps them as plain strings). */
type CatalogHint = { id: string; name: string; primaryMuscleGroup: string; equipment: string; movementPattern: string | null };
type Slot = { exerciseId: string; exerciseName?: string; prescribedSets?: readonly { reps?: number | null; type?: string | null }[] };

/** An exercise as suggestRole sees it: catalog fields when the id is known, its name otherwise. */
export function roleHints(e: Slot, catalog: readonly CatalogHint[]): RoleHints {
  const c = catalog.find((x) => x.id === e.exerciseId);
  return {
    name: c?.name ?? e.exerciseName ?? "",
    movementPattern: (c?.movementPattern ?? null) as MovementPattern | null,
    primaryMuscleGroup: (c?.primaryMuscleGroup ?? null) as MuscleGroup | null,
    equipment: (c?.equipment ?? null) as Equipment | null,
    prescribedSets: e.prescribedSets,
  };
}

/** suggestRole for `session[index]`, reading the catalog. */
export function suggestRoleIn(session: readonly Slot[], index: number, catalog: readonly CatalogHint[]): BuiltinRole {
  const hints = session.map((e) => roleHints(e, catalog));
  return suggestRole(hints[index], hints, index);
}
