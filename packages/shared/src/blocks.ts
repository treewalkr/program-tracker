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
