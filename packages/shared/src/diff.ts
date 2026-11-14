import { draftWeek, type AiProgramDraft } from "./ai";
import type { ProgramWeek } from "./domain";
import { groupTag, type Groupable } from "./groups";

export interface DiffRow {
  exercise: string;
  change: "kept" | "added" | "removed" | "changed";
  detail: string;
}

export interface DiffSource {
  sessions: {
    name: string;
    /** ISO weekday (1=Mon…7=Sun), null = unscheduled, undefined = unknown (an AI draft without a suggestion). */
    weekday?: number | null;
    exercises: { name: string; sets: string }[];
  }[];
}

export const setsOf = (prescribedSets: { reps: number; amrap: boolean }[]) =>
  prescribedSets.map((s) => `${s.reps}${s.amrap ? "+" : ""}`).join("/");

/** Sets plus the superset tag ("8/8/8 · A1"), so joining or leaving a group shows as a change. */
export function groupedSetsOf(
  list: readonly (Groupable & { prescribedSets: { reps: number; amrap: boolean }[] })[],
  i: number
): string {
  const tag = groupTag(list, i);
  return `${setsOf(list[i].prescribedSets)}${tag ? ` · ${tag}` : ""}`;
}

export function diffRowsToText(rows: DiffRow[]): string {
  return rows
    .filter((r) => r.change !== "kept")
    .map((r) => `- ${r.change} ${r.exercise}: ${r.detail}`)
    .join("\n");
}

/** One week of a draft (by number; the first week when absent) as a diff source. */
export function aiDraftToDiffSource(d: AiProgramDraft, week?: number | null): DiffSource {
  return {
    sessions: draftWeek(d, week).sessions.map((s) => ({
      name: s.name,
      ...(s.weekday != null ? { weekday: s.weekday } : {}),
      exercises: s.exercises.map((e, i) => ({
        name: e.exerciseName ?? e.exerciseId ?? "",
        sets: groupedSetsOf(s.exercises, i),
      })),
    })),
  };
}

export function programWeeksToDiffSource(weeks: ProgramWeek[], weekNumber?: number): DiffSource {
  const chosenWeek =
    weekNumber != null ? weeks.find((w) => w.week === weekNumber) : weeks[weeks.length - 1];
  const sessions = chosenWeek ? chosenWeek.sessions : [];
  return {
    sessions: sessions.map((s) => ({
      name: s.name,
      weekday: s.weekday ?? null,
      exercises: s.exercises.map((e, i) => ({
        name: e.exerciseName ?? e.exerciseId,
        sets: groupedSetsOf(s.exercises, i),
      })),
    })),
  };
}

export function diffSources(before: DiffSource | null, after: DiffSource | null): DiffRow[] {
  if (!before || !after) return [];

  const key = (name: string) => name.toLowerCase();

  const beforeEx = new Map<string, { name: string; sets: string; sessions: string[] }>();
  for (const s of before.sessions) {
    for (const e of s.exercises) {
      const k = key(e.name);
      const existing = beforeEx.get(k);
      if (existing) {
        existing.sessions.push(s.name);
        existing.sets = e.sets;
      } else {
        beforeEx.set(k, { name: e.name, sets: e.sets, sessions: [s.name] });
      }
    }
  }

  const afterEx = new Map<string, { name: string; sets: string }>();
  for (const s of after.sessions) {
    for (const e of s.exercises) {
      afterEx.set(key(e.name), { name: e.name, sets: e.sets });
    }
  }

  const rows: DiffRow[] = [];
  for (const [k, { name, sets }] of afterEx) {
    const b = beforeEx.get(k);
    if (!b) {
      rows.push({ exercise: name, change: "added", detail: `new — ${sets}` });
    } else if (b.sets !== sets) {
      rows.push({ exercise: name, change: "changed", detail: `${b.sets} → ${sets}` });
    } else {
      rows.push({ exercise: name, change: "kept", detail: sets });
    }
  }

  for (const [k, info] of beforeEx) {
    if (!afterEx.has(k)) {
      rows.push({
        exercise: info.name,
        change: "removed",
        detail: `was ${info.sets} (${info.sessions.join(", ")})`,
      });
    }
  }

  rows.push(...sessionMoves(before, after));
  return rows;
}

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLabel = (d: number | null) => (d == null ? "unscheduled" : DAY[d] ?? `day ${d}`);

/** Sessions (matched by name) whose weekday changed. Skipped when either side has no known weekday. */
export function sessionMoves(before: DiffSource, after: DiffSource): DiffRow[] {
  const rows: DiffRow[] = [];
  const seen = new Set<string>();
  for (const a of after.sessions) {
    const k = a.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const b = before.sessions.find((x) => x.name.toLowerCase() === k);
    if (!b || b.weekday === undefined || a.weekday === undefined || b.weekday === a.weekday) continue;
    rows.push({ exercise: a.name, change: "changed", detail: `session moved ${dayLabel(b.weekday)} → ${dayLabel(a.weekday)}` });
  }
  return rows;
}
