import { resolveLoadKg, type PrescribedSet, type SetType } from "@pt/shared";

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
}

export type SheetField = "weight" | "reps" | "rpe";
export type FieldErrors = Record<string, Partial<Record<SheetField, string>>>;

/** One short message per field, shared by client checks and server 422s. */
const MSG: Record<SheetField, string> = { weight: "kg 0–600", reps: "Reps 0–200", rpe: "RPE is 1–10" };

export const isBlank = (v: Cell): boolean => v == null || (typeof v === "string" && v.trim() === "");

/** Blank → undefined; anything else → number (NaN for junk, caught by validateRows). */
export const cellNumber = (v: Cell): number | undefined => (isBlank(v) ? undefined : Number(v));

/** A row counts toward the log once reps or kg is entered (0 counts — a missed set). */
export const rowFilled = (r: SheetRow): boolean => !isBlank(r.reps) || !isBlank(r.weight);

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

/** Insert an extra set after the slot's last row, numbered after its highest set. */
export function withExtraSet<R extends SheetRow>(rows: R[], programExerciseId: string, make: (setNumber: number) => R): R[] {
  const slot = rows.filter((r) => r.programExerciseId === programExerciseId);
  const next = Math.max(0, ...slot.map((r) => r.setNumber)) + 1;
  if (next > MAX_SETS) return rows;
  const at = rows.lastIndexOf(slot[slot.length - 1]) + 1;
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
    r.programExerciseId === programExerciseId && r.exerciseId !== exerciseId ? { ...r, exerciseId, weight: null } : r
  );
}

/** ± stepper: from the value, or from `from` (the target) when blank; clamped, rounded to 0.01. */
export function stepCell(v: Cell, delta: number, o: { min: number; max: number; from?: number | null }): number {
  const n = cellNumber(v);
  const start = n !== undefined && Number.isFinite(n) ? n : o.from ?? 0;
  const next = Math.round((start + delta) * 100) / 100;
  return Math.min(o.max, Math.max(o.min, next));
}

/** Consecutive rows of one slot — an exercise card. */
export function blocksOf<R extends SheetRow>(rows: R[]): { programExerciseId: string; rows: R[] }[] {
  const out: { programExerciseId: string; rows: R[] }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last?.programExerciseId === r.programExerciseId) last.rows.push(r);
    else out.push({ programExerciseId: r.programExerciseId, rows: [r] });
  }
  return out;
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
