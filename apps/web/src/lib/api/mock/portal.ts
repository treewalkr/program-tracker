import {
  addDays,
  blockAnchorDate,
  blockWeekStart,
  lastSetsOf,
  lastWeightsOf,
  loadStep,
  latestLogBySession,
  localDateOf,
  nowOfDate,
  portalLogEntry,
  portalToday,
  portalCardio,
  portalSessions,
  portalWeekLabel,
  profileOn,
  sessionDateIn,
  weekOf,
  DisplayUnits,
  displayUnitsOf,
  cardioWeekTotals,
  isoWeekStart,
  portalCardioLog,
  PortalProgressDto,
  type Vo2Protocol,
  weekSessions,
  type Equipment,
  type PortalWeek,
  type PortalWeekDto,
  type ProgramSession,
  normalizeKind,
} from "@pt/shared";
import { uuid } from "$lib/uuid";
import { mockExerciseName, mockLogPrescription, mockPrepDone, mockState } from "./api";
import { exercises } from "./data";
import { nokClient, trainerClient } from "./data";
import { withKindAlias } from "./kindAlias";
import { PortalDuplicateError, type PortalApi, type PortalLogInput, type PortalSavedLog } from "../portalTypes";

/**
 * Mock client portal: the demo client (Nattapong) over the trainer mock's own
 * state — the same rules as `/v1/portal/*`, the same client-safe projection
 * (`portalSessions` from @pt/shared). No sign-in, so it works as a sales demo.
 */

export const MOCK_TRAINER_NAME = "Coach Ploy";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Demo states for browser checks, picked with `?mock=` on any portal URL and
 * kept for the tab: `empty` (no program yet), `midweek` (the block week
 * started 3 days ago, so earlier days are open), `cardio` (Nok, the cardio
 * member: intervals with bpm targets, coach feedback, VO₂max tests), `off`
 * clears it. Link token `expired` (`/me/link/expired`) is always the dead-link page.
 */
export type MockPortalScenario = "empty" | "midweek" | "cardio" | null;
const SCENARIOS = ["empty", "midweek", "cardio"] as const;
const isScenario = (v: string | null): v is Exclude<MockPortalScenario, null> => (SCENARIOS as readonly (string | null)[]).includes(v);
const SCENARIO_KEY = "pt.mock.portal";
export const EXPIRED_TOKEN = "expired";

export function mockScenario(): MockPortalScenario {
  if (typeof location === "undefined") return null;
  const asked = new URLSearchParams(location.search).get("mock");
  try {
    if (asked) sessionStorage.setItem(SCENARIO_KEY, asked === "off" ? "" : asked);
    const v = sessionStorage.getItem(SCENARIO_KEY);
    return isScenario(v) ? v : null;
  } catch {
    return isScenario(asked) ? asked : null;
  }
}

/** The demo member: Nattapong, or Nok in the `cardio` scenario. */
const demoClient = (scenario = mockScenario()) => (scenario === "cardio" ? nokClient : trainerClient);
const clientIdOf = (scenario = mockScenario()) => demoClient(scenario).id;

/**
 * Stable session ids for the demo: the trainer mock mints fresh uuids on every
 * load, so `/me/log/<id>` would die on reload. This week's sessions read
 * `ps-nat-<n>` (n = 1… in the week's session order; `ps-nok-<n>` for Nok), next
 * week's `ps-nat-next-<n>`; a save maps back.
 */
const realIdOf = new Map<string, string>();
const aliasOf = (real: string, n: number, loggable: boolean, clientId: string) => {
  const who = clientId.replace(/^cl-/, "");
  const alias = loggable ? `ps-${who}-${n}` : `ps-${who}-next-${n}`;
  realIdOf.set(alias, real);
  return alias;
};
const realId = (id: string) => realIdOf.get(id) ?? id;

function activeProgram(clientId: string) {
  return (
    mockState.programs
      .filter((p) => p.clientId === clientId && p.status === "active")
      .sort((a, b) => (b.activatedAt ?? "").localeCompare(a.activatedAt ?? ""))[0] ?? null
  );
}

function context(now = Date.now(), scenario = mockScenario()) {
  if (scenario === "empty") return null;
  const program = activeProgram(clientIdOf(scenario));
  if (!program) return null;
  const logs = mockState.logs.filter((l) => l.programId === program.id).map((l) => ({ programId: l.programId, date: l.date, sets: [] }));
  const currentWeek = weekOf(program, logs, now);
  const anchored = blockWeekStart(blockAnchorDate(program, logs).slice(0, 10), currentWeek);
  const startDate = scenario === "midweek" ? addDays(localDateOf(now), -3) : anchored;
  // before Week 1's start date nothing is loggable, like the API
  return { program, currentWeek, startDate, started: localDateOf(now) >= startDate };
}

