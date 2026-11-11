/**
 * Hand edits on an AI draft: move exercises, make or break supersets, move
 * them between sessions — no AI call. Pure functions on `AiProgramDraft`.
 *
 * The trainer edits what they see. An AI-made draft is shown in role order, so
 * the first edit starts from the role-sorted list; a draft the trainer has
 * already edited (`keepOrder`) is shown as stored. Either way the result is
 * stored in the trainer's order, never re-sorted, with groups tidied
 * (normalizeGroups) — the trainer's order wins from then on. An op whose
 * result looks the same as before is reported as `changed: false` (the UI
 * disables it).
 *
 * `ref` = { day, slot }, both 1-based, into the draft as stored — the same
 * addressing `diffDrafts` uses.
 */
import { z } from "zod";
import type { AiProgramDraft, DraftExerciseRef } from "./ai";
import { sortExercisesByRole, type RoleRank } from "./domain";
import { exerciseUnits, groupKind, normalizeGroups, withSetCount } from "./groups";

export const DraftRef = z.object({
  day: z.number().int().min(1).max(14),
  slot: z.number().int().min(1).max(20),
});
export type DraftRef = z.infer<typeof DraftRef>;

const Refs = z.array(DraftRef).min(1).max(40);

/** One step of a hand edit. A request replays its ops in order on the stored draft. */
export const DraftEditOp = z.discriminatedUnion("op", [
  /** Move rows up or down inside their session. A row stepping out of a superset leaves it. */
  z.object({ op: z.literal("move"), refs: Refs, dir: z.enum(["up", "down"]) }),
  /** Join the neighbour's superset (or start one with it). */
  z.object({ op: z.literal("superset"), ref: DraftRef, with: z.enum(["above", "below"]) }),
  /** Take a row out of its superset; it lands just after the group. */
  z.object({ op: z.literal("leave"), ref: DraftRef }),
  /** Append rows to the end of a session, out of any superset. */
  z.object({ op: z.literal("moveTo"), refs: Refs, day: z.number().int().min(1).max(14) }),
  /** Make the rows (2+, one session) one new superset at the first row's place. */
  z.object({ op: z.literal("group"), refs: Refs.min(2) }),
  /**
   * Undo: put the draft's own exercises back in an earlier arrangement. Each
   * entry names an exercise of the current draft, so nothing new comes in;
   * `sets` restores a set count a superset had grown.
   */
  z.object({
    op: z.literal("restore"),
    sessions: z
      .array(
        z
          .array(
            z.object({
              from: DraftRef,
              group: z.string().regex(/^[A-Z]$/).nullable(),
              sets: z.number().int().min(1).max(20),
            })
          )
          .max(20)
      )
      .min(1)
      .max(14),
  }),
]);
export type DraftEditOp = z.infer<typeof DraftEditOp>;

export const DraftEditOps = z.array(DraftEditOp).min(1).max(20);

/** An op that cannot apply to this draft (stale ref, empty session, …). */
export class DraftEditError extends Error {}

export interface DraftEditResult {
  draft: AiProgramDraft;
  /** Plain wording per op, e.g. "moved Plank to Session 2". */
  changes: string[];
  /** False when the result shows the same as the input (nothing to save). */
  changed: boolean;
  /** One op that puts the input draft back (Undo). */
  inverse: DraftEditOp;
}

/** Prefix of the chat line that tells the AI about a hand edit. */
export const DRAFT_EDIT_NOTE_PREFIX = "Edited the draft by hand";

/** Version-history label: "Edited by you: moved Plank to Session 2". */
export function draftEditRevisionMessage(changes: string[]): string {
  return `Edited by you: ${changes.join("; ")}`;
}

/** Chat line the AI reads: "Edited the draft by hand (v3): moved Plank to Session 2." */
export function draftEditNote(version: number, changes: string[]): string {
  return `${DRAFT_EDIT_NOTE_PREFIX} (v${version}): ${changes.join("; ")}.`.slice(0, 4000);
}

// ---------------------------------------------------------------------------

type Ex = DraftExerciseRef;
/** A working copy of an exercise, tagged with where it came from ("day:slot", 0-based). */
type W = Ex & { __k: string };

