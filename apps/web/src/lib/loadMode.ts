import type { Equipment } from "@pt/shared";
import { isBlank, type Cell, type SheetField } from "./logSheet";

/**
 * One set's load mode, shared by the member's log and the trainer's sheet.
 * The load cell is external weight held or added (`kg`), or none (`bw`). A BW
 * set saves with no kg; the kg typed before a switch to BW stays on the row,
 * hidden, so switching back brings it back.
 */
export type LoadMode = "bw" | "kg";

/**
 * Equipment that can't be used without a load: a stack, a cable, a bar, plates.
 * A blank kg last time there was a missed entry, not a bodyweight set.
 */
export const ALWAYS_LOADED: readonly Equipment[] = ["barbell", "machine", "cable", "plate_loaded"];

export interface LoadStart {
  /** The library marks the move bodyweight. */
  bodyweight?: boolean;
  equipment?: Equipment | null;
  /** The client's last time on it. */
  last?: { weightKg: number | null } | null;
}

/**
 * The mode a set opens in: kg when the coach set a load; else BW for a bodyweight
 * move in the library, or when last time carried no load (free weights only);
 * else kg.
 */
export function startLoad(e: LoadStart, ps: { targetWeightKg?: number | null }): LoadMode {
  if (ps.targetWeightKg != null && ps.targetWeightKg > 0) return "kg";
  if (e.bodyweight) return "bw";
  const loaded = e.equipment != null && ALWAYS_LOADED.includes(e.equipment);
  if (!loaded && e.last && !(e.last.weightKg != null && e.last.weightKg > 0)) return "bw";
  return "kg";
}

/** What the mode logic reads off a row, on either page. */
export interface LoadRow {
  key: string;
  programExerciseId: string;
  setNumber: number;
  weight: Cell;
  /** Timed holds keep a plain kg cell: no mode switch. */
  timed?: boolean;
  load?: LoadMode;
  /** Switched by hand: a switch on an earlier set no longer carries to it. */
  loadPicked?: boolean;
  /** The member's prefill: a kg still on it counts as untouched. */
  planned?: { weight: string };
  /** The trainer's fill-down: a copied kg counts as untouched. */
  copied?: SheetField[];
}

/** Still as the page opened it: no mode picked by hand, no kg typed over the prefill. */
const loadUntouched = (r: LoadRow) =>
  !r.loadPicked && (r.planned ? String(r.weight) === r.planned.weight : isBlank(r.weight) || !!r.copied?.includes("weight"));

/**
 * Switch one set to BW or kg. The same exercise's later sets nobody has touched
 * follow, so one tap in a circuit's Set 1 covers the rounds after it.
 */
export function setLoad<R extends LoadRow>(rows: readonly R[], key: string, mode: LoadMode): R[] {
  const at = rows.find((r) => r.key === key);
  if (!at) return [...rows];
  return rows.map((r) => {
    if (r.key === key) return { ...r, load: mode, loadPicked: true };
    const later = r.programExerciseId === at.programExerciseId && r.setNumber > at.setNumber && !r.timed;
    return later && r.load !== mode && loadUntouched(r) ? { ...r, load: mode } : r;
  });
}

/** A BW set: no kg logged. A timed hold keeps its kg cell whatever its mode. */
export const isBwSet = (r: Pick<LoadRow, "load" | "timed">): boolean => r.load === "bw" && !r.timed;

/** The row as it saves: a BW set carries no kg, whatever was typed before the switch. */
export const asSent = <R extends LoadRow>(r: R): R => (isBwSet(r) && !isBlank(r.weight) ? { ...r, weight: "" } : r);

/** A saved set's mode when a log reopens: no kg means it was done at bodyweight. */
export const savedLoad = (weightKg: number | null | undefined): LoadMode => (weightKg == null ? "bw" : "kg");

/** A draft row's mode; an older build's row has none: a typed kg is kg, else as the fresh sheet opens it. */
export function draftLoad<R extends LoadRow>(r: R, fresh: readonly LoadRow[]): R {
  if (r.load === "bw" || r.load === "kg") return r;
  const like = fresh.find((x) => x.key === r.key) ?? fresh.find((x) => x.programExerciseId === r.programExerciseId);
  return { ...r, load: !isBlank(r.weight) ? "kg" : (like?.load ?? "kg") };
}

/** Re-run the opening rule on one exercise's sets nobody switched by hand (after a swap). */
export function restartLoads<R extends LoadRow>(rows: readonly R[], programExerciseId: string, start: (r: R) => LoadMode): R[] {
  return rows.map((r) => (r.programExerciseId === programExerciseId && !r.timed && !r.loadPicked ? { ...r, load: start(r) } : r));
}
