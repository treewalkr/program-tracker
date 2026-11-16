import type { PortalSession, PortalSet } from "@pt/shared";
import type { CardioForm } from "$lib/components/log/CardioLogForm.svelte";
import { readinessInput, parseReadiness, type ReadinessForm } from "$lib/logFlags";
import { asPrescribed, cellNumber, isBlank, rowsToSave, toLoggedSet, type Prescription, type SheetRow } from "$lib/logSheet";
import type { PortalLogInput } from "$lib/api/portalTypes";

/**
 * The portal's log form, pure: a session becomes set rows prefilled with what
 * was prescribed (so "did it as planned" is one tap on Save), cardio becomes
 * its form, and a draft survives a reload on this phone. A set saved untouched
 * goes out marked `asPlanned`, and RPE is never prefilled: the coach only sees
 * effort the client reported.
 */

export interface PortalRow extends SheetRow {
  /** The exercise's name, for superset rounds that mix two lifts on one card. */
  name: string;
  /** What was prescribed for this set; null = an extra set. */
  rx: Prescription | null;
  timed: boolean;
  /** The kg and reps the row opened with; a row still on them (and no RPE) saves as planned. */
  planned?: { weight: string; reps: string };
}

/** One prescribed set as the logger reads it — the API already resolved %1RM to kg. */
export function prescriptionOfPortal(ps: PortalSet): Prescription {
  const rpe = ps.amrap ? (ps.stopRpe ?? ps.targetRpe) : (ps.targetRpe ?? (ps.targetRir != null ? 10 - ps.targetRir : undefined));
  return {
    reps: ps.reps,
    repsMin: ps.repsMin ?? null,
    amrap: ps.amrap,
    durationSeconds: ps.durationSeconds ?? null,
    targetWeightKg: ps.targetWeightKg,
    targetRpe: rpe ?? null,
  };
}

const cell = (v: number | null) => (v == null ? "" : v);

/** Rows for a lifting session, in prescribed order, prefilled as prescribed. */
export function rowsOfSession(session: PortalSession): PortalRow[] {
  return session.exercises.flatMap((e) =>
    e.prescribedSets.map((ps) => {
      const rx = prescriptionOfPortal(ps);
      const bodyweight = e.bodyweight ?? false;
      // no target kg: the client's own last load on this lift, like the trainer's sheet
      const last = ps.lastWeightKg != null ? { date: "", weightKg: ps.lastWeightKg, reps: 0, rpe: null } : null;
      const plan = asPrescribed(rx, { bodyweight, swapped: false, last });
      const weight = cell(plan.weight);
      const reps = cell(plan.reps);
      return {
        key: `${e.id}:${ps.setNumber}`,
        exerciseId: e.exerciseId,
        slotExerciseId: e.exerciseId,
        programExerciseId: e.id,
        setNumber: ps.setNumber,
        type: ps.type,
        prescribedReps: plan.reps,
        weight,
        reps,
        // effort is the client's to report: the target RPE shows beside the cell, never in it
        rpe: "",
        name: e.exerciseName,
        rx,
        timed: ps.durationSeconds != null,
        planned: { weight: String(weight), reps: String(reps) },
        ...(e.group ? { group: e.group } : {}),
      };
    }),
  );
}

/** An extra set after the exercise's last one: empty, nothing prescribed. */
export function extraRow(like: PortalRow, setNumber: number): PortalRow {
  return { ...like, key: `${like.programExerciseId}:x${setNumber}`, setNumber, type: "working", prescribedReps: null, weight: "", reps: "", rpe: "", rx: null, extra: true, copied: undefined, planned: undefined };
}

export function cardioFormOf(c: PortalSession["cardio"]): CardioForm {
  return {
    modality: c?.modality ?? "",
    durationMin: c?.durationMin != null ? String(c.durationMin) : "",
    hrZone: c?.hrZone != null ? String(c.hrZone) : "",
    intensity: c?.intensity ?? "",
    distanceKm: c?.distanceKm != null ? String(c.distanceKm) : "",
    // never the target: RPE is saved only when the client gives it
    rpe: "",
  };
}

export interface PortalLogForm {
  rows: PortalRow[];
  cardio: CardioForm;
  readiness: ReadinessForm;
  notes: string;
  date: string;
}

export type BuildResult =
  | { input: PortalLogInput; sets: number }
  | { error: "nothing" | "activity" }
  /** Weighted sets saved with no kg: how many, and the first one's slot (to page to it). */
  | { error: "kg"; sets: number; programExerciseId: string };

/**
 * Filled sets that would save with no kg on a lift that takes weight. Exempt: bodyweight
 * moves, and timed holds (prescribed in seconds, so the page shows no kg cell). Both are
 * read from the session as well as the rows, so a draft saved by an older version (no
 * `timed` on its rows) still checks right. 0 kg is an answer, not a blank.
 */
