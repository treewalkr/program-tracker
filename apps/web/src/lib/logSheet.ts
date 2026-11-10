import { resolveLoadKg, type PrescribedSet, type SetType, type SkipReason } from "@pt/shared";
import { parseFlags, parseReadiness, readinessRated, type ExerciseFlags, type ReadinessForm } from "./logFlags";

/**
 * A log-sheet cell. Svelte number-input binds give a number, or null/undefined
 * once the trainer clears the field — never assume "" means empty.
 */
export type Cell = string | number | null | undefined;

export interface SheetRow {
  key: string;
  /** What is logged — differs from `slotExerciseId` once the slot is swapped. */
  exerciseId: string;
  /** The exercise the program prescribes for this slot. */
  slotExerciseId: string;
  programExerciseId: string;
  setNumber: number;
  type: SetType;
  /** Reps sent when the reps cell is blank: the as-prescribed count (bottom of a range). */
  prescribedReps: number | null;
  weight: Cell;
  reps: Cell;
  rpe: Cell;
  /** Didn't happen — greyed out and never sent. */
  skipped?: boolean;
  /** Added on the floor, beyond the prescription. */
  extra?: boolean;
  /** Cells filled down from an earlier set, not typed — a later fill may replace them. */
  copied?: SheetField[];
  /** Set on every row of an exercise skipped as a whole, with the optional reason. */
  exerciseSkip?: { reason: SkipReason | null };
  /** Superset letter: the group's rows run round by round on one card. */
  group?: string;
}

export type SheetField = "weight" | "reps" | "rpe";
export type FieldErrors = Record<string, Partial<Record<SheetField, string>>>;

/** One short message per field, shared by client checks and server 422s. */
const MSG: Record<SheetField, string> = { weight: "kg 0–600", reps: "Reps 0–200", rpe: "RPE is 1–10" };

export const isBlank = (v: Cell): boolean => v == null || (typeof v === "string" && v.trim() === "");

/** Blank → undefined; anything else → number (NaN for junk, caught by validateRows). */
export const cellNumber = (v: Cell): number | undefined => (isBlank(v) ? undefined : Number(v));

/** A row counts toward the log once reps or kg is entered (0 counts — a missed set).
 *  A filled-down kg alone doesn't: the set may not have happened. */
export const rowFilled = (r: SheetRow): boolean =>
  !isBlank(r.reps) || (!isBlank(r.weight) && !r.copied?.includes("weight"));

/** The rows a save sends: entered and not skipped. */
export const rowsToSave = <R extends SheetRow>(rows: R[]): R[] => rows.filter((r) => !r.skipped && rowFilled(r));

export function sheetCounts(rows: SheetRow[]) {
  const skipped = rows.filter((r) => r.skipped).length;
  const logged = rowsToSave(rows).length;
  return { logged, skipped, open: rows.length - skipped - logged, total: rows.length };
}

export const isSwapped = (r: Pick<SheetRow, "exerciseId" | "slotExerciseId">): boolean => r.exerciseId !== r.slotExerciseId;

/** Row → wire set. Explicit 0 reps stays 0; only blank reps falls back to the prescription. */
export function toLoggedSet(r: SheetRow) {
  return {
    programExerciseId: r.programExerciseId,
    exerciseId: r.exerciseId,
    setNumber: r.setNumber,
    type: r.type,
    weightKg: cellNumber(r.weight),
    reps: cellNumber(r.reps) ?? r.prescribedReps ?? 0,
    rpe: cellNumber(r.rpe),
  };
}

