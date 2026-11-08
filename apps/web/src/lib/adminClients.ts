import type { ClientStatus, ProgramWeek } from "@pt/shared";
import type { AdminClient, AdminClientDetail, AdminProgrammeRef } from "./api/admin";
import { exercises as seedExercises, programs as seedPrograms, trainerExercises, trainerProgram } from "./api/mock/data";

/** Days without a logged session before a client reads as dormant. */
export const DORMANT_DAYS = 14;

export interface ClientFilter {
  /** Matches client or trainer name, case-insensitive. */
  q: string;
  /** "" = every trainer. */
  trainerId: string;
  /** "" = every status. */
  status: ClientStatus | "";
}

export function filterClients(rows: AdminClient[], f: ClientFilter): AdminClient[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.trainerId || r.trainer.id === f.trainerId) &&
      (!f.status || r.status === f.status) &&
      (!q || r.name.toLowerCase().includes(q) || r.trainer.name.toLowerCase().includes(q)),
  );
}

/** Distinct trainers in first-seen order (the API sorts by trainer name). */
export function trainersOf(rows: AdminClient[]): AdminClient["trainer"][] {
  const seen = new Map<string, AdminClient["trainer"]>();
  for (const r of rows) if (!seen.has(r.trainer.id)) seen.set(r.trainer.id, r.trainer);
  return [...seen.values()];
}

/** Whole calendar days from a `YYYY-MM-DD` day to `today` (`YYYY-MM-DD`). */
export function daysBetween(day: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
}

/** "Today", "Yesterday", "5 days ago", "12 Mar"; tone flags never-logged and dormant clients. */
export function lastSessionLabel(day: string | null, today: string): { text: string; tone: "none" | "dormant" | "recent" } {
  if (!day) return { text: "Never", tone: "none" };
  const d = daysBetween(day, today);
  const tone = d > DORMANT_DAYS ? "dormant" : "recent";
  if (d <= 0) return { text: "Today", tone };
  if (d === 1) return { text: "Yesterday", tone };
  if (d < 30) return { text: `${d} days ago`, tone };
  return { text: shortDay(day, today), tone };
}

