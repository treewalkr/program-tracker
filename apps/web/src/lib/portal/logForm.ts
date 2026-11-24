import { localDateOf, mainWork, movementPrep, PortalWeek, PortalWeekDto, sessionDateIn, type PortalExercise, type PortalLogEntry, type PortalSession, type PortalSet } from "@pt/shared";
import { cardioFormOf as planForm, cardioFormOfLog, cardioLogOf, readCardioForm, type CardioForm, type CardioFormError } from "$lib/cardioForm";
import { EMPTY_READINESS, parseFlags, readinessInput, parseReadiness, sessionFlags, type ExerciseFlags, type ReadinessForm } from "$lib/logFlags";
import { asPrescribed, cellNumber, isBlank, rowsToSave, setSkipReason, skipExercise, toLoggedSet, withExtraSet, type Prescription, type SheetRow } from "$lib/logSheet";
import type { PortalLogInput } from "$lib/api/portalTypes";
import { asSent, draftLoad, savedLoad, startLoad, type LoadMode } from "$lib/loadMode";

export { setLoad, startLoad, type LoadMode } from "$lib/loadMode";

/**
 * The portal's log form, pure: a session becomes set rows prefilled with what
 * was prescribed (so "did it as planned" is one tap on Save), cardio becomes
 * its form, and a draft survives a reload on this phone. A set saved untouched
 * goes out marked `asPlanned`, and RPE is never prefilled: the coach only sees
 * effort the client reported. Movement prep is a checklist, never rows: the
 * one-tap save writes main sets only.
 */

export interface PortalRow extends SheetRow {
  /** The exercise's name, for superset rounds that mix two lifts on one card. */
  name: string;
  /** What was prescribed for this set; null = an extra set. */
  rx: Prescription | null;
  timed: boolean;
  /** Bodyweight or with load (ignored on a timed set). Older drafts lack it: `parsePortalDraft` fills it in. */
  load: LoadMode;
  /** The member switched this set's mode by hand: a switch on an earlier set no longer carries to it. */
  loadPicked?: boolean;
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

/** Rows for a exercise session's main work, in prescribed order, prefilled as prescribed (prep is a checklist). */
export function rowsOfSession(session: PortalSession): PortalRow[] {
  return mainWork(session.exercises).flatMap((e) =>
    e.prescribedSets.map((ps) => {
      const rx = prescriptionOfPortal(ps);
      const bodyweight = e.bodyweight ?? false;
      // no target kg: the client's own last load on this lift, like the trainer's sheet
      const last = ps.lastWeightKg != null ? { date: "", weightKg: ps.lastWeightKg, reps: 0, rpe: null } : null;
      const load = ps.durationSeconds != null ? "kg" : startLoad(e, ps);
      const plan = asPrescribed(rx, { bodyweight: bodyweight || load === "bw", swapped: false, last });
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
        load,
        planned: { weight: String(weight), reps: String(reps) },
        ...(e.group ? { group: e.group } : {}),
      };
    }),
  );
}

/** An extra set after the exercise's last one: empty, nothing prescribed. */
export function extraRow(like: PortalRow, setNumber: number): PortalRow {
  return { ...like, key: `${like.programExerciseId}:x${setNumber}`, setNumber, type: "working", prescribedReps: null, weight: "", reps: "", rpe: "", rx: null, extra: true, copied: undefined, loadPicked: undefined, planned: undefined };
}

/** The cardio form for a session: the plan's modality, time and distance (never the RPE). */
export function cardioFormOf(c: PortalSession["cardio"]): CardioForm {
  return planForm(c);
}

/**
 * Rows for the client's own saved log: each prescribed set shows what was saved
 * (a set left out reopens as missed), sets added on the day come back as extras.
 * A set saved as planned stays planned until it's edited.
 */