/** Client-side mirror of the LoggedSet bounds, keyed by row so the sheet can mark the cell. */
export function validateRows(rows: SheetRow[]): FieldErrors {
  const out: FieldErrors = {};
  const put = (key: string, field: SheetField, msg: string) => ((out[key] ??= {})[field] = msg);
  for (const r of rows) {
    if (r.skipped) continue;
    const reps = cellNumber(r.reps);
    if (reps === undefined && r.prescribedReps == null && rowFilled(r)) put(r.key, "reps", "Enter reps");
    if (reps !== undefined) {
      if (!Number.isFinite(reps) || reps < 0 || reps > 200) put(r.key, "reps", MSG.reps);
      else if (!Number.isInteger(reps)) put(r.key, "reps", "Whole reps only");
    }
    const kg = cellNumber(r.weight);
    if (kg !== undefined && (!Number.isFinite(kg) || kg < 0 || kg > 600)) put(r.key, "weight", MSG.weight);
    const rpe = cellNumber(r.rpe);
    if (rpe !== undefined && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) put(r.key, "rpe", MSG.rpe);
  }
  return out;
}

const WIRE_TO_FIELD: Record<string, SheetField> = { weightKg: "weight", reps: "reps", rpe: "rpe" };

/**
 * A 422 `issues` tree (zod treeifyError) → per-row field errors. `rows` must be
 * the exact array that was submitted, so item index i is rows[i].
 */
export function serverFieldErrors(issues: unknown, rows: SheetRow[]): FieldErrors {
  const out: FieldErrors = {};
  const items = (issues as { properties?: { sets?: { items?: unknown[] } } } | undefined)?.properties?.sets?.items;
  if (!Array.isArray(items)) return out;
  items.forEach((item, i) => {
    const row = rows[i];
    const props = (item as { properties?: Record<string, { errors?: string[] }> } | null)?.properties;
    if (!row || !props) return;
    for (const [wire, node] of Object.entries(props)) {
      const field = WIRE_TO_FIELD[wire];
      if (field && node?.errors?.length) (out[row.key] ??= {})[field] = MSG[field];
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Program slots: a prescribed exercise's place in the week, stable across weeks
// ---------------------------------------------------------------------------

interface SlotProgram {
  weeks: {
    sessions: { kind: string; seq: number; exercises: { id: string; exerciseId: string; order: number }[] }[];
  }[];
}

interface SlotLog {
  date: string;
  sets: {
    programExerciseId?: string | null;
    exerciseId: string;
    setNumber: number;
    weightKg?: number | null;
    reps: number;
    rpe?: number | null;
  }[];
}

/**
 * programExerciseId → slot id. A slot is the n-th occurrence of an exercise in
 * session `seq` (so a top set and back-offs of the same lift stay apart), and
 * keeps its id from week to week while each week's programExerciseIds differ.
 */
export function slotIds(program: SlotProgram): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of program.weeks) {
    for (const s of w.sessions) {
      const seen = new Map<string, number>();
      for (const e of [...s.exercises].sort((a, b) => a.order - b.order)) {
        const n = (seen.get(e.exerciseId) ?? 0) + 1;
        seen.set(e.exerciseId, n);
        out.set(e.id, `${s.kind}:${s.seq}:${e.exerciseId}:${n}`);
      }
    }
  }
  return out;
}

/** programExerciseId → the exercise the program prescribes there. */
function slotExercise(program: SlotProgram): Map<string, string> {
  return new Map(program.weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => [e.id, e.exerciseId] as const))));
}

export interface LastSet {
  date: string;
  weightKg: number | null;
  reps: number;
  rpe: number | null;
}

/**
 * The last time each slot's set was done, keyed `${slotId}#${setNumber}`.
 * Only sets logged under the slot's own exercise count — a swap's load says
 * nothing about the prescribed lift.
 */
export function lastBySlot(program: SlotProgram, logs: SlotLog[]): Map<string, LastSet> {
  const ids = slotIds(program);
  const prescribed = slotExercise(program);
  const out = new Map<string, LastSet>();
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const s of log.sets) {
      const pe = s.programExerciseId;
      const slot = pe ? ids.get(pe) : undefined;
      if (!slot || prescribed.get(pe!) !== s.exerciseId) continue;
      out.set(`${slot}#${s.setNumber}`, {
        date: log.date.slice(0, 10),
        weightKg: s.weightKg != null ? Number(s.weightKg) : null,
        reps: s.reps,
        rpe: s.rpe != null ? Number(s.rpe) : null,
      });
    }
  }
  return out;
}