/** `12 Mar`, or `12 Mar 2025` outside the current year. */
export function shortDay(day: string, today: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** "Wk 3 of 8"; past the plan, "Wk 8 of 8 · over". */
export function programmeLabel(p: Pick<AdminProgrammeRef, "week" | "of" | "over">): string {
  return `Wk ${p.week} of ${p.of}${p.over ? " · over" : ""}`;
}

/** Local `YYYY-MM-DD`. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** `today` shifted by `n` days, as `YYYY-MM-DD`. */
function shift(today: string, n: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Seed programs the sample programmes borrow their name, version and sessions from. */
const SAMPLE_SOURCES = {
  strength: seedPrograms.find((p) => p.id === "pg-maya-a")!,
  hypertrophy: seedPrograms.find((p) => p.id === "pg-jonas-a")!,
  sarco: trainerProgram,
} as const;
type SampleSource = keyof typeof SAMPLE_SOURCES;

/** Sample programme ids encode their source: `sp-<source>-<clientId>`. */
const sampleProgramme = (clientId: string, source: SampleSource, week: number, of: number, over = false): AdminProgrammeRef => ({
  id: `sp-${source}-${clientId}`,
  name: SAMPLE_SOURCES[source].name,
  week,
  of,
  over,
});

/** A believable platform for mock mode and `?demo`: three trainers, mixed states. */
export function sampleAdminClients(today: string): AdminClient[] {
  const alex = { id: "t-alex", name: "Alex Rivera", access: "active" as const };
  const june = { id: "t-june", name: "June Park", access: "active" as const };
  const sam = { id: "t-sam", name: "Sam Okafor", access: "disabled" as const };
  const row = (
    id: string,
    name: string,
    trainer: AdminClient["trainer"],
    status: ClientStatus,
    experience: AdminClient["experience"],
    sinceDaysAgo: number,
    lastDaysAgo: number | null,
    programme: [SampleSource, number, number, boolean?] | null = null,
  ): AdminClient => ({
    id,
    name,
    status,
    experience,
    trainer,
    clientSince: shift(today, -sinceDaysAgo),
    lastSessionAt: lastDaysAgo == null ? null : shift(today, -lastDaysAgo),
    programme: programme && sampleProgramme(id, ...programme),
  });
  return [
    row("c-1", "Dana Whitfield", alex, "active", "intermediate", 410, 1, ["strength", 3, 6]),
    row("c-2", "Maya Chen", alex, "active", "advanced", 690, 0, ["sarco", 5, 6]),
    row("c-3", "Omar Haddad", alex, "active", "beginner", 21, 3, ["hypertrophy", 2, 6]),
    row("c-4", "Priya Natarajan", alex, "paused", "intermediate", 300, 26),
    row("c-5", "Ben Kowalski", alex, "active", null, 4, null),
    row("c-6", "Lena Fischer", june, "active", "advanced", 520, 2, ["sarco", 6, 6, true]),
    row("c-7", "Tom Becker", june, "active", "intermediate", 160, 18, ["strength", 4, 6]),
    row("c-8", "Aiko Tanaka", june, "active", "beginner", 45, 5, ["hypertrophy", 1, 6]),
    row("c-9", "Rui Santos", june, "archived", "intermediate", 800, 140),
    row("c-10", "Grace Mensah", sam, "active", "intermediate", 230, 33, ["strength", 2, 6]),
    row("c-11", "Felix Moreau", sam, "paused", "beginner", 95, 61),
    row("c-12", "Hana Ito", sam, "active", null, 60, 9),
  ];
}

type SampleBasics = Pick<AdminClientDetail["client"], "age" | "sex" | "bodyweightKg" | "heightCm" | "sessionsPerWeek" | "trainingDays">;
const UNSET: SampleBasics = { age: null, sex: null, bodyweightKg: null, heightCm: null, sessionsPerWeek: null, trainingDays: null };

/** Fixed, believable basics per sample client; absent = nothing filled in yet. */
const SAMPLE_BASICS: Record<string, SampleBasics> = {
  "c-1": { age: 34, sex: "female", bodyweightKg: 64.5, heightCm: 168, sessionsPerWeek: 3, trainingDays: [1, 3, 5] },
  "c-2": { age: 29, sex: "female", bodyweightKg: 58, heightCm: 162, sessionsPerWeek: 4, trainingDays: [1, 2, 4, 6] },
  "c-3": { age: 41, sex: "male", bodyweightKg: 92, heightCm: 181, sessionsPerWeek: 3, trainingDays: [2, 4, 6] },
  "c-4": { age: 37, sex: "female", bodyweightKg: 70, heightCm: null, sessionsPerWeek: 2, trainingDays: [2, 5] },
  "c-5": { ...UNSET, sessionsPerWeek: 2 },
  "c-6": { age: 31, sex: "female", bodyweightKg: 61, heightCm: 170, sessionsPerWeek: 4, trainingDays: [1, 2, 4, 5] },
  "c-7": { age: 45, sex: "male", bodyweightKg: 84.5, heightCm: 176, sessionsPerWeek: 3, trainingDays: [1, 3, 5] },
  "c-8": { age: 26, sex: "female", bodyweightKg: 55, heightCm: 158, sessionsPerWeek: 2, trainingDays: [3, 6] },
  "c-9": { age: 52, sex: "male", bodyweightKg: 88, heightCm: 179, sessionsPerWeek: 2, trainingDays: null },
  "c-10": { age: 38, sex: "female", bodyweightKg: 72, heightCm: 172, sessionsPerWeek: 3, trainingDays: [1, 3, 6] },
  "c-11": { age: 23, sex: "male", bodyweightKg: 77, heightCm: 183, sessionsPerWeek: 3, trainingDays: [2, 4, 7] },
  "c-12": { ...UNSET, age: 33, sex: "female" },
};

const sampleExerciseName = (id: string) =>
  seedExercises.find((e) => e.id === id)?.name ?? trainerExercises.find((e) => e.id === id)?.name ?? id;

/** One sample client's detail, built from its directory row; null = unknown id. */
export function sampleAdminClientDetail(id: string, today: string): AdminClientDetail | null {
  const row = sampleAdminClients(today).find((r) => r.id === id);
  if (!row) return null;
  const { programme: ref, ...rest } = row;
  const source = ref ? SAMPLE_SOURCES[ref.id.split("-")[1] as SampleSource] : null;
  const week: ProgramWeek | null = source ? (source.weeks.find((w) => w.week === ref!.week) ?? source.weeks[0]) : null;
  return {
    client: { ...rest, ...(SAMPLE_BASICS[id] ?? UNSET) },
    programme:
      ref && source && week
        ? {
            ...ref,
            version: source.version,
            aiAssisted: source.aiAssisted,
            activatedAt: shift(today, -((ref.week - 1) * 7 + 2)),
            thisWeek: {
              week: ref.week,
              sessions: week.sessions.map((s) => ({
                ...s,
                exercises: s.exercises.map((e) => ({ ...e, exerciseName: e.exerciseName ?? sampleExerciseName(e.exerciseId) })),
              })),
            },
          }
        : null,
  };
}
