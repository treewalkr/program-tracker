import { isoWeekStart, localDateOf, type CardioLog } from "@pt/shared";
import type { ClientDto, ProgramDto, ProgramExerciseDto, ProgramSessionDto, ProgramWeekDto } from "../types";
import type { StoredLog } from "./data";

/**
 * The big-roster demo: one trainer with 25 members, for checking that a page's request count
 * doesn't grow with the roster (see requestCount.test.ts). Pick it with `?mock=roster` on any
 * trainer URL; it stays for the tab (mockScenarioName in scenario.ts). It replaces the default
 * demo members, so the portal demo and the other scenarios aren't meant to be used with it.
 *
 * Deterministic: a seeded generator and dates counted back from `now`, so a run today and one
 * next month build the same shapes (the same member trains the same days with the same gaps).
 */

export const BIG_ROSTER_SIZE = 25;
/** The last members are paused (2) and archived (2); everyone else is active. */
const PAUSED = [22, 23];
const ARCHIVED = [24, 25];
/** Members 1–25 with the portal on (a third of them). */
const portalOn = (n: number) => n % 3 === 0;

/** mulberry32: a small seeded generator, so the same member always gets the same history. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aom", "Bank", "Cat", "Dao", "Eak", "Fah", "Gun", "Hana", "Ice", "Jai", "Kwan", "Lek", "Mint", "Nam", "Oat", "Pim", "Quin", "Ratree", "Som", "Tan", "Ubon", "Vee", "Wan", "Xian", "Yok"];
const LAST = ["Chai", "Boon", "Sri", "Wong", "Lim", "Tan", "Rao", "Kaur", "Ito", "Park", "Silva", "Novak", "Haddad", "Okafor", "Lund", "Reyes", "Cohen", "Moreau", "Bauer", "Rossi", "Kim", "Singh", "Dubois", "Costa", "Mehta"];
const LIFTS: string[][] = [
  ["ex-squat", "ex-rdl", "ex-plank"],
  ["ex-bench", "ex-crow", "ex-facepull"],
  ["ex-dead", "ex-bss", "ex-hlr"],
  ["ex-incline", "ex-pulldown", "ex-curl"],
];
const WEEKS = 12;

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface BigRoster {
  clients: ClientDto[];
  programs: ProgramDto[];
  logs: StoredLog[];
  /** Portal state per client id, like the mock's `state.portal`. */
  portal: Record<string, { token: string; lastSeenAt: string | null }>;
}