export interface SlotSwap {
  date: string;
  fromExerciseId: string;
  toExerciseId: string;
  sets: number;
}

/** Slots logged under a different exercise than prescribed — one entry per log and slot, newest first. */
export function slotSwaps(program: SlotProgram, logs: SlotLog[]): SlotSwap[] {
  const prescribed = slotExercise(program);
  const out: SlotSwap[] = [];
  for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
    const bySlot = new Map<string, SlotSwap>();
    for (const s of log.sets) {
      const from = s.programExerciseId ? prescribed.get(s.programExerciseId) : undefined;
      if (!from || from === s.exerciseId) continue;
      const k = `${s.programExerciseId}:${s.exerciseId}`;
      const hit = bySlot.get(k);
      if (hit) hit.sets++;
      else bySlot.set(k, { date: log.date.slice(0, 10), fromExerciseId: from, toExerciseId: s.exerciseId, sets: 1 });
    }
    out.push(...bySlot.values());
  }
  return out;
}

// ---------------------------------------------------------------------------
// "Did it as prescribed"
// ---------------------------------------------------------------------------

export interface Prescription {
  reps: number;
  repsMin?: number | null;
  amrap: boolean;
  durationSeconds?: number | null;
  targetWeightKg?: number | null;
  targetRpe?: number | null;
}

/**
 * What "as prescribed" logs for one set. Load is the prescribed target; with
 * none, the same slot's last load — unless the move is bodyweight. A swapped
 * exercise never inherits a load meant for another lift. Ranges log their
 * bottom, timed sets their seconds; AMRAP to failure has nothing to assume.
 */
export function asPrescribed(
  p: Prescription | null,
  ctx: { bodyweight: boolean; swapped: boolean; last: LastSet | null }
): { weight: number | null; reps: number | null; rpe: number | null } {
  if (!p) return { weight: null, reps: null, rpe: null };
  const weight = ctx.swapped ? null : p.targetWeightKg ?? (ctx.bodyweight ? null : ctx.last?.weightKg ?? null);
  const count = p.durationSeconds ?? p.repsMin ?? p.reps;
  return { weight, reps: count > 0 ? count : null, rpe: p.targetRpe ?? null };
}

/**
 * The logger's view of one prescribed set: a %1RM target resolved to kg
 * against the client's 1RM (else the kg fallback), an AMRAP's stop RPE as its
 * RPE, and RIR alone read as RPE 10 − RIR.
 */
export function prescriptionOf(ps: PrescribedSet, oneRepMaxKg: number | null | undefined): Prescription {
  const rpe = ps.amrap ? (ps.stopRpe ?? ps.targetRpe) : (ps.targetRpe ?? (ps.targetRir != null ? 10 - ps.targetRir : undefined));
  return {
    reps: ps.reps,
    repsMin: ps.repsMin ?? null,
    amrap: ps.amrap,
    durationSeconds: ps.durationSeconds ?? null,
    targetWeightKg: resolveLoadKg(ps, oneRepMaxKg),
    targetRpe: rpe ?? null,
  };
}

// ---------------------------------------------------------------------------
// Editing the sheet: extra sets, swaps, steppers
// ---------------------------------------------------------------------------

export const MAX_SETS = 20;

/** Insert an extra set after the slot's last row (a superset's: after its last round), numbered after its highest set. */
export function withExtraSet<R extends SheetRow>(rows: R[], programExerciseId: string, make: (setNumber: number) => R): R[] {
  const slot = rows.filter((r) => r.programExerciseId === programExerciseId);
  const next = Math.max(0, ...slot.map((r) => r.setNumber)) + 1;
  if (next > MAX_SETS) return rows;
  const unit = unitRows(rows, programExerciseId);
  const at = rows.lastIndexOf(unit[unit.length - 1]) + 1;
  return [...rows.slice(0, at), make(next), ...rows.slice(at)];
}

