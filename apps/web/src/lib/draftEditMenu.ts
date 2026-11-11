import {
  canApplyDraftEdit,
  draftSessionLabels,
  sortExercisesByRole,
  type AiProgramDraft,
  type DraftEditOp,
  type DraftRef,
  type RoleRank,
} from "@pt/shared";
import type { OverflowItem } from "$lib/ui/OverflowMenu.svelte";
import type { AiDraftDto } from "$lib/api/types";

/**
 * What the hand-edit controls offer for a draft (row ⋯ menu, select bar).
 * Every action is simulated with the shared ops first: one that would not
 * change what the trainer sees (role order wins, a session can't empty, …)
 * is disabled rather than saving a no-op version.
 *
 * Takes the DTO (session `kind` may be absent = lifting, as the schema defaults it).
 */

const nameOf = (e: { exerciseName?: string; exerciseId?: string }) => e.exerciseName || e.exerciseId || "exercise";

/** A session's rows as shown: role order, each with its stored slot. */
function shown(draft: AiDraftDto, day: number, labels?: readonly RoleRank[]) {
  const s = draft.sessions[day - 1];
  return sortExercisesByRole(
    (s?.exercises ?? []).map((e, i) => ({ ...e, slot: i + 1 })),
    labels
  );
}

/** "Session 2 · Upper" per lifting session; cardio sessions take no exercises. */
export function moveTargets(draft: AiDraftDto): { day: number; label: string }[] {
  const tags = draftSessionLabels(draft.sessions);
  return draft.sessions.flatMap((s, i) => (s.kind === "cardio" ? [] : [{ day: i + 1, label: `${tags[i]} · ${s.name}` }]));
}

export function rowMenuItems(
  dto: AiDraftDto,
  ref: DraftRef,
  run: (ops: DraftEditOp[]) => void,
  labels?: readonly RoleRank[]
): OverflowItem[] {
  const draft = dto as AiProgramDraft;
  const can = (op: DraftEditOp) => canApplyDraftEdit(draft, op, labels);
  const rows = shown(dto, ref.day, labels);
  const at = rows.findIndex((e) => e.slot === ref.slot);
  const me = rows[at];
  if (!me) return [];
  const items: OverflowItem[] = [];
  const add = (label: string, icon: OverflowItem["icon"], op: DraftEditOp, section?: string) =>
    items.push({ label, icon, section, disabled: !can(op), onselect: () => run([op]) });

  add("Move up", "arrow-up", { op: "move", refs: [ref], dir: "up" });
  add("Move down", "arrow-down", { op: "move", refs: [ref], dir: "down" });
  for (const side of ["above", "below"] as const) {
    const n = rows[side === "above" ? at - 1 : at + 1];
    if (!n || (me.group && n.group === me.group)) continue;
    add(`Superset with ${nameOf(n)}`, "link", { op: "superset", ref, with: side });
  }
  if (me.group) add(`Leave superset ${me.group}`, "unlink", { op: "leave", ref });
  for (const t of moveTargets(draft)) {
    if (t.day === ref.day) continue;
    add(t.label, "arrow-right", { op: "moveTo", refs: [ref], day: t.day }, "Move to");
  }
  return items;
}

export interface SelectionActions {
  up: DraftEditOp | null;
  down: DraftEditOp | null;
  /** 2+ rows in one session. */
  superset: DraftEditOp | null;
  /** "Move to the end of" each session. */
  moveTo: { label: string; op: DraftEditOp; disabled: boolean }[];
}

export function selectionActions(dto: AiDraftDto, refs: DraftRef[], labels?: readonly RoleRank[]): SelectionActions {
  const draft = dto as AiProgramDraft;
  const can = (op: DraftEditOp) => canApplyDraftEdit(draft, op, labels);
  const ok = (op: DraftEditOp) => (refs.length && can(op) ? op : null);
  const oneSession = new Set(refs.map((r) => r.day)).size === 1;
  return {
    up: ok({ op: "move", refs, dir: "up" }),
    down: ok({ op: "move", refs, dir: "down" }),
    superset: refs.length >= 2 && oneSession ? ok({ op: "group", refs }) : null,
    moveTo: moveTargets(draft).map((t) => {
      const op: DraftEditOp = { op: "moveTo", refs, day: t.day };
      return { label: t.label, op, disabled: !refs.length || !can(op) };
    }),
  };
}

/** "day:slot" key for a selected row. */
export const refKey = (r: DraftRef) => `${r.day}:${r.slot}`;
export const keyRef = (k: string): DraftRef => {
  const [day, slot] = k.split(":").map(Number);
  return { day, slot };
};

/**
 * Where the selected rows went: the undo op restores the previous draft, so
 * entry (day, slot) of it names that exercise's place in the new draft.
 */
export function followSelection(keys: readonly string[], undo: readonly DraftEditOp[]): string[] {
  const restore = undo[0];
  if (!restore || restore.op !== "restore") return [];
  return keys.flatMap((k) => {
    const { day, slot } = keyRef(k);
    const to = restore.sessions[day - 1]?.[slot - 1]?.from;
    return to ? [refKey(to)] : [];
  });
}