export function setsMissingKg(session: PortalSession, rows: readonly PortalRow[]): PortalRow[] {
  const noLoad = new Set(
    session.exercises
      .filter((e) => e.bodyweight || (e.prescribedSets.length > 0 && e.prescribedSets.every((s) => s.durationSeconds != null)))
      .map((e) => e.id),
  );
  return rowsToSave([...rows]).filter((r) => !noLoad.has(r.programExerciseId) && !r.timed && isBlank(r.weight));
}

/** The save payload, or why there's nothing to save yet. */
export function buildPortalLog(session: PortalSession, f: PortalLogForm, replace: boolean): BuildResult {
  const base = {
    programSessionId: session.id,
    date: f.date,
    ...readinessInput(f.readiness),
    notes: f.notes.trim() || undefined,
    ...(replace ? { onDuplicate: "replace" as const } : {}),
  };
  if (session.kind === "cardio") {
    const modality = f.cardio.modality.trim();
    if (!modality) return { error: "activity" };
    return {
      input: {
        ...base,
        kind: "cardio",
        cardio: {
          modality,
          durationMin: cellNumber(f.cardio.durationMin) ?? null,
          hrZone: cellNumber(f.cardio.hrZone) ?? null,
          intensity: f.cardio.intensity.trim() || undefined,
          distanceKm: cellNumber(f.cardio.distanceKm),
          rpe: cellNumber(f.cardio.rpe),
        },
        sets: [],
      },
      sets: 0,
    };
  }
  const saved = rowsToSave(f.rows);
  if (saved.length === 0) return { error: "nothing" };
  const missing = setsMissingKg(session, saved);
  if (missing.length > 0) return { error: "kg", sets: missing.length, programExerciseId: missing[0].programExerciseId };
  return { input: { ...base, kind: "lifting", sets: saved.map(portalSet) }, sets: saved.length };
}

/** Untouched since the page opened it: still on the prefilled kg and reps, no RPE given. */
export const savedAsPlanned = (r: PortalRow): boolean =>
  r.planned != null && String(r.weight) === r.planned.weight && String(r.reps) === r.planned.reps && isBlank(r.rpe);

function portalSet(r: PortalRow) {
  const set = toLoggedSet(r);
  return savedAsPlanned(r) ? { ...set, asPlanned: true } : set;
}

// ---------------------------------------------------------------------------
// Draft: this phone keeps the half-filled form until it's saved
// ---------------------------------------------------------------------------

export const portalDraftKey = (sessionId: string) => `pt:portal-log-draft:${sessionId}`;

export function portalDraftJson(f: PortalLogForm): string {
  return JSON.stringify({ ...f, savedAt: new Date().toISOString() });
}

/** A stored draft, if it still fits the session (every prescribed row still there). Junk → null. */
export function parsePortalDraft(raw: string | null, fresh: PortalRow[]): PortalLogForm | null {
  if (!raw) return null;
  let d: Partial<PortalLogForm> & { readiness?: unknown };
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || !Array.isArray(d.rows) || typeof d.notes !== "string" || typeof d.date !== "string" || !d.cardio) return null;
  const keys = new Set(d.rows.map((r) => r?.key));
  if (d.rows.filter((r) => !r?.extra).length !== fresh.length || !fresh.every((r) => keys.has(r.key))) return null;
  const r = (d.readiness ?? {}) as Record<string, unknown>;
  return {
    rows: d.rows,
    cardio: d.cardio,
    notes: d.notes,
    date: d.date,
    readiness: parseReadiness({ energy: r.energy, readiness: r }),
  };
}

// ---------------------------------------------------------------------------
// Pristine vs touched: what the client actually changed
// ---------------------------------------------------------------------------

const rowSig = (r: PortalRow) => [r.key, String(r.weight), String(r.reps), String(r.rpe)];

/** True when the form is exactly what the page opened with — nothing to keep as a draft. */
export function sameForm(a: PortalLogForm, b: PortalLogForm): boolean {
  const sig = (f: PortalLogForm) => JSON.stringify([f.rows.map(rowSig), f.cardio, f.readiness, f.notes.trim(), f.date]);
  return sig(a) === sig(b);
}

/** Exercises (by programExerciseId) whose sets differ from the prefill, or got an extra set. */
export function touchedExercises(pristine: readonly PortalRow[], rows: readonly PortalRow[]): Set<string> {
  const before = new Map(pristine.map((r) => [r.key, rowSig(r).join("|")]));
  const out = new Set<string>();
  for (const r of rows) if (before.get(r.key) !== rowSig(r).join("|")) out.add(r.programExerciseId);
  return out;
}