/**
 * Deep copy of plain draft JSON. Not structuredClone: UI state proxies
 * (Svelte $state) can't be structured-cloned, and drafts are JSON anyway.
 */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const nameOf = (e: Ex) => e.exerciseName ?? e.exerciseId ?? "exercise";
const list = (names: string[]) => names.join(", ");

/** "Session 2" / "Cardio 1" per draft session, numbered per kind. */
export function draftSessionLabels(sessions: readonly { kind?: string | null }[]): string[] {
  const n = { lifting: 0, cardio: 0 };
  return sessions.map((s) => (s.kind === "cardio" ? `Cardio ${++n.cardio}` : `Session ${++n.lifting}`));
}

/**
 * How a draft is shown. `keepOrder` = the trainer has hand-edited it, so its
 * stored order is theirs and is never role-sorted (the generation's
 * `trainerOrder`).
 */
export interface DraftOrderOpts {
  keepOrder?: boolean;
}

/** A session's exercises in display order: role order for an AI-made draft, as stored once the order is the trainer's. */
export function shownExerciseOrder<T extends { role?: string | null; group?: string | null }>(
  l: readonly T[],
  labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
): T[] {
  return opts.keepOrder ? [...l] : sortExercisesByRole(l, labels);
}

/** Groups tidied and lettered by appearance, in role order unless the order is the trainer's — what the trainer sees. */
function canonicalList<T extends Ex>(l: readonly T[], labels?: readonly RoleRank[], keepOrder = false): T[] {
  return keepOrder ? normalizeGroups(l) : normalizeGroups(sortExercisesByRole(normalizeGroups(l), labels));
}

function strip(e: W): Ex {
  const { __k: _k, ...rest } = e;
  return rest as Ex;
}

/** JSON with object keys sorted, so key order never reads as a change. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val
  );

/** The draft as shown: each session's exercises with tidy groups, role-sorted unless `keepOrder`. */
export function canonicalDraft(d: AiProgramDraft, labels?: readonly RoleRank[], opts: DraftOrderOpts = {}): AiProgramDraft {
  return {
    ...d,
    sessions: d.sessions.map((s) => ({ ...s, exercises: canonicalList(s.exercises, labels, opts.keepOrder) })),
  };
}

export function sameDraft(a: AiProgramDraft, b: AiProgramDraft): boolean {
  return canon(a) === canon(b);
}

/** Working state: one list per session, every exercise tagged with its origin. */
class Work {
  lists: W[][];
  readonly tags: string[];
  /** Starts from the draft as shown (role-sorted unless `keepOrder`). */
  constructor(
    readonly draft: AiProgramDraft,
    labels: readonly RoleRank[] | undefined,
    keepOrder: boolean
  ) {
    this.tags = draftSessionLabels(draft.sessions);
    this.lists = draft.sessions.map((s, d) =>
      canonicalList(
        s.exercises.map((e, i) => ({ ...clone(e), __k: `${d}:${i}` })),
        labels,
        keepOrder
      )
    );
  }

  /** The exercise at a stored ref (refs address the draft this Work started from). */
  get(ref: DraftRef): W {
    const key = `${ref.day - 1}:${ref.slot - 1}`;
    for (const l of this.lists) {
      const e = l.find((x) => x.__k === key);
      if (e) return e;
    }
    throw new DraftEditError(`no exercise at session ${ref.day}, slot ${ref.slot}`);
  }

  where(e: W): { d: number; i: number } {
    for (let d = 0; d < this.lists.length; d++) {
      const i = this.lists[d].indexOf(e);
      if (i >= 0) return { d, i };
    }
    throw new DraftEditError("exercise not found");
  }

  /** Tidy every session: groups re-lettered, one-member groups dropped. Order stays the trainer's. */
  settle() {
    this.lists = this.lists.map((l) => normalizeGroups(l));
  }

  /** Re-find an exercise after settle() (objects are copied when groups change). */
  find(key: string): W {
    for (const l of this.lists) {
      const e = l.find((x) => x.__k === key);
      if (e) return e;
    }
    throw new DraftEditError("exercise not found");
  }

