import { and, asc, count, desc, eq, ilike, inArray, max, or, sql, type SQL } from "drizzle-orm";
import { db, clients, programs, sessionLogs } from "@pt/db";
import { clampPage, weekOf, type Page, type RosterSort, type RosterStatus } from "@pt/shared";
import { openSignals, toSignalProgram } from "./signals-service";

export interface RosterQuery {
  q?: string;
  status: RosterStatus;
  sort: RosterSort;
  page: number;
  limit: number;
}

/** `ilike` pattern matching `q` literally anywhere (escapes `%`, `_` and `\`). */
const contains = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** active → paused → archived. */
const statusRank = sql<number>`case ${clients.status} when 'active' then 0 when 'paused' then 1 else 2 end`;

/**
 * One page of the trainer's client roster with each row's training status:
 * last session day, active program + block week, and open-signal count.
 * Paging and sorting happen in SQL; program/week/attention only for the page.
 * `counts` honour `q` but not `status`, so status tabs show what they'd give.
 */
export async function clientRoster(trainerId: string, query: RosterQuery, now = Date.now()) {
  const q = query.q?.trim();
  const scope = and(
    eq(clients.trainerId, trainerId),
    q ? or(ilike(clients.name, contains(q)), ilike(clients.email, contains(q))) : undefined
  );

  const grouped = await db
    .select({ status: clients.status, n: count() })
    .from(clients)
    .where(scope)
    .groupBy(clients.status);
  const counts = { all: 0, active: 0, paused: 0, archived: 0 };
  for (const { status, n } of grouped) {
    counts[status] += n;
    counts.all += n;
  }
  const total = counts[query.status];
  const page = clampPage(query.page, query.limit, total);

  const last = db
    .select({ clientId: sessionLogs.clientId, at: max(sessionLogs.date).as("last_at") })
    .from(sessionLogs)
    .groupBy(sessionLogs.clientId)
    .as("last");
  const order: SQL[] =
    query.sort === "last"
      ? [sql`${last.at} desc nulls last`, asc(clients.name)]
      : query.sort === "recent"
        ? [desc(clients.createdAt)]
        : [asc(statusRank), asc(clients.name)];

  const rows =
    total === 0
      ? []
      : await db
          .select({ client: clients, lastSessionAt: last.at })
          .from(clients)
          .leftJoin(last, eq(last.clientId, clients.id))
          .where(and(scope, query.status === "all" ? undefined : eq(clients.status, query.status)))
          .orderBy(...order, asc(clients.id))
          .limit(query.limit)
          .offset((page - 1) * query.limit);

  const ids = rows.map((r) => r.client.id);
  const active = ids.length
    ? await db
        .select()
        .from(programs)
        .where(and(eq(programs.trainerId, trainerId), eq(programs.status, "active"), inArray(programs.clientId, ids)))
    : [];
  const [logs, signals] = await Promise.all([
    active.length
      ? db
          .select({ programId: sessionLogs.programId, date: sessionLogs.date })
          .from(sessionLogs)
          .where(inArray(sessionLogs.programId, active.map((p) => p.id)))
      : Promise.resolve([]),
    ids.length ? openSignals(trainerId, now) : Promise.resolve([]),
  ]);

  const attention = new Map<string, number>();
  for (const s of signals) if (s.clientId) attention.set(s.clientId, (attention.get(s.clientId) ?? 0) + 1);

  const programOf = (clientId: string) => {
    const p = active.find((a) => a.clientId === clientId);
    if (!p) return null;
    const own = logs.filter((l) => l.programId === p.id).map((l) => ({ ...l, sets: [] }));
    const weeks = p.phasing?.plannedWeeks ?? p.sessions.length;
    return { id: p.id, name: p.name, week: weekOf(toSignalProgram(p), own, now), weeks };
  };

  const items = rows.map(({ client: c, lastSessionAt }) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status,
    goals: c.goals,
    limitations: c.limitations,
    sessionsPerWeek: c.sessionsPerWeek,
    trainingDays: c.trainingDays ?? [],
    cardioTarget: c.cardioTarget ?? null,
    createdAt: c.createdAt.toISOString(),
    lastSessionAt: lastSessionAt ?? null,
    program: programOf(c.id),
    attention: attention.get(c.id) ?? 0,
  }));

  return { items, total, page, limit: query.limit, counts } satisfies Page<(typeof items)[number]> & {
    counts: Record<RosterStatus, number>;
  };
}