/** Drop an extra set; later extras in the slot close the gap. */
export function withoutExtra<R extends SheetRow>(rows: R[], key: string): R[] {
  const gone = rows.find((r) => r.key === key);
  if (!gone?.extra) return rows;
  return rows
    .filter((r) => r !== gone)
    .map((r) =>
      r.extra && r.programExerciseId === gone.programExerciseId && r.setNumber > gone.setNumber
        ? { ...r, setNumber: r.setNumber - 1 }
        : r
    );
}

/** Log the slot under another exercise. Loads entered for the old lift are cleared. */
export function swapSlot<R extends SheetRow>(rows: R[], programExerciseId: string, exerciseId: string): R[] {
  return rows.map((r) =>
    r.programExerciseId === programExerciseId && r.exerciseId !== exerciseId
      ? { ...r, exerciseId, weight: null, copied: r.copied?.filter((f) => f !== "weight") }
      : r
  );
}

/** ± stepper: from the value, or from `from` (the target) when blank; clamped, rounded to 0.01. */
export function stepCell(v: Cell, delta: number, o: { min: number; max: number; from?: number | null }): number {
  const n = cellNumber(v);
  const start = n !== undefined && Number.isFinite(n) ? n : o.from ?? 0;
  const next = Math.round((start + delta) * 100) / 100;
  return Math.min(o.max, Math.max(o.min, next));
}

export interface SheetBlock<R> {
  /** Stable card key: the group letter, else the slot. */
  key: string;
  /** Superset letter when the card is a group. */
  group?: string;
  /** The card's first slot (the only one for a single exercise). */
  programExerciseId: string;
  /** Slots on the card, in prescribed order (A1, A2…). */
  memberIds: string[];
  rows: R[];
}

/** Consecutive rows of one unit — a single exercise or a whole superset — as a card. */
export function blocksOf<R extends SheetRow>(rows: R[]): SheetBlock<R>[] {
  const out: SheetBlock<R>[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    const key = r.group ? `group:${r.group}` : r.programExerciseId;
    if (last?.key === key) {
      last.rows.push(r);
      if (!last.memberIds.includes(r.programExerciseId)) last.memberIds.push(r.programExerciseId);
    } else {
      out.push({ key, ...(r.group ? { group: r.group } : {}), programExerciseId: r.programExerciseId, memberIds: [r.programExerciseId], rows: [r] });
    }
  }
  return out;
}

/** The card index holding a slot; -1 when none. */
export function blockIndexOf(blocks: SheetBlock<SheetRow>[], programExerciseId: string): number {
  return blocks.findIndex((b) => b.memberIds.includes(programExerciseId));
}

/**
 * Rows built exercise by exercise → a superset's rows in round order:
 * A1 set 1, A2 set 1, A1 set 2… Ungrouped rows keep their place; within a
 * round the members keep their order.
 */
export function roundOrder<R extends Pick<SheetRow, "group" | "setNumber">>(rows: R[]): R[] {
  const out: R[] = [];
  for (let i = 0; i < rows.length; ) {
    const g = rows[i].group;
    let j = i + 1;
    while (g && j < rows.length && rows[j].group === g) j++;
    const run = rows.slice(i, j);
    out.push(...(g ? run.map((r, k) => ({ r, k })).sort((a, b) => a.r.setNumber - b.r.setNumber || a.k - b.k).map((x) => x.r) : run));
    i = j;
  }
  return out;
}

/** The rows of a slot's whole card: its group's rows, else its own. */
function unitRows<R extends SheetRow>(rows: R[], programExerciseId: string): R[] {
  const g = rows.find((r) => r.programExerciseId === programExerciseId)?.group;
  return rows.filter((r) => (g ? r.group === g : r.programExerciseId === programExerciseId));
}