  /** The draft the lists describe. */
  result(): AiProgramDraft {
    return {
      ...clone(this.draft),
      sessions: this.draft.sessions.map((s, d) => ({ ...clone(s), exercises: this.lists[d].map(strip) })),
    };
  }
}

/** A letter no exercise in the list uses, so a new group never merges with a neighbour. */
function freshLetter(l: readonly Ex[]): string {
  const used = new Set(l.map((e) => e.group).filter(Boolean));
  for (let c = 90; c >= 65; c--) {
    const g = String.fromCharCode(c);
    if (!used.has(g)) return g;
  }
  throw new DraftEditError("too many supersets in one session");
}

function ungroup(e: W) {
  delete e.group;
}

/** The superset an exercise is in after settle(): "superset A in Session 1: Box Jump + Plank". */
function describeGroup(w: Work, key: string, verb = ""): string {
  const e = w.find(key);
  const { d } = w.where(e);
  const members = w.lists[d].filter((x) => x.group && x.group === e.group);
  if (members.length < 2) return `${verb}${nameOf(e)} in ${w.tags[d]}`;
  return `${verb}${groupKind(members.length).toLowerCase()} ${e.group} in ${w.tags[d]}: ${members.map(nameOf).join(" + ")}`;
}

/** Sessions an exercise may live in. */
function assertLifting(w: Work, d: number) {
  if (w.draft.sessions[d]?.kind === "cardio") throw new DraftEditError(`${w.tags[d]} is a cardio session`);
}

function assertNotEmpty(w: Work) {
  w.lists.forEach((l, d) => {
    if (w.draft.sessions[d].kind !== "cardio" && l.length === 0) {
      throw new DraftEditError(`${w.tags[d]} would have no exercises`);
    }
    if (l.length > 20) throw new DraftEditError(`${w.tags[d]} would have more than 20 exercises`);
  });
}

function uniqueRefs(w: Work, refs: readonly DraftRef[]): W[] {
  const out = [...new Set(refs.map((r) => w.get(r)))];
  // Top to bottom, session by session.
  return out.sort((a, b) => {
    const x = w.where(a);
    const y = w.where(b);
    return x.d - y.d || x.i - y.i;
  });
}

// ---- moves -----------------------------------------------------------------

/**
 * One row one step. Inside a superset it swaps with the next member; at the
 * group's edge it leaves the group and steps over the unit beyond it. An
 * ungrouped row steps over a whole neighbouring group, never into it.
 */
function moveOne(l: W[], e: W, dir: -1 | 1, blocked: (x: W) => boolean): boolean {
  const i = l.indexOf(e);
  const units = exerciseUnits(l);
  const ui = units.findIndex((u) => i >= u.start && i < u.start + u.items.length);
  const u = units[ui];
  if (u.group && u.items.length > 1) {
    const j = i + dir;
    if (j >= u.start && j < u.start + u.items.length) {
      if (blocked(l[j])) return false;
      [l[i], l[j]] = [l[j], l[i]];
      return true;
    }
    // At the group's edge: out of the group, past the unit beyond it.
    const beyond = units[ui + dir];
    if (beyond?.items.some(blocked)) return false;
    l.splice(i, 1);
    ungroup(e);
    if (dir === -1) l.splice(beyond ? beyond.start : u.start, 0, e);
    else l.splice(beyond ? beyond.start + beyond.items.length - 1 : u.start + u.items.length - 1, 0, e);
    return true;
  }
  const v = units[ui + dir];
  if (!v || v.items.some(blocked)) return false;
  l.splice(i, 1);
  l.splice(dir === -1 ? v.start : v.start + v.items.length - 1, 0, e);
  return true;
}

function applyMove(w: Work, refs: readonly DraftRef[], dir: "up" | "down"): string[] {
  const picked = uniqueRefs(w, refs);
  const order = dir === "up" ? picked : [...picked].reverse();
  const sel = new Set<W>(picked);
  const moved = new Map<number, string[]>();
  for (const e of order) {
    const { d } = w.where(e);
    if (moveOne(w.lists[d], e, dir === "up" ? -1 : 1, (x) => sel.has(x))) {
      moved.set(d, [...(moved.get(d) ?? []), nameOf(e)]);
    }
  }
  w.settle();
  return [...moved].map(([d, names]) => `moved ${list(dir === "up" ? names : names.reverse())} ${dir} in ${w.tags[d]}`);
}

