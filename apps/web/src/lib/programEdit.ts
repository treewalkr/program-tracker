import { TEMPO_PATTERN, blockAnchorDate, blockWeekStart, type CopyTarget, type ForwardResult, type ForwardSkipReason, type Rotation, type SignalProgram, type WeekEdit } from "@pt/shared";
import type { PrescribedSetDto, ProgramDto } from "./api/types";

/** Pure helpers for the inline program editor: set modes, grouped sets, dirty state, header copy. */

export type SetMode = "reps" | "timed" | "max";

export function setMode(s: PrescribedSetDto): SetMode {
  if (s.durationSeconds != null) return "timed";
  if (s.amrap) return "max";
  return "reps";
}

/** Convert one set to a mode, keeping load, RPE and rest. An AMRAP's RPE is its stop RPE. */
export function withMode(s: PrescribedSetDto, mode: SetMode): PrescribedSetDto {
  const rpe = s.amrap ? (s.stopRpe ?? s.targetRpe) : s.targetRpe;
  const base = { ...s, repsMin: undefined, durationSeconds: undefined, amrap: false, stopRpe: undefined, targetRpe: rpe };
  if (mode === "timed") return { ...base, reps: 0, durationSeconds: s.durationSeconds ?? 30 };
  if (mode === "max") return { ...base, amrap: true, reps: 0, stopRpe: rpe, targetRpe: undefined, targetRpeMin: undefined };
  return { ...base, reps: s.reps > 0 ? s.reps : 8, repsMin: s.durationSeconds == null && !s.amrap ? s.repsMin : undefined };
}

/** Load cell text: "75%" for a %1RM set, else the kg. */
export function loadCell(s: PrescribedSetDto): string {
  if (s.percent1rm != null) return `${s.percent1rm}%`;
  return s.targetWeightKg != null ? `${s.targetWeightKg}` : "";
}

/** Load cell input: "102.5" sets kg, "75%" sets %1RM (each clears the other), blank clears both; junk is ignored. */
export function withLoad(s: PrescribedSetDto, raw: string): PrescribedSetDto {
  const t = raw.trim();
  if (t === "") return { ...s, targetWeightKg: null, percent1rm: undefined };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(%)?$/);
  if (!m) return s;
  const v = Number(m[1].replace(",", "."));
  if (m[2]) return v >= 1 && v <= 110 ? { ...s, percent1rm: v, targetWeightKg: undefined } : s;
  return v <= 600 ? { ...s, targetWeightKg: v, percent1rm: undefined } : s;
}

/** RPE cell text: "8" or "7–8"; in Max mode the stop RPE. */
export function rpeCell(s: PrescribedSetDto, mode: SetMode): string {
  if (mode === "max") return s.stopRpe != null ? `${s.stopRpe}` : "";
  if (s.targetRpe == null) return "";
  return s.targetRpeMin != null && s.targetRpeMin < s.targetRpe ? `${s.targetRpeMin}–${s.targetRpe}` : `${s.targetRpe}`;
}

const rpeOk = (v: number) => v >= 1 && v <= 10;

/** RPE cell input: "8" or "7–8" (range); in Max mode the stop RPE. Blank clears; junk is ignored. */
export function withRpe(s: PrescribedSetDto, raw: string, mode: SetMode): PrescribedSetDto {
  if (raw.trim() === "") return mode === "max" ? { ...s, stopRpe: undefined } : { ...s, targetRpe: undefined, targetRpeMin: undefined };
  const r = parseRange(raw);
  if (!r || !rpeOk(r.max) || (r.min != null && !rpeOk(r.min))) return s;
  if (mode === "max") return { ...s, stopRpe: r.max, targetRpe: undefined, targetRpeMin: undefined };
  return { ...s, targetRpe: r.max, targetRpeMin: r.min ?? undefined };
}

/** Tempo input: four phases ("3-1-1-0" / "31X0"), X uppercased; blank clears; invalid input is ignored. */
export function withTempo(s: PrescribedSetDto, raw: string): PrescribedSetDto {
  const t = raw.trim().toUpperCase();
  if (t === "") return { ...s, tempo: undefined };
  return TEMPO_PATTERN.test(t) ? { ...s, tempo: t } : s;
}

/** RIR input, clamped to 0–10; blank clears. */
export function withRir(s: PrescribedSetDto, raw: string): PrescribedSetDto {
  if (raw.trim() === "") return { ...s, targetRir: undefined };
  const v = Number(raw);
  return Number.isFinite(v) ? { ...s, targetRir: Math.min(10, Math.max(0, Math.round(v * 2) / 2)) } : s;
}

const sig = ({ setNumber: _n, ...rest }: PrescribedSetDto) =>
  JSON.stringify(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null).sort());

/** True when every set is the same apart from its number, so one row can edit them all. */
export function isUniform(sets: PrescribedSetDto[]): boolean {
  return sets.length > 0 && sets.every((s) => sig(s) === sig(sets[0]));
}