export function rowsOfEntry(session: PortalSession, entry: PortalLogEntry): PortalRow[] {
  const saved = new Map(entry.sets.map((s) => [`${s.programExerciseId}:${s.setNumber}`, s]));
  const used = new Set<string>();
  const out: PortalRow[] = [];
  const fill = (r: PortalRow, s: PortalLogEntry["sets"][number]): PortalRow => {
    const weight = s.weightKg ?? "";
    // no kg on a set with reps was done at bodyweight
    const load: LoadMode = r.timed ? r.load : savedLoad(s.weightKg);
    return { ...r, weight, reps: s.reps, rpe: s.rpe ?? "", load, planned: s.asPlanned ? { weight: String(weight), reps: String(s.reps) } : undefined };
  };
  const base = rowsOfSession(session);
  for (const [i, r] of base.entries()) {
    const key = `${r.programExerciseId}:${r.setNumber}`;
    const s = saved.get(key);
    if (s) used.add(key);
    out.push(s ? fill(r, s) : { ...r, skipped: true, planned: undefined });
    // after an exercise's last prescribed set: what the client added on the day
    if (base[i + 1]?.programExerciseId !== r.programExerciseId) {
      for (const x of entry.sets) {
        const k = `${x.programExerciseId}:${x.setNumber}`;
        if (x.programExerciseId !== r.programExerciseId || used.has(k)) continue;
        used.add(k);
        out.push(fill(extraRow(r, x.setNumber), x));
      }
    }
  }
  return out;
}

export interface PortalLogForm {
  rows: PortalRow[];
  cardio: CardioForm;
  readiness: ReadinessForm;
  notes: string;
  date: string;
  /** "Something hurt" per exercise (programExerciseId → flag), the trainer sheet's vocabulary. */
  flags: ExerciseFlags;
  /** When the client first changed anything (ISO), for the session's duration. */
  startedAt?: string | null;
  /** Movement-prep items ticked (program-exercise ids). */
  prepDone?: string[];
}

/** The session's prep items ticked in `done`, in session order (stale ids dropped). */
export function prepTicked(session: Pick<PortalSession, "exercises">, done: readonly string[] | undefined): string[] {
  const on = new Set(done ?? []);
  return movementPrep(session.exercises).map((e) => e.id).filter((id) => on.has(id));
}

/** "Save · 12 sets · prep 3/4" parts: main sets the save writes, prep ticked of all. Null prep = the session has none. */
export function saveSummary(session: PortalSession, f: Pick<PortalLogForm, "rows" | "prepDone">): { sets: number; prep: { done: number; total: number } | null } {
  const total = movementPrep(session.exercises).length;
  return {
    sets: session.kind === "cardio" ? 0 : rowsToSave([...f.rows]).length,
    prep: total > 0 && session.kind !== "cardio" ? { done: prepTicked(session, f.prepDone).length, total } : null,
  };
}

/** Under this, the form was filled in after the session, not during it. */
const LIVE_MIN = 5;
const LIVE_MAX = 300;

/** Minutes from the first entry to Save — only for a session logged live today. */
export function durationOf(f: Pick<PortalLogForm, "startedAt" | "date">, now: number): number | null {
  if (!f.startedAt || f.date !== localDateOf(now)) return null;
  const min = Math.round((now - Date.parse(f.startedAt)) / 60_000);
  return Number.isFinite(min) && min >= LIVE_MIN && min <= LIVE_MAX ? min : null;
}

export type BuildResult =
  | { input: PortalLogInput; sets: number }
  | { error: "nothing" | "activity" | Exclude<CardioFormError, "modality"> }
  /** Weighted sets saved with no kg: how many, and the first one's slot (to page to it). */
  | { error: "kg"; sets: number; programExerciseId: string };

/**
 * Filled sets left in kg mode with no kg. Exempt: BW sets (no load is their answer), and
 * timed holds (prescribed in seconds, so the page shows no kg cell), read from the session
 * as well as the rows, so a draft saved by an older version (no `timed` on its rows) still
 * checks right. 0 kg is an answer, not a blank.
 */
export function setsMissingKg(session: PortalSession, rows: readonly PortalRow[]): PortalRow[] {
  const timed = new Set(
    session.exercises.filter((e) => e.prescribedSets.length > 0 && e.prescribedSets.every((s) => s.durationSeconds != null)).map((e) => e.id),
  );
  return rowsToSave([...rows]).filter((r) => r.load !== "bw" && !timed.has(r.programExerciseId) && !r.timed && isBlank(r.weight));
}