/** Move one row up or down within its session. */
export function moveDraftExercise(draft: AiProgramDraft, ref: DraftRef, dir: "up" | "down", labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
) {
  return applyDraftEdit(draft, [{ op: "move", refs: [ref], dir }], labels, opts);
}

// ---- supersets ---------------------------------------------------------------

function applySuperset(w: Work, ref: DraftRef, side: "above" | "below"): string[] {
  const e = w.get(ref);
  const { d, i } = w.where(e);
  const l = w.lists[d];
  const n = l[side === "above" ? i - 1 : i + 1];
  if (!n) throw new DraftEditError(`nothing ${side} ${nameOf(e)}`);
  if (e.group && n.group === e.group) throw new DraftEditError(`${nameOf(e)} is already in that superset`);
  // Neighbours are adjacent, so joining is only a letter change; the old group may dissolve.
  const g = n.group ?? freshLetter(l);
  n.group = g;
  e.group = g;
  w.settle();
  return [describeGroup(w, e.__k)];
}

/** Join the neighbour's superset, or start one with it. */
export function supersetWith(draft: AiProgramDraft, ref: DraftRef, side: "above" | "below", labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
) {
  return applyDraftEdit(draft, [{ op: "superset", ref, with: side }], labels, opts);
}

function applyLeave(w: Work, ref: DraftRef): string[] {
  const e = w.get(ref);
  const { d, i } = w.where(e);
  const l = w.lists[d];
  const g = e.group;
  if (!g) throw new DraftEditError(`${nameOf(e)} is not in a superset`);
  let end = i;
  while (l[end + 1]?.group === g) end++;
  l.splice(i, 1);
  ungroup(e);
  l.splice(end, 0, e);
  w.settle();
  return [`took ${nameOf(e)} out of superset ${g} in ${w.tags[d]}`];
}

/** Take a row out of its superset; it lands just after the group, and a one-member group dissolves. */
export function leaveSuperset(draft: AiProgramDraft, ref: DraftRef, labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
) {
  return applyDraftEdit(draft, [{ op: "leave", ref }], labels, opts);
}

function applyGroup(w: Work, refs: readonly DraftRef[]): string[] {
  const picked = uniqueRefs(w, refs);
  if (picked.length < 2) throw new DraftEditError("pick two or more exercises");
  const { d, i: first } = w.where(picked[0]);
  if (picked.some((e) => w.where(e).d !== d)) throw new DraftEditError("pick exercises from one session");
  const sel = new Set(picked);
  const l = w.lists[d].filter((e) => !sel.has(e));
  // Land at the first row's place, but never inside another superset.
  let at = first;
  while (l[at - 1]?.group && l[at - 1].group === l[at]?.group) at++;
  const g = freshLetter(w.lists[d]);
  for (const e of picked) e.group = g;
  l.splice(at, 0, ...picked);
  w.lists[d] = l;
  w.settle();
  return [describeGroup(w, picked[0].__k, "made ")];
}

/** Make the selected rows (2+, one session) one superset at the first one's place. */
export function supersetSelected(draft: AiProgramDraft, refs: DraftRef[], labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
) {
  return applyDraftEdit(draft, [{ op: "group", refs }], labels, opts);
}

// ---- sessions ------------------------------------------------------------------

function applyMoveTo(w: Work, refs: readonly DraftRef[], day: number): string[] {
  const t = day - 1;
  if (!w.lists[t]) throw new DraftEditError(`no session ${day}`);
  assertLifting(w, t);
  const picked = uniqueRefs(w, refs);
  for (const e of picked) {
    const { d, i } = w.where(e);
    w.lists[d].splice(i, 1);
    ungroup(e);
    w.lists[t].push(e);
  }
  assertNotEmpty(w);
  w.settle();
  return [`moved ${list(picked.map(nameOf))} to ${w.tags[t]}`];
}

