import { z } from "zod";

/**
 * Session blocks: every exercise session is Movement prep (optional, short,
 * low fatigue, never counted) then Main work (what progress and every planned
 * volume count read). The block is stored on the program slot, separately
 * from the role label; one `exercises` array holds both, prep first.
 */
export const SESSION_BLOCKS = ["prep", "main"] as const;
export const SessionBlock = z.enum(SESSION_BLOCKS);
export type SessionBlock = z.infer<typeof SessionBlock>;
export const SESSION_BLOCK_NAMES: Record<SessionBlock, string> = {
  prep: "Movement prep",
  main: "Main work",
};

/** Most prep and main exercises one session holds. */
export const MAX_PREP_EXERCISES = 8;
export const MAX_MAIN_EXERCISES = 20;

/** The legacy role that read as prep before blocks existed. */
const LEGACY_PREP_ROLE = "movement_prep";

export interface Blockable {
  block?: string | null;
  role?: string | null;
}

/**
 * The slot's block: its `block` when set, else prep for the legacy Movement
 * Prep label (so old programs count right with no data rewrite), else main.
 */
export function blockOf(e: Blockable): SessionBlock {
  if (e.block === "prep" || e.block === "main") return e.block;
  return e.role === LEGACY_PREP_ROLE ? "prep" : "main";
}

export const isPrep = (e: Blockable): boolean => blockOf(e) === "prep";

/** The exercises every planned count reads: main work only. */
export function mainWork<T extends Blockable>(list: readonly T[]): T[] {
  return list.filter((e) => !isPrep(e));
}

export function movementPrep<T extends Blockable>(list: readonly T[]): T[] {
  return list.filter(isPrep);
}

/** The spec's `{ movementPrep, mainWork }` view of one session. */
export function sessionBlocks<T extends Blockable>(s: { exercises: readonly T[] }): { movementPrep: T[]; mainWork: T[] } {
  return { movementPrep: movementPrep(s.exercises), mainWork: mainWork(s.exercises) };
}

/**
 * Prep before main, stable inside each block. When anything moved, `order`
 * is renumbered to the new index; an already-ordered list comes back as is.
 */
export function orderByBlock<T extends Blockable>(list: readonly T[]): T[] {
  const prep = movementPrep(list);
  const sorted = [...prep, ...mainWork(list)];
  if (sorted.every((e, i) => e === list[i])) return [...list];
  return sorted.map((e, i) =>
    typeof (e as { order?: unknown }).order === "number" ? { ...e, order: i } : e
  );
}

/**
 * Keep a session savable: prep past the cap, or prep with no main work at
 * all, goes back to main. For lists read from outside (AI drafts, paste
 * import); a trainer's own edit is refused instead.
 */
export function fitBlocks<T extends Blockable>(list: readonly T[]): T[] {
  const allPrep = list.length > 0 && list.every(isPrep);
  let kept = 0;
  return list.map((e) => (isPrep(e) && (allPrep || ++kept > MAX_PREP_EXERCISES) ? { ...e, block: "main" } : e));
}

/** Set one slot's block. Leaves its group: a superset never spans blocks, normalizeGroups tidies the rest. */
export function withBlock<T extends Blockable & { group?: string | null }>(e: T, to: SessionBlock): T {
  const { group: _g, ...rest } = e;
  return { ...rest, block: to } as T;
}

/**
 * Move slot `i` to the other block: it leaves its superset and lands at the
 * end of the target section. Order renumbered.
 */
export function moveToBlock<T extends Blockable & { group?: string | null }>(list: readonly T[], i: number, to: SessionBlock): T[] {
  const item = list[i];
  if (!item || blockOf(item) === to) return [...list];
  const rest = list.filter((_, j) => j !== i);
  const moved = withBlock(item, to);
  const prep = movementPrep(rest);
  const main = mainWork(rest);
  const out = to === "prep" ? [...prep, moved, ...main] : [...prep, ...main, moved];
  return out.map((e, k) => (typeof (e as { order?: unknown }).order === "number" ? { ...e, order: k } : e));
}

/**
 * A log's movement-prep check against its program session (API and mock
 * alike): `prepSets` = prep slots a set was logged on (a 422: prep is a
 * checklist), `prepDone` = the ticks kept, only the session's prep slot ids,
 * in session order. A freestyle log (no session) keeps no ticks.
 */
export function logPrepCheck(
  session: { kind?: string | null; exercises?: readonly (Blockable & { id: string })[] } | null | undefined,
  sets: readonly { programExerciseId?: string | null }[],
  ticked: readonly string[] | null | undefined
): { prepSets: string[]; prepDone: string[] } {
  const prepIds = session && (session.kind ?? "exercises") === "exercises" ? movementPrep(session.exercises ?? []).map((e) => e.id) : [];
  const prep = new Set(prepIds);
  const prepSets = [...new Set(sets.flatMap((s) => (s.programExerciseId && prep.has(s.programExerciseId) ? [s.programExerciseId] : [])))];
  const done = new Set(ticked ?? []);
  return { prepSets, prepDone: prepIds.filter((id) => done.has(id)) };
}

/** "Prep 3/4" on a logged session: ticked of the session's prep items; null when it has none. */
export function prepTag(
  exercises: readonly (Blockable & { id: string })[] | null | undefined,
  prepDone: readonly string[] | null | undefined
): string | null {
  const prep = movementPrep(exercises ?? []);
  if (prep.length === 0) return null;
  const done = new Set(prepDone ?? []);
  return `Prep ${prep.filter((e) => done.has(e.id)).length}/${prep.length}`;
}