const ORDINAL = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/**
 * One unique accessible name per row: "Bench back-off set 2", "Bench extra
 * set 4". Exercises that still collide (two slots of the same lift and type)
 * get the slot's order: "Row set 1 (2nd)".
 */
export function rowLabels(rows: SheetRow[], nameOf: (exerciseId: string) => string): Map<string, string> {
  const base = new Map(
    rows.map((r) => [r.key, `${nameOf(r.exerciseId)}${r.extra ? " extra" : r.type === "backoff" ? " back-off" : ""} set ${r.setNumber}`])
  );
  const count = new Map<string, number>();
  for (const l of base.values()) count.set(l, (count.get(l) ?? 0) + 1);
  const slotOrder = new Map<string, string[]>();
  for (const r of rows) {
    const l = base.get(r.key)!;
    if ((count.get(l) ?? 0) < 2) continue;
    const seen = slotOrder.get(l) ?? [];
    if (!seen.includes(r.programExerciseId)) seen.push(r.programExerciseId);
    slotOrder.set(l, seen);
  }
  return new Map(
    rows.map((r) => {
      const l = base.get(r.key)!;
      const order = slotOrder.get(l);
      return [r.key, order ? `${l} (${ORDINAL(order.indexOf(r.programExerciseId) + 1)})` : l];
    })
  );
}

// ---------------------------------------------------------------------------
// Log safety: what's already logged, the "as prescribed" summary, unsaved work
// ---------------------------------------------------------------------------

export interface LoggedMark {
  id: string;
  date: string;
  setCount: number;
}

