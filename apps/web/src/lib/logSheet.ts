import type { SetType } from "@pt/shared";

/**
 * A log-sheet cell. Svelte number-input binds give a number, or null/undefined
 * once the trainer clears the field — never assume "" means empty.
 */
export type Cell = string | number | null | undefined;

export interface SheetRow {
  key: string;
  exerciseId: string;
  programExerciseId: string;
  setNumber: number;
  type: SetType;
  prescribedReps: number | null;
  weight: Cell;
  reps: Cell;
  rpe: Cell;
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
    const reps = cellNumber(r.reps);
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