/** The save payload, or why there's nothing to save yet. */
export function buildPortalLog(session: PortalSession, f: PortalLogForm, replace: boolean, now = Date.now()): BuildResult {
  const durationMin = durationOf(f, now);
  const base = {
    programSessionId: session.id,
    date: f.date,
    ...(durationMin != null ? { durationMin } : {}),
    ...readinessInput(f.readiness),
    notes: f.notes.trim() || undefined,
    ...(replace ? { onDuplicate: "replace" as const } : {}),
  };
  if (session.kind === "cardio") {
    const built = cardioLogOf(f.cardio);
    if ("error" in built) return { error: built.error === "modality" ? "activity" : built.error };
    return {
      input: {
        ...base,
        kind: "cardio",
        cardio: built.cardio,
        sets: [],
      },
      sets: 0,
    };
  }
  const saved = rowsToSave(f.rows.map(asSent));
  if (saved.length === 0) return { error: "nothing" };
  const missing = setsMissingKg(session, saved);
  if (missing.length > 0) return { error: "kg", sets: missing.length, programExerciseId: missing[0].programExerciseId };
  // pain and whole-exercise skips: the same flags the trainer's sheet sends, so the pain signal fires
  const flags = sessionFlags(f.rows, f.flags ?? {});
  const prepDone = prepTicked(session, f.prepDone);
  return {
    input: { ...base, kind: "exercises", sets: saved.map(portalSet), ...(flags.length ? { flags } : {}), ...(prepDone.length ? { prepDone } : {}) },
    sets: saved.length,
  };
}

/** Untouched since the page opened it: still on the prefilled kg and reps, no RPE given. */
export const savedAsPlanned = (r: PortalRow): boolean =>
  r.planned != null && String(r.weight) === r.planned.weight && String(r.reps) === r.planned.reps && isBlank(r.rpe);

function portalSet(r: PortalRow) {
  const set = toLoggedSet(r);
  return savedAsPlanned(r) ? { ...set, asPlanned: true } : set;
}

/** The form the page opens with: the client's own saved log when there is one, else the plan. */
/**
 * The date a new log opens on: the planned day when it has already passed this
 * week (a Tuesday run logged on Thursday was done Tuesday, most likely), else today.
 */
export function defaultLogDate(session: Pick<PortalSession, "weekday">, weekStart: string | null, today: string): string {
  if (!weekStart || !session.weekday) return today;
  const planned = sessionDateIn(weekStart, session.weekday);
  return planned < today ? planned : today;
}

export function formOfSession(session: PortalSession, today: string): PortalLogForm {
  const entry = session.log?.loggedBy === "client" ? session.log.entry : undefined;
  if (!entry) return { rows: rowsOfSession(session), cardio: cardioFormOf(session.cardio), readiness: { ...EMPTY_READINESS }, notes: "", date: today, flags: {}, prepDone: [] };
  let rows = session.kind === "cardio" ? rowsOfSession(session) : rowsOfEntry(session, entry);
  const flags: ExerciseFlags = {};
  for (const fl of entry.flags ?? []) {
    const pe = fl.programExerciseId;
    if (!pe) continue;
    if (fl.kind === "skipped") rows = setSkipReason(skipExercise(rows, pe), pe, fl.reason ?? null);
    else flags[pe] = { kind: fl.kind, note: fl.note ?? "" };
  }
  return {
    rows,
    flags,
    cardio: entry.cardio ? cardioFormOfLog(entry.cardio, session.cardio) : cardioFormOf(session.cardio),
    readiness: parseReadiness({ energy: entry.perceivedEnergy, readiness: entry.readiness }),
    notes: entry.notes ?? "",
    date: session.log?.date ?? today,
    // an older log with sets on a slot that's prep now reopens as that item ticked
    prepDone: prepTicked(session, [...(entry.prepDone ?? []), ...entry.sets.flatMap((s) => (s.programExerciseId ? [s.programExerciseId] : []))]),
  };
}

// ---------------------------------------------------------------------------
// Draft: this phone keeps the half-filled form until it's saved
// ---------------------------------------------------------------------------

/** A draft is the member's own: kept under their id, so another member on this phone never opens it. */
export const portalDraftKey = (clientId: string, sessionId: string) => `pt:portal-log-draft:${clientId}:${sessionId}`;

/** An older build kept drafts by session alone. */
const legacyDraftKey = (sessionId: string) => `pt:portal-log-draft:${sessionId}`;

/**
 * This member's stored draft for a session. An older build's draft (by session alone) moves
 * to the member's key: a program session is one member's, and the page only opens sessions
 * from that member's own week, so it can only be theirs.
 */
export function readPortalDraft(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, clientId: string, sessionId: string): string | null {
  try {
    const key = portalDraftKey(clientId, sessionId);
    const own = storage.getItem(key);
    const old = storage.getItem(legacyDraftKey(sessionId));
    if (old == null) return own;
    if (own == null) storage.setItem(key, old);
    storage.removeItem(legacyDraftKey(sessionId));
    return own ?? old;
  } catch {
    return null;
  }
}