export function bigRoster(now = Date.now()): BigRoster {
  const todayIso = localDateOf(now);
  const thisMonday = isoWeekStart(new Date(now));
  const clients: ClientDto[] = [];
  const programs: ProgramDto[] = [];
  const logs: StoredLog[] = [];
  const portal: BigRoster["portal"] = {};

  for (let n = 1; n <= BIG_ROSTER_SIZE; n++) {
    const rand = rng(1000 + n);
    const id = `cl-r${String(n).padStart(2, "0")}`;
    const status: ClientDto["status"] = ARCHIVED.includes(n) ? "archived" : PAUSED.includes(n) ? "paused" : "active";
    const strengthDays = [[1, 3, 5], [2, 4], [1, 4, 6], [2, 3, 5, 6], [1, 3]][n % 5];
    const cardioDay = n % 4 === 0 ? 7 : null; // every fourth member also has a Sunday run
    clients.push({
      id,
      name: `${FIRST[n - 1]} ${LAST[n - 1]}`,
      email: `${FIRST[n - 1].toLowerCase()}.${LAST[n - 1].toLowerCase()}@example.com`,
      status,
      goals: n % 2 ? "Get stronger and keep the habit." : "Lose a little fat, keep the lifts moving.",
      limitations: n % 7 === 0 ? "Lower back: no heavy hinging." : null,
      sessionsPerWeek: strengthDays.length,
      trainingDays: strengthDays,
      experience: (["beginner", "intermediate", "advanced"] as const)[n % 3],
      startedOn: plusDays(thisMonday, -7 * (WEEKS + (n % 5))),
    });

    // The block began `weeksIn` weeks ago, so every member is mid-block on a different week.
    const weeksIn = 4 + (n % 9);
    const startsOn = plusDays(thisMonday, -7 * weeksIn);
    const programId = `pg-r${String(n).padStart(2, "0")}`;
    const weekOf = (week: number): ProgramWeekDto => {
      const sessions: ProgramSessionDto[] = strengthDays.map((weekday, i) => {
        const sid = `ps-r${n}-w${week}-${i + 1}`;
        const exercises: ProgramExerciseDto[] = LIFTS[(n + i) % LIFTS.length].map((exerciseId, k) => ({
          id: `pe-r${n}-w${week}-${i + 1}-${k + 1}`,
          exerciseId,
          order: k,
          prescribedSets: [1, 2, 3].map((setNumber) => ({ setNumber, type: "working" as const, reps: 8, amrap: false, targetWeightKg: 40 + 5 * k + 2.5 * week })),
        }));
        return { id: sid, name: `Day ${i + 1}`, seq: i + 1, weekday, order: 0, kind: "exercises", exercises, cardio: null };
      });
      if (cardioDay) {
        sessions.push({
          id: `ps-r${n}-w${week}-run`, name: "Easy run", seq: 1, weekday: cardioDay, order: 0, kind: "cardio", exercises: [],
          cardio: { modality: "Running", modalityId: "md-running", durationMin: 40, hrZone: 2, targetRpe: 3, intensity: "easy" },
        });
      }
      return { week, sessions };
    };
    const weeks = Array.from({ length: WEEKS + 4 }, (_, i) => weekOf(i + 1));
    programs.push({
      id: programId,
      trainerId: "me",
      clientId: id,
      name: `Block ${n}`,
      description: `${strengthDays.length} strength days a week.`,
      status: status === "archived" ? "archived" : "active",
      version: 1,
      aiAssisted: false,
      createdFromProgramId: null,
      direction: null,
      activatedAt: `${startsOn}T08:00:00.000Z`,
      startsOn,
      phasing: null,
      createdAt: `${plusDays(startsOn, -3)}T09:00:00.000Z`,
      weeks,
    });

    // A paused member went quiet three weeks ago; an archived one finished the block.
    const quietFrom = status === "paused" ? plusDays(todayIso, -21) : status === "archived" ? plusDays(todayIso, -35) : plusDays(todayIso, 1);
    for (let w = 0; w < weeksIn; w++) {
      for (const session of weeks[w].sessions) {
        const date = plusDays(startsOn, 7 * w + (session.weekday ?? 1) - 1);
        if (date >= todayIso || date >= quietFrom || rand() > 0.82) continue; // not yet, gone quiet, or a missed session
        const base = { sessionLogId: `lg-r${n}-${date}-${session.id}`, clientId: id, programId, programSessionId: session.id, date, loggedBy: portalOn(n) && rand() > 0.5 ? ("client" as const) : undefined };
        if (session.kind === "cardio") {
          const cardio: CardioLog = rand() > 0.85
            ? { modality: "Running", skipped: { reason: "time" } }
            : { modality: "Running", durationSec: 2400 + Math.round(rand() * 600), distanceKm: 6 + Math.round(rand() * 10) / 10, rpe: 4 };
          logs.push({ ...base, kind: "cardio", cardio: cardio.skipped ? cardio : { ...cardio, durationMin: Math.round((cardio.durationSec ?? 0) / 60) }, sets: [] });
        } else {
          logs.push({
            ...base,
            kind: "exercises",
            perceivedEnergy: 5 + Math.floor(rand() * 4),
            sets: session.exercises.flatMap((e) =>
              e.prescribedSets.map((s) => ({
                programExerciseId: e.id, exerciseId: e.exerciseId, setNumber: s.setNumber, type: "working" as const,
                weightKg: s.targetWeightKg ?? undefined, reps: 8 - (rand() > 0.8 ? 1 : 0), rpe: 7,
              }))
            ),
          });
        }
      }
    }
    if (portalOn(n) && status !== "archived") portal[id] = { token: `roster-${n}`, lastSeenAt: new Date(now - 86400_000 * (1 + (n % 5))).toISOString() };
  }
  return { clients, programs, logs, portal };
}