const renumber = (sets: PrescribedSetDto[]) => sets.map((s, i) => ({ ...s, setNumber: i + 1 }));

/** Grow by copying the last set, or shrink from the end. Clamped to 1–20. */
export { withSetCount } from "@pt/shared";

/** Apply the same change to every set. */
export function patchAll(sets: PrescribedSetDto[], patch: (s: PrescribedSetDto) => PrescribedSetDto) {
  return renumber(sets.map(patch));
}

/** Parse a "7" or "7–8" / "7-8" rep or RPE range. */
export function parseRange(raw: string): { min: number | null; max: number } | null {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : null;
  if (b == null || a === b) return { min: null, max: a };
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export function repsLabel(s: PrescribedSetDto): string {
  return s.repsMin != null && s.repsMin !== s.reps ? `${s.repsMin}–${s.reps}` : `${s.reps}`;
}

/** Stable snapshot used to detect unsaved edits. Keys are sorted: Postgres jsonb
 *  reorders them, so a saved program read back must still match the editor's copy. */
export function snapshot(p: Pick<ProgramDto, "weeks" | "phasing">): string {
  return JSON.stringify({ weeks: p.weeks, phasing: p.phasing ?? null }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]))
      : value
  );
}

/** Sub-line under the title: version, origin, when Week 1 started, and save time — never contradicting the status pill. */
export function programSubline(p: ProgramDto, savedAt: string | null, when: string | null = null): string {
  const bits = [`v${p.version}`];
  if (when) bits.push(when);
  if (p.aiAssisted) bits.push(p.createdFromProgramId ? "AI-assisted · built on the previous block" : "AI-assisted");
  if (savedAt) bits.push(`saved ${savedAt}`);
  return bits.join(" · ");
}

/** "W2, W4, W6". */
export const weekList = (weeks: readonly number[]) => weeks.map((w) => `W${w}`).join(", ");

/** A "Copy this week to…" menu row: what it targets and, for groups, which weeks. */
export function copyTargetLabel(t: CopyTarget): { label: string; hint?: string } {
  if (t.kind === "letter") return { label: `Every ${t.letter} week`, hint: weekList(t.weeks) };
  if (t.kind === "all") return { label: "Every week", hint: weekList(t.weeks) };
  return { label: `Week ${t.weeks[0]}` };
}

/** Toast after "Copy this week to…": what was copied and which logged weeks were kept. */
export function copyNotice(from: number, targets: readonly number[], skipped: readonly number[]): string {
  const copied = targets.filter((w) => w !== from && !skipped.includes(w));
  const kept = skipped.length > 0 ? `${weekList(skipped)} kept: ${skipped.length === 1 ? "has" : "have"} logs.` : "";
  if (copied.length === 0) return `Nothing copied. ${kept}`.trim();
  return `Copied W${from} to ${weekList(copied)}.${kept ? ` ${kept}` : ""}`;
}

/** Toast after turning A/B weeks off with "Use Week A/B for every week": which weeks stayed as they were. */
export function matchNotice(use: Rotation, skipped: { logged: readonly number[]; deload: readonly number[] }): string {
  const kept = (weeks: readonly number[], one: string, many: string) =>
    weeks.length > 0 ? ` ${weekList(weeks)} kept: ${weeks.length === 1 ? one : many}.` : "";
  return `Every week now follows Week ${use}.${kept(skipped.logged, "has logs", "have logs")}${kept(skipped.deload, "deload week", "deload weeks")}`;
}

// —— Dated weeks ("which week is now", FB-017) ————————————————————————————

export type WeekState = "past" | "now" | "upcoming";

export interface WeekTabDate {
  week: number;
  /** First and last day of the week window (YYYY-MM-DD). */
  start: string;
  end: string;
  state: WeekState;
}

type AnchorLog = { programId: string; date: string };
type DatedProgram = Pick<SignalProgram, "id" | "status" | "activatedAt" | "createdAt"> & {
  startsOn?: string | null;
  weeks: readonly { week: number }[];
};

const anchorOf = (program: DatedProgram, logs: readonly AnchorLog[]) =>
  blockAnchorDate(
    { id: program.id, activatedAt: program.activatedAt, startsOn: program.startsOn ?? null, createdAt: program.createdAt, clientId: null, name: "", status: "", weeks: [] },
    logs.map((l) => ({ programId: l.programId, date: l.date, sets: [] }))
  ).slice(0, 10);

/**
 * Each week's calendar window and whether it is over, under way or still to
 * come — the same 7-day buckets the logs, pulse and portal use. Drafts have no
 * calendar yet: null. `today` is the local date (YYYY-MM-DD).
 */
export function weekTabDates(program: DatedProgram, logs: readonly AnchorLog[], today: string): WeekTabDate[] | null {
  if (program.status === "draft") return null;
  const anchor = anchorOf(program, logs);
  return program.weeks.map(({ week }) => {
    const start = blockWeekStart(anchor, week);
    const end = addDay(start, 6);
    const state: WeekState = today > end ? "past" : today < start ? "upcoming" : "now";
    return { week, start, end, state };
  });
}

const addDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The week to open the program page on: the client's current week, clamped to
 *  the block (the last week once it is over, the first before it starts). 0-based index. */
export function currentWeekIndex(dates: readonly WeekTabDate[] | null): number {
  if (!dates || dates.length === 0) return 0;
  const now = dates.findIndex((d) => d.state === "now");
  if (now >= 0) return now;
  return dates.every((d) => d.state === "past") ? dates.length - 1 : 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parts = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], weekday: WEEKDAYS[d.getUTCDay()] };
};

/** "16 Nov". */
export function dayMonth(iso: string): string {
  const p = parts(iso);
  return `${p.day} ${p.month}`;
}

/** "Tue 10 Nov". */
export function weekdayDayMonth(iso: string): string {
  return `${parts(iso).weekday} ${dayMonth(iso)}`;
}

/** "17–23 Nov", or "28 Nov–4 Dec" across a month end. */
export function weekRangeLabel(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  return a.month === b.month ? `${a.day}–${b.day} ${b.month}` : `${a.day} ${a.month}–${b.day} ${b.month}`;
}

/** Subline bit: "Week 1 started Tue 10 Nov · now W2", "Week 1 starts Mon 23 Nov", or "… · ended". */
export function weekLine(dates: readonly WeekTabDate[] | null): string | null {
  if (!dates || dates.length === 0) return null;
  const first = dates[0];
  if (first.state === "upcoming") return `Week 1 starts ${weekdayDayMonth(first.start)}`;
  const now = dates.find((d) => d.state === "now");
  return `Week 1 started ${weekdayDayMonth(first.start)} · ${now ? `now W${now.week}` : "ended"}`;
}

/** Note on a finished week: "W1 ended 16 Nov — Ann is in W2." (or "… the block has ended."). */
export function endedNote(dates: readonly WeekTabDate[] | null, week: number, clientName: string | null): string | null {
  const d = dates?.find((x) => x.week === week);
  if (!d || d.state !== "past") return null;
  const now = dates!.find((x) => x.state === "now");
  const who = clientName?.trim().split(/\s+/)[0] || "The client";
  return `W${week} ended ${dayMonth(d.end)} — ${now ? `${who} is in W${now.week}.` : "the block has ended."}`;
}

// —— Forward edits toast ————————————————————————————————————————————————

/** "W3–W6" for a run, "W3, W5" otherwise. */
export function weekSpan(weeks: readonly number[]): string {
  const sorted = [...weeks].sort((a, b) => a - b);
  const run = sorted.length > 2 && sorted.every((w, i) => i === 0 || w === sorted[i - 1] + 1);
  return run ? `W${sorted[0]}–W${sorted.at(-1)}` : weekList(sorted);
}

const editSentence = (e: WeekEdit, where: string): string => {
  switch (e.kind) {
    case "addSession":
      return `Added ${e.session.name} to ${where}`;
    case "removeSession":
      return `Removed ${e.name} from ${where}`;
    case "renameSession":
      return `Renamed ${e.from} to ${e.name} in ${where}`;
    case "addExercise":
      return `Added ${e.exercise.exerciseName ?? "an exercise"} to ${where}`;
    case "removeExercise":
      return `Removed ${e.name} from ${where}`;
    case "swapExercise":
      return `Swapped ${e.from} for ${e.exerciseName} in ${where}`;
  }
};

const KEPT_BECAUSE: Record<ForwardSkipReason, [one: string, many: string]> = {
  logged: ["has logs", "have logs"],
  exists: ["already has that session", "already have that session"],
  missing: ["no matching session", "no matching session"],
  full: ["full", "full"],
  empty: ["would be left empty", "would be left empty"],
};

/** Toast after an edit went to later weeks: "Added Home to W3–W6" /
 *  "Removed Bench from W4–W6 · W3 kept: has logs". null when nothing happened. */
export function forwardNotice(edits: readonly WeekEdit[], r: Pick<ForwardResult, "changed" | "skipped">): string | null {
  if (edits.length === 0 || (r.changed.length === 0 && r.skipped.length === 0)) return null;
  const head =
    r.changed.length > 0
      ? `${editSentence(edits[0], weekSpan(r.changed))}${edits.length > 1 ? ` (+${edits.length - 1} more ${edits.length === 2 ? "change" : "changes"})` : ""}`
      : "No later week changed";
  const byReason = new Map<ForwardSkipReason, Set<number>>();
  for (const s of r.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? new Set()).add(s.week));
  const kept = [...byReason].map(([reason, set]) => {
    const weeks = [...set].sort((a, b) => a - b);
    const [one, many] = KEPT_BECAUSE[reason];
    return `${weekList(weeks)} kept: ${weeks.length === 1 ? one : many}`;
  });
  return [head, ...kept].join(" · ");
}