/** Append rows to the end of a session (out of any superset). */
export function moveToSession(draft: AiProgramDraft, refs: DraftRef[], day: number, labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
) {
  return applyDraftEdit(draft, [{ op: "moveTo", refs, day }], labels, opts);
}

// ---- undo ---------------------------------------------------------------------------

function applyRestore(w: Work, sessions: Extract<DraftEditOp, { op: "restore" }>["sessions"]): string[] {
  if (sessions.length !== w.lists.length) throw new DraftEditError("the draft's sessions changed");
  const used = new Set<W>();
  const total = w.lists.reduce((n, l) => n + l.length, 0);
  w.lists = sessions.map((items, d) => {
    if (items.length > 0) assertLifting(w, d);
    const l = items.map((it) => {
      const src = w.get(it.from);
      if (used.has(src)) throw new DraftEditError("an exercise is listed twice");
      used.add(src);
      const e: W = { ...src, prescribedSets: withSetCount(src.prescribedSets, it.sets) };
      if (it.group) e.group = it.group;
      else ungroup(e);
      return e;
    });
    return normalizeGroups(l);
  });
  if (used.size !== total) throw new DraftEditError("every exercise must be placed");
  assertNotEmpty(w);
  return ["undid the last hand edit"];
}

// ---- replay ----------------------------------------------------------------------------

/**
 * Replay ops on a draft. Refs in each op address the draft as it stands before
 * that op (as stored). The first op starts from the draft as shown (role order
 * unless `keepOrder`); the result is in the trainer's order. Throws
 * DraftEditError when an op cannot apply.
 */
export function applyDraftEdit(
  draft: AiProgramDraft,
  ops: readonly DraftEditOp[],
  labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
): DraftEditResult {
  const keepOrder = opts.keepOrder ?? false;
  // The draft as the trainer saw it; Undo puts this back.
  const shownAt = new Work(draft, labels, keepOrder).lists;
  let cur = draft;
  const changes: string[] = [];
  let restoring = false;
  // Where each exercise of `cur` sat in the input draft ("day:slot", 0-based).
  let origin = draft.sessions.map((s, d) => s.exercises.map((_, i) => `${d}:${i}`));
  for (const [n, op] of ops.entries()) {
    // After the first op `cur` is already in the trainer's order.
    const w = new Work(cur, labels, keepOrder || n > 0);
    if (op.op === "move") changes.push(...applyMove(w, op.refs, op.dir));
    else if (op.op === "superset") changes.push(...applySuperset(w, op.ref, op.with));
    else if (op.op === "leave") changes.push(...applyLeave(w, op.ref));
    else if (op.op === "moveTo") changes.push(...applyMoveTo(w, op.refs, op.day));
    else if (op.op === "group") changes.push(...applyGroup(w, op.refs));
    else {
      changes.push(...applyRestore(w, op.sessions));
      restoring = true;
    }
    const prev = origin;
    origin = w.lists.map((l) =>
      l.map((e) => {
        const [d, i] = e.__k.split(":").map(Number);
        return prev[d][i];
      })
    );
    cur = w.result();
  }

  // Undo: every input exercise back to where it was shown, with its group and set count.
  const at = new Map<string, DraftRef>();
  origin.forEach((l, d) => l.forEach((k, i) => at.set(k, { day: d + 1, slot: i + 1 })));
  const inverse: DraftEditOp = {
    op: "restore",
    sessions: shownAt.map((l) =>
      l.map((e) => ({ from: at.get(e.__k)!, group: e.group ?? null, sets: e.prescribedSets.length }))
    ),
  };

  // A restore is exact; other ops count only what the trainer can see.
  const changed = !sameDraft(restoring ? draft : canonicalDraft(draft, labels, { keepOrder }), cur);
  return { draft: cur, changes, changed, inverse };
}

/** Would this op change what the trainer sees? (Menus disable the ones that would not.) */
export function canApplyDraftEdit(
  draft: AiProgramDraft,
  op: DraftEditOp,
  labels?: readonly RoleRank[],
  opts: DraftOrderOpts = {}
): boolean {
  try {
    return applyDraftEdit(draft, [op], labels, opts).changed;
  } catch (err) {
    if (err instanceof DraftEditError) return false;
    throw err;
  }
}

