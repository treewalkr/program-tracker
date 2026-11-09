import { blockWeekOfDate, type ProgramWeek, type SignalProgram } from "@pt/shared";
import type { SessionLogDto } from "./api/types";

/**
 * A program's logs laid over its weeks (program page): each log goes on the
 * session it was logged against; a log that names no session of this program
 * (freestyle, or a session since removed) goes on its block week by date.
 */
export interface ProgramLogView {
  /** Session id → its logs, oldest first. */
  bySession: Map<string, SessionLogDto[]>;
  /** Week index (0-based) → logs not tied to one of its sessions, oldest first. */
  otherByWeek: Map<number, SessionLogDto[]>;
  total: number;
}

const byDate = (a: SessionLogDto, b: SessionLogDto) => a.date.localeCompare(b.date);

export function programLogView(program: SignalProgram, logs: SessionLogDto[]): ProgramLogView {
  const mine = logs.filter((l) => l.programId === program.id).sort(byDate);
  const sessionIds = new Set(program.weeks.flatMap((w) => w.sessions.map((s) => s.id)));
  const anchorLogs = mine.map((l) => ({ programId: l.programId, date: l.date, sets: [] }));
  const bySession = new Map<string, SessionLogDto[]>();
  const otherByWeek = new Map<number, SessionLogDto[]>();
  for (const l of mine) {
    if (l.programSessionId && sessionIds.has(l.programSessionId)) {
      bySession.set(l.programSessionId, [...(bySession.get(l.programSessionId) ?? []), l]);
    } else {
      const wi = Math.min(blockWeekOfDate(program, anchorLogs, l.date), program.weeks.length) - 1;
      otherByWeek.set(wi, [...(otherByWeek.get(wi) ?? []), l]);
    }
  }
  return { bySession, otherByWeek, total: mine.length };
}

/** Exercise ids prescribed as timed holds in this week — their sets are seconds. */
export function timedIdsOfWeek(week: ProgramWeek | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const s of week?.sessions ?? []) {
    for (const e of s.exercises) {
      if (e.prescribedSets.some((p) => p.durationSeconds != null)) {
        out.add(e.id);
        out.add(e.exerciseId);
      }
    }
  }
  return out;
}

const n = (v: number) => String(Math.round(v * 100) / 100);

/** "60 kg × 8", "BW × 10", "45 s", "12 kg · 60 s", with " @ 8" for RPE. */
export function loggedSetLabel(
  s: Pick<SessionLogDto["sets"][number], "weightKg" | "reps" | "rpe">,
  timed: boolean,
): string {
  const rpe = s.rpe != null && s.rpe > 0 ? ` @ ${n(s.rpe)}` : "";
  if (timed) return `${s.weightKg ? `${n(s.weightKg)} kg · ` : ""}${s.reps} s${rpe}`;
  return `${s.weightKg ? `${n(s.weightKg)} kg` : "BW"} × ${s.reps}${rpe}`;
}

/** A log's sets for one program exercise: by slot id, else by catalog exercise (logs without slots). */
export function setsForExercise(
  log: SessionLogDto,
  ex: { id: string; exerciseId: string },
): SessionLogDto["sets"] {
  const bySlot = log.sets.filter((s) => s.programExerciseId === ex.id);
  const sets = bySlot.length > 0 ? bySlot : log.sets.filter((s) => !s.programExerciseId && s.exerciseId === ex.exerciseId);
  return [...sets].sort((a, b) => a.setNumber - b.setNumber);
}

/** Sets in the log that match none of the session's exercises (a swap or an extra). */
export function extraSets(
  log: SessionLogDto,
  exercises: readonly { id: string; exerciseId: string }[],
): SessionLogDto["sets"] {
  const claimed = new Set(exercises.flatMap((e) => setsForExercise(log, e)));
  return log.sets.filter((s) => !claimed.has(s));
}

/** "Mon 19 Oct" — dates are calendar days, never shifted by timezone. */
export function logDateLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Run · 35 min · Z2 · 5.5 km · RPE 6" */
export function cardioLogLabel(c: SessionLogDto["cardio"]): string {
  return c
    ? [c.modality, c.durationMin ? `${c.durationMin} min` : null, c.hrZone ? `Z${c.hrZone}` : null, c.distanceKm ? `${c.distanceKm} km` : null, c.rpe ? `RPE ${c.rpe}` : null]
        .filter(Boolean)
        .join(" · ")
    : "";
}
