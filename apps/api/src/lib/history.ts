import type { SessionLogRow, SetLogRow } from "@pt/db";
import { estimate1rm } from "@pt/shared";
import type { ExerciseHistoryEntry } from "../ai/prompt";

export interface HistoryInput {
  logs: SessionLogRow[];
  sets: SetLogRow[];
  catalog: { id: string; name: string }[];
  /** Max recent sets listed per exercise. */
  perExercise?: number;
  /** Exercises prescribed as timed holds — their `reps` are seconds (see timedIdsOf). */
  timedExerciseIds?: Set<string>;
  /** Program-exercise slots prescribed as timed holds (covers swapped-in exercises). */
  timedSlotIds?: Set<string>;
}

const DEFAULT_PER_EXERCISE = 6;

/** A set's `reps` are seconds when its exercise or the slot it was logged against is timed. */
function isTimedSet(set: { exerciseId: string; programExerciseId?: string | null }, ids?: Set<string>, slots?: Set<string>): boolean {
  return (ids?.has(set.exerciseId) ?? false) || (set.programExerciseId != null && (slots?.has(set.programExerciseId) ?? false));
}

/**
 * Group logged sets (working and back-off) per exercise: recent set strings (oldest→newest)
 * plus best estimated 1RM. Shared by the AI prompt context and the trainer
 * history endpoint.
 */
export function buildHistory({
  logs,
  sets,
  catalog,
  perExercise = DEFAULT_PER_EXERCISE,
  timedExerciseIds,
  timedSlotIds,
}: HistoryInput): ExerciseHistoryEntry[] {
  const logIds = new Set(logs.map((l) => l.id));
  const nameById = new Map(catalog.map((e) => [e.id, e.name]));

  const byExercise = new Map<string, { name: string; sets: string[]; best: number }>();

  for (const set of sets) {
    if (!logIds.has(set.sessionLogId)) continue;
    const name = nameById.get(set.exerciseId);
    if (!name) continue; // exercise outside trainer's catalog — ignore

    const weight = set.weightKg ? Number(set.weightKg) : 0;
    const rpe = set.rpe ? Number(set.rpe) : null;
    const timed = isTimedSet(set, timedExerciseIds, timedSlotIds);
    const entry = byExercise.get(set.exerciseId) ?? { name, sets: [], best: 0 };
    entry.sets.push(`${weight ? `${weight}kg × ` : ""}${set.reps}${timed ? " s" : ""}${rpe !== null ? ` @ RPE ${rpe}` : ""}`);
    if (!timed) entry.best = Math.max(entry.best, estimate1rm(weight, set.reps));
    byExercise.set(set.exerciseId, entry);
  }

  return [...byExercise.entries()].map(([id, h]) => ({
    exerciseName: h.name,
    exerciseId: id,
    recentSets: h.sets.slice(-perExercise),
    bestE1rm: h.best,
  }));
}

// ---------------------------------------------------------------------------
// Dated training log — what the AI chat and drafting prompts are grounded in (F11)
// ---------------------------------------------------------------------------

/**
 * Prompt budget for the dated training log. Newest weeks render set by set;
 * when the full log would exceed this, older weeks collapse into per-lift
 * best/total summary lines (and, past that, are dropped with a note).
 */
export const HISTORY_TOKEN_BUDGET = 4000;

/** Rough token count (~4 chars per token) — good enough for a budget guard. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TrainingLogInput {
  logs: Pick<SessionLogRow, "id" | "date" | "kind" | "cardio" | "programSessionId">[];
  sets: (Pick<SetLogRow, "sessionLogId" | "exerciseId" | "setNumber" | "type" | "weightKg" | "reps" | "rpe"> &
    Partial<Pick<SetLogRow, "programExerciseId">>)[];
  catalog: { id: string; name: string }[];
  /** Exercises prescribed as timed holds — their `reps` are seconds. */
  timedExerciseIds?: Set<string>;
  /** Program-exercise slots prescribed as timed holds (covers swapped-in exercises). */
  timedSlotIds?: Set<string>;
  /** programSessionId → "Session 2 (Upper)"; unknown/null ids read as Freestyle/Cardio. */
  sessionLabels?: Map<string, string>;
  budgetTokens?: number;
}

