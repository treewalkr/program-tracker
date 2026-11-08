import type { ClientStatus } from "@pt/shared";
import type { AdminClient } from "./api/admin";

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

/** Local `YYYY-MM-DD`. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** `today` shifted by `n` days, as `YYYY-MM-DD`. */
function shift(today: string, n: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

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
  ): AdminClient => ({
    id,
    name,
    status,
    experience,
    trainer,
    clientSince: shift(today, -sinceDaysAgo),
    lastSessionAt: lastDaysAgo == null ? null : shift(today, -lastDaysAgo),
  });
  return [
    row("c-1", "Dana Whitfield", alex, "active", "intermediate", 410, 1),
    row("c-2", "Maya Chen", alex, "active", "advanced", 690, 0),
    row("c-3", "Omar Haddad", alex, "active", "beginner", 21, 3),
    row("c-4", "Priya Natarajan", alex, "paused", "intermediate", 300, 26),
    row("c-5", "Ben Kowalski", alex, "active", null, 4, null),
    row("c-6", "Lena Fischer", june, "active", "advanced", 520, 2),
    row("c-7", "Tom Becker", june, "active", "intermediate", 160, 18),
    row("c-8", "Aiko Tanaka", june, "active", "beginner", 45, 5),
    row("c-9", "Rui Santos", june, "archived", "intermediate", 800, 140),
    row("c-10", "Grace Mensah", sam, "active", "intermediate", 230, 33),
    row("c-11", "Felix Moreau", sam, "paused", "beginner", 95, 61),
    row("c-12", "Hana Ito", sam, "active", null, 60, 9),
  ];
}