const named = (sessions: ProgramSession[]): ProgramSession[] =>
  sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e, exerciseName: e.exerciseName ?? mockExerciseName(e.exerciseId) })),
  }));

/** Same shape and rules as `GET /v1/portal/week`. */
export function mockPortalWeek(now = Date.now(), scenario = mockScenario()): PortalWeekDto {
  const ctx = context(now, scenario);
  if (!ctx) return { program: null, currentWeek: null, weeks: [] };
  const { program, currentWeek, startDate, started } = ctx;
  const CLIENT_ID = clientIdOf(scenario);
  const maxes = mockState.clients.find((c) => c.id === CLIENT_ID)?.oneRepMaxes ?? null;
  const mine = mockState.logs.filter((l) => l.clientId === CLIENT_ID && l.programId === program.id);
  const done = latestLogBySession(
    mine.map((l) => ({ id: l.sessionLogId, programSessionId: l.programSessionId ?? null, date: l.date, loggedBy: l.loggedBy ?? "trainer", cardio: l.cardio ?? null })),
  );
  // the client's own log carries what they entered, like the API
  for (const [sid, log] of done) {
    const row = mine.find((l) => l.sessionLogId === log.id);
    if (row && log.loggedBy === "client") done.set(sid, { ...log, entry: portalLogEntry(row, row.sets) });
  }
  const loads = {
    isBodyweight: (id: string) => loadStep(exercises.find((e) => e.id === id)?.equipment as Equipment | undefined) === null,
    equipmentOf: (id: string) => exercises.find((e) => e.id === id)?.equipment as Equipment | undefined,
    lastWeights: lastWeightsOf(mockState.logs.filter((l) => l.clientId === CLIENT_ID)),
    lastSets: lastSetsOf(mockState.logs.filter((l) => l.clientId === CLIENT_ID), startDate),
    // the zones in effect today, so a zone target shows as bpm like the API
    hrZones: profileOn(mockState.hrProfiles.filter((p) => p.clientId === CLIENT_ID), localDateOf(now))?.zones ?? null,
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
      loggable: week === currentWeek && started,
      weekLabel: portalWeekLabel(program.phasing, week),
      sessions: doc
        ? portalSessions(named(doc.sessions), maxes, (id) => (week === currentWeek ? (done.get(id) ?? null) : null), {
            ...loads,
            hrZonesFor: (weekday) => profileOn(mockState.hrProfiles.filter((p) => p.clientId === CLIENT_ID), sessionDateIn(start, weekday))?.zones ?? null,
          }).map((s, i) => ({
            ...s,
            id: aliasOf(s.id, i + 1, week === currentWeek, CLIENT_ID),
          }))
        : [],
    });
  }
  const target = mockState.clients.find((c) => c.id === CLIENT_ID)?.cardioTarget ?? null;
  const cardio = portalCardio(target, mockState.logs.filter((l) => l.clientId === CLIENT_ID).map((l) => ({ date: l.date, kind: l.kind, cardio: l.cardio ?? null })), now);
  return { program: { id: program.id, name: program.name, startsOn: program.startsOn ?? null }, currentWeek, weeks, cardio };
}

/** Same shape and rules as `GET /v1/portal/progress`: this week, the recent cardio, one VO₂max trend. */
export function mockPortalProgress(now = Date.now(), asked?: Vo2Protocol | null, scenario = mockScenario()): PortalProgressDto {
  const client = demoClient(scenario);
  const weekStart = isoWeekStart(new Date(now));
  const cardio = mockState.logs.filter((l) => l.clientId === client.id && l.kind === "cardio");
  const thisWeek = cardio.filter((l) => l.date >= weekStart).map((l) => ({ date: l.date, kind: l.kind, cardio: l.cardio ?? null }));
  const { minutes, sessions, load, byModality } = cardioWeekTotals(thisWeek, weekStart);
  const recent = [...cardio]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_CARDIO)
    .map((l) =>
      portalCardioLog({
        id: l.sessionLogId,
        date: l.date,
        cardio: l.cardio ?? null,
        loggedBy: l.loggedBy ?? "trainer",
        trainerFeedback: l.trainerFeedback ?? null,
        reviewedAt: l.reviewedAt ?? null,
      }),
    );
  const tests = mockState.assessments.filter((a) => a.clientId === client.id).sort((a, b) => a.testedOn.localeCompare(b.testedOn));
  const protocols = [...new Set([...tests].reverse().map((a) => a.protocol))];
  const protocol = asked && protocols.includes(asked) ? asked : (protocols[0] ?? null);
  return PortalProgressDto.parse({
    week: { minutes, sessions, load, byModality },
    target: portalCardio(client.cardioTarget ?? null, thisWeek, now),
    recent,
    vo2: { protocols, protocol, points: tests.filter((a) => a.protocol === protocol).map((a) => ({ testedOn: a.testedOn, value: a.result })) },
  });
}