/** programSessionId → its logs in one program, newest first. Ad-hoc logs (no session) are left out. */
export function loggedBySession(
  logs: { id: string; programId: string; programSessionId?: string | null; date: string; sets: unknown[] }[],
  programId: string
): Map<string, LoggedMark[]> {
  const out = new Map<string, LoggedMark[]>();
  for (const l of logs) {
    if (l.programId !== programId || !l.programSessionId) continue;
    const list = out.get(l.programSessionId) ?? [];
    list.push({ id: l.id, date: l.date.slice(0, 10), setCount: l.sets.length });
    out.set(l.programSessionId, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

export interface PrescribedSummary {
  /** Sets the save would send. */
  sets: number;
  /** Cards (programExerciseIds, sheet order) with a set that would log no kg. */
  missingLoad: string[];
  missingLoadSets: number;
  /** Prescribed sets still without reps — AMRAPs have no count to assume. */
  openAmrap: number;
}

/**
 * What "Did it as prescribed" is about to log. `rows` are the sheet as it will
 * be saved (prescription already filled in). A set has no load when its kg is
 * blank and the exercise isn't bodyweight.
 */
export function prescribedSummary(rows: SheetRow[], isBodyweight: (exerciseId: string) => boolean): PrescribedSummary {
  const missing: string[] = [];
  let missingLoadSets = 0;
  let openAmrap = 0;
  for (const r of rows) {
    if (r.skipped) continue;
    if (!r.extra && isBlank(r.reps)) {
      openAmrap++;
      continue;
    }
    if (!rowFilled(r)) continue;
    if (isBlank(r.weight) && !isBodyweight(r.exerciseId)) {
      missingLoadSets++;
      if (!missing.includes(r.programExerciseId)) missing.push(r.programExerciseId);
    }
  }
  const sets = rowsToSave(rows).filter((r) => r.extra || !isBlank(r.reps)).length;
  return { sets, missingLoad: missing, missingLoadSets, openAmrap };
}

/** Anything the trainer entered that a session change or leaving the page would lose. */
export function isDirty(rows: SheetRow[], notes: string, readiness: ReadinessForm, flags: ExerciseFlags): boolean {
  return (
    notes.trim() !== "" ||
    readinessRated(readiness) ||
    Object.keys(flags).length > 0 ||
    rows.some((r) => r.skipped || r.extra || isSwapped(r) || !isBlank(r.weight) || !isBlank(r.reps) || !isBlank(r.rpe))
  );
}

// ---------------------------------------------------------------------------
// Drafts: the sheet survives a reload, per client and program session
// ---------------------------------------------------------------------------

export interface SheetDraft<R extends SheetRow = SheetRow> {
  rows: R[];
  notes: string;
  readiness: ReadinessForm;
  flags: ExerciseFlags;
  date: string;
  savedAt: string;
}

/** What goes in localStorage. Energy stays a top-level field, as drafts stored it before the readiness strip. */
export function draftJson(d: SheetDraft): string {
  const { readiness, ...rest } = d;
  return JSON.stringify({ ...rest, energy: readiness.energy, readiness: { sleep: readiness.sleep, soreness: readiness.soreness } });
}

export const draftKey = (clientId: string, sessionId: string) => `pt:log-draft:${clientId}:${sessionId}`;

/**
 * A stored draft, if it still fits the session: every prescribed row of the
 * fresh sheet is in it (the program wasn't edited under it). Junk → null.
 */
export function parseDraft<R extends SheetRow>(raw: string | null, fresh: R[]): SheetDraft<R> | null {
  if (!raw) return null;
  let d: { rows?: R[]; notes?: unknown; energy?: unknown; readiness?: unknown; flags?: unknown; date?: unknown; savedAt?: unknown };
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || !Array.isArray(d.rows) || typeof d.notes !== "string" || typeof d.date !== "string") return null;
  const keys = new Set(d.rows.map((r) => r?.key));
  const prescribed = d.rows.filter((r) => !r?.extra);
  if (prescribed.length !== fresh.length || !fresh.every((r) => keys.has(r.key))) return null;
  // Drafts from before the readiness strip carry a bare energy and no flags.
  return {
    rows: d.rows,
    notes: d.notes,
    readiness: parseReadiness(d),
    flags: parseFlags(d.flags),
    date: d.date,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : "",
  };
}

// ---------------------------------------------------------------------------
// Speed: fill down, keyboard order, skipping a whole exercise
// ---------------------------------------------------------------------------

export const isCopied = (r: Pick<SheetRow, "copied">, field: SheetField): boolean => !!r.copied?.includes(field);

/** The cell was typed or stepped: it stops being a copy, so no later fill replaces it. */
export function markTyped<R extends SheetRow>(r: R, field: SheetField): R {
  return isCopied(r, field) ? { ...r, copied: r.copied!.filter((f) => f !== field) } : r;
}

/**
 * Copy a committed cell into the later sets of the same exercise that are
 * blank (or hold an earlier copy). Skipped and extra sets are left alone, and
 * back-off sets too unless the source is a back-off — their load differs by
 * design. A typed cell is never overwritten; a blank source copies nothing.
 */
export function fillDown<R extends SheetRow>(rows: R[], key: string, field: SheetField): R[] {
  const at = rows.findIndex((r) => r.key === key);
  const src = rows[at];
  if (!src || src.skipped || isBlank(src[field])) return rows;
  const value = src[field];
  let changed = false;
  const out = rows.map((r, i) => {
    if (i <= at || r.programExerciseId !== src.programExerciseId) return r;
    if (r.skipped || r.extra || (r.type === "backoff" && src.type !== "backoff")) return r;
    if (!isBlank(r[field]) && !isCopied(r, field)) return r;
    if (r[field] === value && isCopied(r, field)) return r;
    changed = true;
    return { ...r, [field]: value, copied: [...(r.copied ?? []).filter((f) => f !== field), field] };
  });
  return changed ? out : rows;
}

export interface CellRef {
  key: string;
  field: SheetField;
  programExerciseId: string;
}

const FIELDS: SheetField[] = ["weight", "reps", "rpe"];

/** The sheet's cells in Enter order: kg → reps → RPE per set; skipped rows out, no kg on bodyweight moves. */
export function cellOrder(rows: SheetRow[], isBodyweight: (exerciseId: string) => boolean): CellRef[] {
  return rows.flatMap((r) =>
    r.skipped
      ? []
      : FIELDS.filter((f) => f !== "weight" || !isBodyweight(r.exerciseId)).map((field) => ({
          key: r.key,
          field,
          programExerciseId: r.programExerciseId,
        }))
  );
}

/**
 * The cell Enter (dir 1) or Shift+Enter (dir −1) moves to; null past either
 * end. From a cell missing in the order (kg of a bodyweight move), it moves to
 * the row's next listed cell.
 */
export function nextCell(order: CellRef[], key: string, field: SheetField, dir: 1 | -1): CellRef | null {
  let i = order.findIndex((c) => c.key === key && c.field === field);
  if (i < 0) {
    const row = order.findIndex((c) => c.key === key);
    if (row < 0) return null;
    return dir === 1 ? order[row] : order[row - 1] ?? null;
  }
  return order[i + dir] ?? null;
}

export { SKIP_REASONS, type SkipReason } from "@pt/shared";
export const SKIP_REASON_LABEL: Record<SkipReason, string> = { time: "Time", pain: "Pain", equipment: "Equipment", other: "Other" };

/** An extra set in the slot still holds something the trainer entered. */
export const extrasHoldValues = (rows: SheetRow[], programExerciseId: string): boolean =>
  rows.some((r) => r.programExerciseId === programExerciseId && r.extra && (!isBlank(r.weight) || !isBlank(r.reps) || !isBlank(r.rpe)));

/** Skip the exercise: every prescribed set skipped (values kept underneath), extra sets dropped. */
export function skipExercise<R extends SheetRow>(rows: R[], programExerciseId: string): R[] {
  return rows
    .filter((r) => r.programExerciseId !== programExerciseId || !r.extra)
    .map((r) => (r.programExerciseId === programExerciseId ? { ...r, skipped: true, exerciseSkip: { reason: null } } : r));
}

export function setSkipReason<R extends SheetRow>(rows: R[], programExerciseId: string, reason: SkipReason | null): R[] {
  return rows.map((r) => (r.programExerciseId === programExerciseId && r.exerciseSkip ? { ...r, exerciseSkip: { reason } } : r));
}

/**
 * Undo a whole-exercise skip. With `before` (the slot's rows when it was
 * skipped) the rows come back exactly; without (after a reload) every set is
 * simply un-skipped.
 */
export function unskipExercise<R extends SheetRow>(rows: R[], programExerciseId: string, before?: R[]): R[] {
  if (before?.length) {
    if (!rows.some((r) => r.programExerciseId === programExerciseId)) return rows;
    // Rows come back in place (a superset's are interleaved); dropped extras after the card's last row.
    const byKey = new Map(before.map((r) => [r.key, r]));
    const out = rows.map((r) => (r.programExerciseId === programExerciseId ? byKey.get(r.key) ?? { ...r, skipped: false, exerciseSkip: undefined } : r));
    const present = new Set(out.map((r) => r.key));
    const missing = before.filter((r) => !present.has(r.key));
    if (missing.length === 0) return out;
    const unit = unitRows(out, programExerciseId);
    const at = out.lastIndexOf(unit[unit.length - 1]) + 1;
    return [...out.slice(0, at), ...missing, ...out.slice(at)];
  }
  return rows.map((r) =>
    r.programExerciseId === programExerciseId && r.exerciseSkip ? { ...r, skipped: false, exerciseSkip: undefined } : r
  );
}

/** Exercises skipped as a whole, in sheet order. */
export function skippedExercises(rows: SheetRow[]): { programExerciseId: string; exerciseId: string; reason: SkipReason | null }[] {
  const out: { programExerciseId: string; exerciseId: string; reason: SkipReason | null }[] = [];
  for (const r of rows) {
    if (!r.exerciseSkip || out.some((x) => x.programExerciseId === r.programExerciseId)) continue;
    out.push({ programExerciseId: r.programExerciseId, exerciseId: r.exerciseId, reason: r.exerciseSkip.reason });
  }
  return out;
}