export function portalDraftJson(f: PortalLogForm): string {
  return JSON.stringify({ ...f, savedAt: new Date().toISOString() });
}

/**
 * A stored draft over the session as it is now. Junk → null. When the coach changed the
 * session since (a set or exercise added or removed, a target changed), what still
 * matches by row key is kept on the fresh rows, extras on exercises still there come
 * back, notes, readiness and flags stay, and `merged` says the session moved under it.
 */
export function parsePortalDraft(raw: string | null, fresh: PortalRow[], freshCardio?: CardioForm): (PortalLogForm & { merged: boolean }) | null {
  if (!raw) return null;
  let d: Partial<PortalLogForm> & { readiness?: unknown };
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || !Array.isArray(d.rows) || typeof d.notes !== "string" || typeof d.date !== "string" || !d.cardio) return null;
  const stored = d.rows.filter((row): row is PortalRow => !!row && typeof row.key === "string").map((row) => draftLoad(row, fresh));
  const { rows, merged, swapped } = mergeDraftRows(stored, fresh);
  const r = (d.readiness ?? {}) as Record<string, unknown>;
  const peIds = new Set(fresh.map((x) => x.programExerciseId));
  const flags = Object.fromEntries(Object.entries(parseFlags(d.flags)).filter(([pe]) => (fresh.length === 0 || peIds.has(pe)) && !swapped.has(pe)));
  return {
    flags,
    startedAt: typeof d.startedAt === "string" && !Number.isNaN(Date.parse(d.startedAt)) ? d.startedAt : null,
    rows,
    // an older build's minutes/zone strings read as the current form
    cardio: readCardioForm(d.cardio, freshCardio),
    notes: d.notes,
    date: d.date,
    readiness: parseReadiness({ energy: r.energy, readiness: r }),
    prepDone: Array.isArray(d.prepDone) ? d.prepDone.filter((x): x is string => typeof x === "string") : [],
    merged,
  };
}

/** What a set's prescription looks like to the member: changed here means the coach edited it. */
const rxSig = (r: PortalRow) => JSON.stringify([r.name, r.type, r.prescribedReps, r.rx, r.planned ?? null, r.timed ?? false, r.group ?? null]);

/** One stored row's entries on the fresh row: a set left as planned takes the coach's new target. */
function overlay(fresh: PortalRow, was: PortalRow): PortalRow {
  // the coach swapped the exercise in this slot (same program-exercise id): a new slot, nothing carries
  if (swappedIn(fresh, was)) return fresh;
  if (rxSig(fresh) === rxSig(was)) return was;
  const kept = { exerciseId: was.exerciseId, rpe: was.rpe, skipped: was.skipped, exerciseSkip: was.exerciseSkip, loadPicked: was.loadPicked, load: was.loadPicked ? was.load : fresh.load };
  const asPlanned = !!was.planned && String(was.weight) === was.planned.weight && String(was.reps) === was.planned.reps;
  if (asPlanned) return { ...fresh, ...kept };
  return { ...fresh, ...kept, load: was.load, weight: was.weight, reps: was.reps, copied: was.copied, planned: undefined };
}

/**
 * The coach put another exercise in this row's slot. The portal has no swap of its own, so
 * a stored row's exercise is always its slot's: any difference is the coach's.
 */
const swappedIn = (fresh: PortalRow, was: PortalRow) => !!was.exerciseId && fresh.exerciseId !== was.exerciseId;

/**
 * Stored rows over fresh ones by key; extras on exercises still there follow their exercise.
 * `swapped`: program-exercise ids whose exercise the coach changed (their skips, extras and flags go).
 */