/** The demo members' display units, kept for the tab like the API keeps them per client. */
const UNITS_KEY = "pt.mock.portalUnits";
function storedUnits(): Record<string, DisplayUnits> {
  try {
    return JSON.parse(sessionStorage.getItem(UNITS_KEY) ?? "{}") as Record<string, DisplayUnits>;
  } catch {
    return {};
  }
}

/** As many recent cardio logs as the API sends. */
const RECENT_CARDIO = 12;

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

const rawMockPortalApi: PortalApi = {
  async session() {
    const c = demoClient();
    return { kind: "signedIn", me: { client: { id: c.id, name: c.name }, trainer: { name: MOCK_TRAINER_NAME } } };
  },
  async week() {
    await delay(250);
    return mockPortalWeek();
  },
  async settings() {
    await delay(150);
    return { units: displayUnitsOf(storedUnits()[clientIdOf()]) };
  },
  async saveSettings(units) {
    await delay(250);
    const parsed = DisplayUnits.safeParse(units);
    if (!parsed.success) throw fail(422, "invalid units");
    try {
      sessionStorage.setItem(UNITS_KEY, JSON.stringify({ ...storedUnits(), [clientIdOf()]: parsed.data }));
    } catch {
      // no storage: the choice lasts until reload
    }
    return { units: parsed.data };
  },
  async progress(protocol) {
    await delay(250);
    return mockPortalProgress(Date.now(), protocol);
  },
  async log(asked: PortalLogInput): Promise<PortalSavedLog> {
    await delay(450);
    const alias = asked.programSessionId;
    const input = { ...asked, programSessionId: realId(alias) };
    const CLIENT_ID = clientIdOf();
    // same rules as the API: the phone's date within a day of ours, nothing before the week
    const today = portalToday(input.today ?? localDateOf(Date.now()), Date.now());
    if (!today) throw fail(422, "check the date on your phone");
    const ctx = context(nowOfDate(today));
    if (!ctx) throw fail(422, "no active program");
    if (!ctx.started) throw fail(422, `your program starts on ${ctx.startDate}`);
    if (!weekSessions(ctx.program.weeks, ctx.currentWeek).some((s) => s.id === input.programSessionId)) {
      throw fail(422, "only this week's sessions can be logged");
    }
    if (input.date > today) throw fail(422, "date is in the future");
    if (input.date < ctx.startDate) throw fail(422, "date is before this week");
    const prepDone = mockPrepDone(ctx.program.id, input.programSessionId, input.sets, input.prepDone);
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
      // the session as prescribed, kept with the log like the API
      prescription: mockLogPrescription(ctx.program.id, input.programSessionId, CLIENT_ID, input.date),
      date: input.date,
      kind: normalizeKind(input.kind ?? "exercises"),
      cardio: input.cardio ?? null,
      perceivedEnergy: input.perceivedEnergy,
      readiness: input.readiness && Object.keys(input.readiness).length > 0 ? { ...input.readiness } : null,
      flags: input.flags?.length ? input.flags.map((f) => ({ ...f })) : null,
      notes: input.notes,
      durationMin: input.durationMin ?? null,
      prepDone,
      sets: input.sets.map((s) => ({ ...s, type: s.type ?? "working" })),
    });
    return { id, programSessionId: alias, date: input.date, loggedBy: "client" };
  },
  async deleteLog(id) {
    await delay(200);
    const CLIENT_ID = clientIdOf();
    // like the API: only a log whose session is in this week
    const own = mockState.logs.find((l) => l.sessionLogId === id && l.clientId === CLIENT_ID && l.loggedBy === "client");
    const ctx = context();
    if (own && (!ctx || !weekSessions(ctx.program.weeks, ctx.currentWeek).some((s) => s.id === own.programSessionId))) {
      throw fail(409, "only this week's logs can be removed");
    }
    const before = mockState.logs.length;
    mockState.logs = mockState.logs.filter((l) => !(l.sessionLogId === id && l.clientId === CLIENT_ID && l.loggedBy === "client"));
    if (mockState.logs.length === before) throw fail(404, "log not found");
  },
  async linkInfo(token) {
    await delay(150);
    if (token === EXPIRED_TOKEN) return null;
    return { clientFirstName: demoClient().name.split(/\s+/)[0], trainerName: MOCK_TRAINER_NAME };
  },
  async openLink() {
    await delay(200);
  },
  async signOut() {},
  googleHref: (returnTo) => returnTo,
};

export const mockPortalApi: PortalApi = withKindAlias(rawMockPortalApi);
