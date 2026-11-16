import {
  addDays,
  blockAnchorDate,
  blockWeekStart,
  lastWeightsOf,
  loadStep,
  latestLogBySession,
  localDateOf,
  portalSessions,
  weekOf,
  weekSessions,
  type Equipment,
  type PortalWeek,
  type PortalWeekDto,
  type ProgramSession,
} from "@pt/shared";
import { uuid } from "$lib/uuid";
import { mockExerciseName, mockState } from "./api";
import { exercises } from "./data";
import { trainerClient } from "./data";
import { PortalDuplicateError, type PortalApi, type PortalLogInput, type PortalSavedLog } from "../portalTypes";

/**
 * Mock client portal: the demo client (Nattapong) over the trainer mock's own
 * state — the same rules as `/v1/portal/*`, the same client-safe projection
 * (`portalSessions` from @pt/shared). No sign-in, so it works as a sales demo.
 */

export const MOCK_TRAINER_NAME = "Coach Ploy";
const CLIENT_ID = trainerClient.id;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function activeProgram() {
  return (
    mockState.programs
      .filter((p) => p.clientId === CLIENT_ID && p.status === "active")
      .sort((a, b) => (b.activatedAt ?? "").localeCompare(a.activatedAt ?? ""))[0] ?? null
  );
}

function context(now = Date.now()) {
  const program = activeProgram();
  if (!program) return null;
  const logs = mockState.logs.filter((l) => l.programId === program.id).map((l) => ({ programId: l.programId, date: l.date, sets: [] }));
  const currentWeek = weekOf(program, logs, now);
  const startDate = blockWeekStart(blockAnchorDate(program, logs).slice(0, 10), currentWeek);
  return { program, currentWeek, startDate };
}

const named = (sessions: ProgramSession[]): ProgramSession[] =>
  sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e, exerciseName: e.exerciseName ?? mockExerciseName(e.exerciseId) })),
  }));

/** Same shape and rules as `GET /v1/portal/week`. */
export function mockPortalWeek(now = Date.now()): PortalWeekDto {
  const ctx = context(now);
  if (!ctx) return { program: null, currentWeek: null, weeks: [] };
  const { program, currentWeek, startDate } = ctx;
  const maxes = mockState.clients.find((c) => c.id === CLIENT_ID)?.oneRepMaxes ?? null;
  const done = latestLogBySession(
    mockState.logs
      .filter((l) => l.clientId === CLIENT_ID && l.programId === program.id)
      .map((l) => ({ id: l.sessionLogId, programSessionId: l.programSessionId ?? null, date: l.date, loggedBy: l.loggedBy ?? "trainer" })),
  );
  const loads = {
    isBodyweight: (id: string) => loadStep(exercises.find((e) => e.id === id)?.equipment as Equipment | undefined) === null,
    lastWeights: lastWeightsOf(mockState.logs.filter((l) => l.clientId === CLIENT_ID)),
  };
  const weeks: PortalWeek[] = [];
  for (const week of [currentWeek, currentWeek + 1]) {
    const doc = program.weeks.find((w) => w.week === week);
    if (!doc && week !== currentWeek) continue;
    const start = week === currentWeek ? startDate : addDays(startDate, 7);
    weeks.push({
      week,
      startDate: start,
      endDate: addDays(start, 6),
      loggable: week === currentWeek,
      sessions: doc ? portalSessions(named(doc.sessions), maxes, (id) => (week === currentWeek ? (done.get(id) ?? null) : null), loads) : [],
    });
  }
  return { program: { id: program.id, name: program.name }, currentWeek, weeks };
}

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

export const mockPortalApi: PortalApi = {
  async session() {
    return { kind: "signedIn", me: { client: { id: CLIENT_ID, name: trainerClient.name }, trainer: { name: MOCK_TRAINER_NAME } } };
  },
  async week() {
    await delay(250);
    return mockPortalWeek();
  },
  async log(input: PortalLogInput): Promise<PortalSavedLog> {
    await delay(450);
    const ctx = context();
    if (!ctx) throw fail(422, "no active program");
    if (!weekSessions(ctx.program.weeks, ctx.currentWeek).some((s) => s.id === input.programSessionId)) {
      throw fail(422, "only this week's sessions can be logged");
    }
    const today = localDateOf(Date.now());
    if (input.date > addDays(today, 1)) throw fail(422, "date is in the future");
    if (input.date < addDays(ctx.startDate, -1)) throw fail(422, "date is before this week");
    const dupes = mockState.logs.filter(
      (l) => l.clientId === CLIENT_ID && l.programId === ctx.program.id && l.programSessionId === input.programSessionId,
    );
    const theirs = dupes.find((l) => (l.loggedBy ?? "trainer") !== "client");
    if (theirs || (dupes.length > 0 && (input.onDuplicate ?? "reject") === "reject")) {
      const latest = theirs ?? dupes[0];
      throw new PortalDuplicateError({ id: latest.sessionLogId, date: latest.date, loggedBy: latest.loggedBy ?? "trainer" });
    }
    if (dupes.length > 0) mockState.logs = mockState.logs.filter((l) => !dupes.includes(l));
    const id = uuid();
    mockState.logs.push({
      sessionLogId: id,
      loggedBy: "client",
      clientId: CLIENT_ID,
      programId: ctx.program.id,
      programSessionId: input.programSessionId,
      date: input.date,
      kind: input.kind ?? "lifting",
      cardio: input.cardio ?? null,
      perceivedEnergy: input.perceivedEnergy,
      readiness: input.readiness && Object.keys(input.readiness).length > 0 ? { ...input.readiness } : null,
      flags: input.flags?.length ? input.flags.map((f) => ({ ...f })) : null,
      notes: input.notes,
      sets: input.sets.map((s) => ({ ...s, type: s.type ?? "working" })),
    });
    return { id, programSessionId: input.programSessionId, date: input.date, loggedBy: "client" };
  },
  async deleteLog(id) {
    await delay(200);
    const before = mockState.logs.length;
    mockState.logs = mockState.logs.filter((l) => !(l.sessionLogId === id && l.clientId === CLIENT_ID && l.loggedBy === "client"));
    if (mockState.logs.length === before) throw fail(404, "log not found");
  },
  async linkInfo() {
    await delay(150);
    return { clientFirstName: trainerClient.name.split(/\s+/)[0], trainerName: MOCK_TRAINER_NAME };
  },
  async openLink() {
    await delay(200);
  },
  async signOut() {},
  googleHref: "/me",
};