export function mergeDraftRows(stored: PortalRow[], fresh: PortalRow[]): { rows: PortalRow[]; merged: boolean; swapped: Set<string> } {
  const byKey = new Map(stored.filter((r) => !r.extra).map((r) => [r.key, r]));
  const base = stored.filter((r) => !r.extra);
  const sameShape = base.length === fresh.length && fresh.every((r) => byKey.has(r.key));
  const changed = !sameShape || fresh.some((r) => rxSig(r) !== rxSig(byKey.get(r.key)!));
  if (!changed) return { rows: stored, merged: false, swapped: new Set() };
  const swapped = new Set(fresh.filter((f) => byKey.has(f.key) && swappedIn(f, byKey.get(f.key)!)).map((f) => f.programExerciseId));
  // a whole-exercise skip covers the coach's new sets on that exercise too
  const skipOf = new Map(base.filter((r) => r.exerciseSkip && !swapped.has(r.programExerciseId)).map((r) => [r.programExerciseId, r.exerciseSkip]));
  let rows = fresh.map((f) => {
    const was = byKey.get(f.key);
    const row = was ? overlay(f, was) : f;
    const skip = skipOf.get(f.programExerciseId);
    return skip && !row.exerciseSkip ? { ...row, exerciseSkip: skip } : row;
  });
  const peIds = new Set(fresh.map((r) => r.programExerciseId));
  for (const x of stored.filter((r) => r.extra && peIds.has(r.programExerciseId) && !swapped.has(r.programExerciseId))) {
    rows = withExtraSet(rows, x.programExerciseId, (n) => ({ ...x, key: `${x.programExerciseId}:x${n}`, setNumber: n }));
  }
  return { rows, merged: true, swapped };
}

// ---------------------------------------------------------------------------
// Pristine vs touched: what the client actually changed
// ---------------------------------------------------------------------------

const rowSig = (r: PortalRow) => [r.key, r.timed ? "" : r.load, String(r.weight), String(r.reps), String(r.rpe), r.skipped ? "missed" : "", r.exerciseSkip ? `skip:${r.exerciseSkip.reason ?? ""}` : ""];

/** True when the form is exactly what the page opened with — nothing to keep as a draft. */
export function sameForm(a: PortalLogForm, b: PortalLogForm): boolean {
  const sig = (f: PortalLogForm) => {
    const flags = Object.entries(f.flags ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.kind, v.note.trim()]);
    return JSON.stringify([f.rows.map(rowSig), f.cardio, f.readiness, f.notes.trim(), f.date, flags, [...(f.prepDone ?? [])].sort()]);
  };
  return sig(a) === sig(b);
}

/** Exercises (by programExerciseId) whose sets differ from the prefill, or got an extra set. */
export function touchedExercises(pristine: readonly PortalRow[], rows: readonly PortalRow[]): Set<string> {
  const before = new Map(pristine.map((r) => [r.key, rowSig(r).join("|")]));
  const out = new Set<string>();
  for (const r of rows) if (before.get(r.key) !== rowSig(r).join("|")) out.add(r.programExerciseId);
  return out;
}

// ---------------------------------------------------------------------------
// Offline: the week last opened on this phone, so a dropped connection mid-workout
// can still open the session and finish the form (the save waits for a connection)
// ---------------------------------------------------------------------------

export const PORTAL_WEEK_CACHE_KEY = "pt:portal-week";

/** The copies are the member's: kept with their id, opened only for them. */
export const portalWeekCacheJson = (w: PortalWeek, clientId: string): string => JSON.stringify({ clientId, data: w });

/** The whole week page as last loaded on this phone, so the home page opens offline too. */
export const PORTAL_WEEK_DTO_CACHE_KEY = "pt:portal-week-dto";

export const portalWeekDtoCacheJson = (d: PortalWeekDto, clientId: string): string => JSON.stringify({ clientId, data: d });

/** A stored copy's data, when it was kept for this member; another member's (or an older build's, kept without one) → undefined. */
function copyOf(raw: string | null, clientId: string): unknown {
  if (!raw) return undefined;
  try {
    const c = JSON.parse(raw) as { clientId?: unknown; data?: unknown } | null;
    return c && typeof c === "object" && c.clientId === clientId ? c.data : undefined;
  } catch {
    return undefined;
  }
}

/** This member's cached week page whose loggable week is still on; anything else → null. */
export function cachedWeekDto(raw: string | null, today: string, clientId: string): PortalWeekDto | null {
  const parsed = copyOf(raw, clientId);
  if (parsed === undefined) return null;
  const d = PortalWeekDto.safeParse(parsed);
  if (!d.success) return null;
  const on = d.data.weeks.find((w) => w.loggable);
  return on && on.endDate >= today ? d.data : null;
}

/** This member's cached week and one of its sessions, while that week is still on; anything else → null. */
export function cachedSession(raw: string | null, sessionId: string, today: string, clientId: string): { week: PortalWeek; session: PortalSession } | null {
  const parsed = copyOf(raw, clientId);
  if (parsed === undefined) return null;
  const w = PortalWeek.safeParse(parsed);
  if (!w.success || !w.data.loggable || w.data.endDate < today) return null;
  const session = w.data.sessions.find((s) => s.id === sessionId);
  return session ? { week: w.data, session } : null;
}
