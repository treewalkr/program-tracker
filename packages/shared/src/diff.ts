import type { AiProgramDraft } from "./ai";
import type { ProgramWeek } from "./domain";

export interface DiffRow {
  exercise: string;
  change: "kept" | "added" | "removed" | "changed";
  detail: string;
}

export interface DiffSource {
  sessions: {
    name: string;
    exercises: { name: string; sets: string }[];
  }[];
}

export const setsOf = (prescribedSets: { reps: number; amrap: boolean }[]) =>
  prescribedSets.map((s) => `${s.reps}${s.amrap ? "+" : ""}`).join("/");

export function diffRowsToText(rows: DiffRow[]): string {
  return rows
    .filter((r) => r.change !== "kept")
    .map((r) => `- ${r.change} ${r.exercise}: ${r.detail}`)
    .join("\n");
}

export function aiDraftToDiffSource(d: AiProgramDraft): DiffSource {
  return {
    sessions: d.sessions.map((s) => ({
      name: s.name,
      exercises: s.exercises.map((e) => ({
        name: e.exerciseName ?? e.exerciseId ?? "",
        sets: setsOf(e.prescribedSets),
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
      exercises: s.exercises.map((e) => ({
        name: e.exerciseName ?? e.exerciseId,
        sets: setsOf(e.prescribedSets),
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

  return rows;
}
