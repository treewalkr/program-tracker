/**
 * Log sheet: readiness (energy, sleep, soreness) and per-exercise flags (pain,
 * technique, skipped + reason). Pure helpers — the page only wires them.
 */
import type { Readiness, SessionFlag } from "@pt/shared";
import type { SheetRow } from "./logSheet";

// ---------------------------------------------------------------------------
// Readiness: three optional taps at the top of the sheet
// ---------------------------------------------------------------------------

/** What the strip holds. Null = not rated; every field is optional. */
export interface ReadinessForm {
  /** Perceived energy 1–10 (stored as `perceivedEnergy`). */
  energy: number | null;
  /** Sleep 1–5 (5 = slept well). */
  sleep: number | null;
  /** Soreness 1–5 (5 = very sore). */
  soreness: number | null;
}

export const EMPTY_READINESS: ReadinessForm = { energy: null, sleep: null, soreness: null };

export const READINESS_SCALES = [
  { field: "energy", label: "Energy", max: 10, low: "flat", high: "great" },
  { field: "sleep", label: "Sleep", max: 5, low: "poor", high: "great" },
  { field: "soreness", label: "Soreness", max: 5, low: "none", high: "very" },
] as const satisfies readonly { field: keyof ReadinessForm; label: string; max: number; low: string; high: string }[];

/** One tap sets a value; tapping it again clears it. */
export const tapScale = (current: number | null, value: number): number | null => (current === value ? null : value);

export const readinessRated = (r: ReadinessForm): boolean => r.energy != null || r.sleep != null || r.soreness != null;

/** The save payload's readiness fields — absent when not rated. */
export function readinessInput(r: ReadinessForm): { perceivedEnergy?: number; readiness?: Readiness } {
  const readiness: Readiness = {};
  if (r.sleep != null) readiness.sleep = r.sleep;
  if (r.soreness != null) readiness.soreness = r.soreness;
  return {
    ...(r.energy != null ? { perceivedEnergy: r.energy } : {}),
    ...(Object.keys(readiness).length > 0 ? { readiness } : {}),
  };
}

const inScale = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max ? v : null;

/** A stored draft's readiness: `energy` was a bare number before the strip; junk reads as unrated. */
export function parseReadiness(raw: { energy?: unknown; readiness?: unknown }): ReadinessForm {
  const r = (raw.readiness && typeof raw.readiness === "object" ? raw.readiness : {}) as Record<string, unknown>;
  return { energy: inScale(raw.energy, 10), sleep: inScale(r.sleep, 5), soreness: inScale(r.soreness, 5) };
}

// ---------------------------------------------------------------------------
// Flags: one per exercise (Pain or Technique, with an optional note)
// ---------------------------------------------------------------------------

export type FlagKind = "pain" | "technique";
export const FLAG_KINDS: readonly FlagKind[] = ["pain", "technique"];
export const FLAG_LABEL: Record<FlagKind, string> = { pain: "Pain", technique: "Technique" };
export const FLAG_NOTE_MAX = 280;

export interface ExerciseFlag {
  kind: FlagKind;
  note: string;
}

/** programExerciseId → its flag. */
export type ExerciseFlags = Record<string, ExerciseFlag>;

/** Pick a kind; picking the same kind again removes the flag (and its note). */
export function toggleFlag(flags: ExerciseFlags, programExerciseId: string, kind: FlagKind): ExerciseFlags {
  const { [programExerciseId]: was, ...rest } = flags;
  if (was?.kind === kind) return rest;
  return { ...rest, [programExerciseId]: { kind, note: was?.note ?? "" } };
}

export function setFlagNote(flags: ExerciseFlags, programExerciseId: string, note: string): ExerciseFlags {
  const was = flags[programExerciseId];
  return was ? { ...flags, [programExerciseId]: { ...was, note: note.slice(0, FLAG_NOTE_MAX) } } : flags;
}

/** A stored draft's flags; anything malformed is dropped. */
export function parseFlags(raw: unknown): ExerciseFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ExerciseFlags = {};
  for (const [pe, f] of Object.entries(raw as Record<string, unknown>)) {
    const v = f as Partial<ExerciseFlag> | null;
    if (!v || !FLAG_KINDS.includes(v.kind as FlagKind)) continue;
    out[pe] = { kind: v.kind as FlagKind, note: typeof v.note === "string" ? v.note.slice(0, FLAG_NOTE_MAX) : "" };
  }
  return out;
}

/**
 * The save payload's flags, in sheet order: each flagged exercise (under the
 * exercise actually logged — a swap counts), then each exercise skipped as a
 * whole with its reason. Flags on slots no longer on the sheet are dropped.
 */
export function sessionFlags(rows: SheetRow[], flags: ExerciseFlags): SessionFlag[] {
  const out: SessionFlag[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.programExerciseId)) continue;
    seen.add(r.programExerciseId);
    const f = flags[r.programExerciseId];
    if (f) {
      const note = f.note.trim().slice(0, FLAG_NOTE_MAX);
      out.push({ programExerciseId: r.programExerciseId, exerciseId: r.exerciseId, kind: f.kind, ...(note ? { note } : {}) });
    }
    if (r.exerciseSkip) {
      const reason = r.exerciseSkip.reason;
      out.push({ programExerciseId: r.programExerciseId, exerciseId: r.exerciseId, kind: "skipped", ...(reason ? { reason } : {}) });
    }
  }
  return out;
}

/** Exercises with pain on this sheet — a Pain flag or a skip for pain — in sheet order. */
export function painExercises(rows: SheetRow[], flags: ExerciseFlags): string[] {
  const out: string[] = [];
  for (const f of sessionFlags(rows, flags)) {
    const pain = f.kind === "pain" || (f.kind === "skipped" && f.reason === "pain");
    if (pain && !out.includes(f.exerciseId)) out.push(f.exerciseId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// History: how a saved log reads back
// ---------------------------------------------------------------------------

/** "Energy 6/10 · Sleep 2/5 · Soreness 4/5"; null when nothing was rated. */
export function readinessLine(log: { perceivedEnergy?: number | null; readiness?: Readiness | null }): string | null {
  const parts = [
    log.perceivedEnergy != null ? `Energy ${log.perceivedEnergy}/10` : null,
    log.readiness?.sleep != null ? `Sleep ${log.readiness.sleep}/5` : null,
    log.readiness?.soreness != null ? `Soreness ${log.readiness.soreness}/5` : null,
  ].filter((x): x is string => x !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const SKIP_WORD: Record<NonNullable<SessionFlag["reason"]>, string> = { time: "time", pain: "pain", equipment: "equipment", other: "other" };

/** One chip per flag: "Pain · Hack Squat", "Skipped · Leg Curl · time", with the note for a title. */
export function flagChips(
  flags: SessionFlag[] | null | undefined,
  nameOf: (exerciseId: string) => string
): { key: string; tone: "bad" | "warn" | "neutral"; text: string; note: string | null }[] {
  return (flags ?? []).map((f, i) => ({
    key: `${f.programExerciseId ?? f.exerciseId}:${f.kind}:${i}`,
    tone: f.kind === "pain" || f.reason === "pain" ? "bad" : f.kind === "technique" ? "warn" : "neutral",
    text: [f.kind === "pain" ? "Pain" : f.kind === "technique" ? "Technique" : "Skipped", nameOf(f.exerciseId), f.reason ? SKIP_WORD[f.reason] : null]
      .filter(Boolean)
      .join(" · "),
    note: f.note ?? null,
  }));
}
