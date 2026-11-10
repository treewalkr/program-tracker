/**
 * Supersets and circuits: exercises sharing a `group` letter are done back to
 * back — A1 then A2 is one round, repeated for the group's rounds. Rounds are
 * each member's set count, kept equal. Members are always adjacent.
 *
 * Pure list helpers, generic over any exercise shape that carries a `group`.
 */

export interface Groupable {
  group?: string | null;
}

/** A run of exercises done together: a group, or one ungrouped exercise. */
export interface ExerciseUnit<T> {
  group?: string;
  /** Index of the first item in the original list. */
  start: number;
  items: T[];
}

const keyOf = (g: string | null | undefined) => (g ? g : undefined);

/** Consecutive units: a run of exercises sharing a group letter, or an ungrouped exercise alone. */
export function exerciseUnits<T extends Groupable>(list: readonly T[]): ExerciseUnit<T>[] {
  const units: ExerciseUnit<T>[] = [];
  list.forEach((e, i) => {
    const g = keyOf(e.group);
    const last = units[units.length - 1];
    if (g && last?.group === g) last.items.push(e);
    else units.push(g ? { group: g, start: i, items: [e] } : { start: i, items: [e] });
  });
  return units;
}

/** Grow by copying the last set, or shrink from the end. Clamped to 1–20; set numbers renumbered. */
export function withSetCount<S extends { setNumber: number }>(sets: readonly S[], n: number): S[] {
  const count = Math.min(20, Math.max(1, Math.round(n) || 1));
  const last = sets[sets.length - 1];
  const next = sets.slice(0, count);
  while (last && next.length < count) next.push({ ...last });
  return next.map((s, i) => ({ ...s, setNumber: i + 1 }));
}

type WithSets = Groupable & { prescribedSets?: readonly { setNumber: number }[] };

function ungroup<T extends Groupable>(e: T): T {
  if (e.group === undefined) return e;
  const { group: _g, ...rest } = e;
  return rest as T;
}

function withOrder<T>(list: T[]): T[] {
  return list.map((e, i) =>
    typeof (e as { order?: unknown }).order === "number" ? { ...e, order: i } : e
  );
}

/**
 * Tidy groups: re-letter A, B, C… by appearance, drop one-member groups, and
 * bring every member's set count up to the group's largest. Run before saving.
 */
export function normalizeGroups<T extends WithSets>(list: readonly T[]): T[] {
  const out: T[] = [];
  let next = 0;
  for (const u of exerciseUnits(list)) {
    if (!u.group || u.items.length < 2 || next >= 26) {
      out.push(...u.items.map(ungroup));
      continue;
    }
    const letter = String.fromCharCode(65 + next++);
    const rounds = Math.max(...u.items.map((e) => e.prescribedSets?.length ?? 0));
    for (const e of u.items) {
      const sets = e.prescribedSets;
      out.push(
        sets && sets.length > 0 && sets.length < rounds
          ? ({ ...e, group: letter, prescribedSets: withSetCount(sets, rounds) } as T)
          : e.group === letter
            ? e
            : { ...e, group: letter }
      );
    }
  }
  return out;
}

/** "A1" for the first member of group A; null for an ungrouped exercise. */
export function groupTag(list: readonly Groupable[], i: number): string | null {
  const g = keyOf(list[i]?.group);
  if (!g) return null;
  let n = 1;
  for (let j = i - 1; j >= 0 && list[j].group === g; j--) n++;
  return `${g}${n}`;
}

/** "Superset" for two exercises, "Circuit" for three or more. */
export function groupKind(n: number): "Superset" | "Circuit" {
  return n >= 3 ? "Circuit" : "Superset";
}

/** Set every member of `group` to `n` rounds (sets); reps and load stay per exercise. */
export function setGroupRounds<T extends WithSets>(list: readonly T[], group: string, n: number): T[] {
  return list.map((e) =>
    e.group === group && e.prescribedSets
      ? ({ ...e, prescribedSets: withSetCount(e.prescribedSets, n) } as T)
      : e
  );
}

function unitIndexOf<T extends Groupable>(units: ExerciseUnit<T>[], i: number): number {
  return units.findIndex((u) => i >= u.start && i < u.start + u.items.length);
}

/** Join the unit holding exercise `i` with the unit after it (making or growing a group). */
export function linkWithNext<T extends WithSets>(list: readonly T[], i: number): T[] {
  const units = exerciseUnits(list);
  const ui = unitIndexOf(units, i);
  if (ui < 0 || ui >= units.length - 1) return [...list];
  const a = units[ui];
  const b = units[ui + 1];
  const letter = a.group ?? b.group ?? "~";
  const merged = [...a.items, ...b.items].map((e) => ({ ...e, group: letter }));
  const out = [...list];
  out.splice(a.start, merged.length, ...merged);
  return normalizeGroups(out);
}

/** Take exercise `i` out of its group; it lands just after the group so members stay adjacent. */
export function unlink<T extends WithSets>(list: readonly T[], i: number): T[] {
  const units = exerciseUnits(list);
  const u = units[unitIndexOf(units, i)];
  if (!u?.group) return [...list];
  const out = [...list];
  const [item] = out.splice(i, 1);
  const end = u.start + u.items.length - 1; // the group's last index after removal
  out.splice(end, 0, ungroup(item));
  return normalizeGroups(withOrder(out));
}

/**
 * Move up (-1) or down (+1). A group member moves only inside its group; an
 * ungrouped exercise jumps over a whole neighbouring group. `scope: "unit"`
 * moves the whole unit holding `i` (a group header's arrows).
 */
export function moveUnit<T extends Groupable>(
  list: readonly T[],
  i: number,
  dir: -1 | 1,
  scope: "item" | "unit" = "item"
): T[] {
  const units = exerciseUnits(list);
  const ui = unitIndexOf(units, i);
  if (ui < 0) return [...list];
  const u = units[ui];
  if (u.group && scope === "item") {
    const j = i + dir;
    if (j < u.start || j >= u.start + u.items.length) return [...list];
    const out = [...list];
    [out[i], out[j]] = [out[j], out[i]];
    return withOrder(out);
  }
  const vi = ui + dir;
  if (vi < 0 || vi >= units.length) return [...list];
  const swapped = [...units];
  [swapped[ui], swapped[vi]] = [swapped[vi], swapped[ui]];
  return withOrder(swapped.flatMap((x) => x.items));
}

/** Issues with a session's groups: split groups, one-member groups, unequal set counts. */
export function groupIssues(list: readonly WithSets[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const u of exerciseUnits(list)) {
    if (!u.group) continue;
    if (seen.has(u.group)) issues.push(`group ${u.group} members must be adjacent`);
    seen.add(u.group);
    if (u.items.length < 2) issues.push(`group ${u.group} needs at least two exercises`);
    const counts = new Set(u.items.map((e) => e.prescribedSets?.length ?? 0));
    if (counts.size > 1) issues.push(`group ${u.group} members must have the same number of sets`);
  }
  return issues;
}