type LogRow = TrainingLogInput["logs"][number];
type SetRow = TrainingLogInput["sets"][number];

interface ParsedSet {
  exerciseId: string;
  setNumber: number;
  backoff: boolean;
  weight: number;
  reps: number;
  rpe: number | null;
  timed: boolean;
}

function fmtSet(p: ParsedSet): string {
  const rpe = p.rpe !== null ? `@${p.rpe}` : "";
  if (p.timed) return `${p.weight ? `${p.weight}kg×` : ""}${p.reps}s${rpe}`;
  return `${p.weight ? p.weight : "bw"}×${p.reps}${rpe}`;
}

function cardioText(c: NonNullable<LogRow["cardio"]>): string {
  const details = [
    c.durationMin != null ? `${c.durationMin} min` : null,
    c.hrZone != null ? `zone ${c.hrZone}` : null,
    c.intensity || null,
    c.rpe != null ? `RPE ${c.rpe}` : null,
    c.distanceKm != null ? `${c.distanceKm} km` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return details ? `${c.modality} ${details}` : c.modality;
}

/** Monday (UTC calendar math, so TZ never shifts it) of an ISO date. */
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Group sets by exercise in first-seen order; working sets before back-offs, then by set number. */
function byExercise(sets: ParsedSet[]): [string, ParsedSet[]][] {
  const groups = new Map<string, ParsedSet[]>();
  for (const p of sets) groups.set(p.exerciseId, [...(groups.get(p.exerciseId) ?? []), p]);
  return [...groups.entries()].map(([id, g]) => [
    id,
    [...g].sort((a, b) => Number(a.backoff) - Number(b.backoff) || a.setNumber - b.setNumber),
  ]);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The client's training as dated, per-session lines, newest first — every
 * logged set (back-offs flagged, timed holds in seconds) plus cardio logs:
 *   "2026-11-05 Session 2 (Upper): Squat 140×5@9, 137.5×4@9.5 (back-off); Bench 107.5×3@9"
 * Capped by `budgetTokens` (see HISTORY_TOKEN_BUDGET): the newest weeks that fit
 * stay verbatim; older weeks become one summary line each.
 */
export function renderTrainingLog({
  logs,
  sets,
  catalog,
  timedExerciseIds,
  timedSlotIds,
  sessionLabels,
  budgetTokens = HISTORY_TOKEN_BUDGET,
}: TrainingLogInput): string {
  const nameById = new Map(catalog.map((e) => [e.id, e.name]));
  const setsByLog = new Map<string, ParsedSet[]>();
  for (const set of sets as SetRow[]) {
    if (!nameById.has(set.exerciseId)) continue; // outside the trainer's catalog
    const parsed: ParsedSet = {
      exerciseId: set.exerciseId,
      setNumber: set.setNumber,
      backoff: set.type === "backoff",
      weight: set.weightKg ? Number(set.weightKg) : 0,
      reps: set.reps,
      rpe: set.rpe != null ? Number(set.rpe) : null,
      timed: isTimedSet(set, timedExerciseIds, timedSlotIds),
    };
    setsByLog.set(set.sessionLogId, [...(setsByLog.get(set.sessionLogId) ?? []), parsed]);
  }

  // Newest first; same-day logs keep their input order.
  const ordered = logs
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.date.localeCompare(a.l.date) || a.i - b.i)
    .map(({ l }) => l);

  const label = (l: LogRow) =>
    (l.programSessionId && sessionLabels?.get(l.programSessionId)) || (l.kind === "cardio" ? "Cardio" : "Freestyle");

  const logLine = (l: LogRow): string | null => {
    if (l.kind === "cardio") return l.cardio ? `${l.date} ${label(l)}: ${cardioText(l.cardio)}` : null;
    const parsed = setsByLog.get(l.id) ?? [];
    if (parsed.length === 0) return null;
    const body = byExercise(parsed)
      .map(([id, g]) => `${nameById.get(id)} ${g.map((p) => `${fmtSet(p)}${p.backoff ? " (back-off)" : ""}`).join(", ")}`)
      .join("; ");
    return `${l.date} ${label(l)}: ${body}`;
  };

  const weeks: { start: string; logs: LogRow[] }[] = [];
  for (const l of ordered) {
    const start = weekStart(l.date);
    const last = weeks[weeks.length - 1];
    if (last?.start === start) last.logs.push(l);
    else weeks.push({ start, logs: [l] });
  }

  const verbatim = weeks.map((w) => w.logs.map(logLine).filter((x): x is string => x !== null));
  const summaries = weeks.map((w) => summaryLine(w.start, w.logs, setsByLog, nameById));

  const cost = (lines: string[]) => estimateTokens(lines.join("\n"));
  const compose = (k: number) => [...verbatim.slice(0, k).flat(), ...summaries.slice(k).filter((x): x is string => !!x)];

  // Prefer the most verbatim weeks whose text plus summaries of the rest fits.
  for (let k = weeks.length; k >= 0; k--) {
    const lines = compose(k);
    if (cost(lines) <= budgetTokens) return lines.join("\n");
  }

  // Even all-summaries overflows: keep what verbatim fits, then summaries newest-first, drop the rest.
  let k = 0;
  while (k < weeks.length && cost(verbatim.slice(0, k + 1).flat()) <= budgetTokens) k++;
  const lines = verbatim.slice(0, k).flat();
  let next = k;
  while (next < weeks.length) {
    const s = summaries[next];
    if (s && cost([...lines, s]) > budgetTokens) break;
    if (s) lines.push(s);
    next++;
  }
  const omitted = weeks.length - next;
  if (omitted > 0) lines.push(`(${plural(omitted, "older week")} omitted — over the context budget)`);
  return lines.join("\n");
}

function summaryLine(
  start: string,
  logs: LogRow[],
  setsByLog: Map<string, ParsedSet[]>,
  nameById: Map<string, string>
): string | null {
  const chronological = [...logs].reverse();
  const liftingCount = chronological.filter((l) => l.kind !== "cardio" && (setsByLog.get(l.id)?.length ?? 0) > 0).length;
  const cardio = chronological.filter((l) => l.kind === "cardio" && l.cardio).map((l) => l.cardio!);
  if (liftingCount === 0 && cardio.length === 0) return null;

  const counts = [
    liftingCount ? plural(liftingCount, "lifting session") : null,
    cardio.length ? `${cardio.length} cardio` : null,
  ].filter(Boolean);

  const lifts = byExercise(chronological.flatMap((l) => (l.kind === "cardio" ? [] : setsByLog.get(l.id) ?? []))).map(
    ([id, g]) => {
      // Best: top e1RM for loaded lifts, longest hold for timed, most reps for bodyweight.
      const score = (p: ParsedSet) => (p.timed ? p.reps : p.weight ? estimate1rm(p.weight, p.reps) : p.reps);
      const best = g.reduce((a, b) => (score(b) > score(a) ? b : a));
      const tonnage = g.reduce((sum, p) => sum + (p.timed ? 0 : p.weight * p.reps), 0);
      return `${nameById.get(id)} best ${fmtSet(best)}, ${plural(g.length, "set")}${tonnage ? `, ${tonnage} kg` : ""}`;
    }
  );

  const minutes = cardio.reduce((sum, c) => sum + (c.durationMin ?? 0), 0);
  const km = cardio.reduce((sum, c) => sum + (c.distanceKm ?? 0), 0);
  const cardioPart = cardio.length
    ? [`cardio ${[minutes ? `${minutes} min` : null, km ? `${Math.round(km * 10) / 10} km` : null].filter(Boolean).join(", ") || plural(cardio.length, "session")}`]
    : [];

  return `Week of ${start} (summary): ${[counts.join(", "), ...lifts, ...cardioPart].join("; ")}`;
}

/** programSessionId → "Session 2 (Upper)" / "Cardio 1" across the given programs' weeks. */
export function sessionLabelsFor(
  programs: { sessions: { sessions: { id: string; kind?: string; seq: number; name: string }[] }[] }[]
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const p of programs) {
    for (const w of p.sessions) {
      for (const s of w.sessions) {
        const base = `${s.kind === "cardio" ? "Cardio" : "Session"} ${s.seq}`;
        labels.set(s.id, s.name && s.name !== base ? `${base} (${s.name})` : base);
      }
    }
  }
  return labels;
}
