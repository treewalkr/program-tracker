import { Elysia, t } from "elysia";
import { and, asc, count, desc, eq, inArray, isNull, max, min } from "drizzle-orm";
import { clients, db, emailLog, exercises, feedbackItems, programs, sessionLogs, trainers, type ProgramRow } from "@pt/db";
import { ageOn, localDateOf, weekOf, type ProgramWeek } from "@pt/shared";
import { toSignalProgram } from "../lib/signals-service";
import { deleteTrainerSessions, isAdminEmail } from "../lib/auth";
import { trainerContext } from "../lib/trainer-context";
import { datasetStats } from "../lib/llm-dataset";
import { appUrl } from "../lib/email-links";
import { emailPreviews } from "../lib/email-previews";
import { setLoginTheme } from "../lib/login-theme";
import { LoginThemeBody } from "./public";
import { AdminModel } from "../models/admin";

type TrainerRow = typeof trainers.$inferSelect;

/** invited = added but never signed in; active = signed in at least once. */
const accessOf = (row: TrainerRow) => (row.disabledAt ? "disabled" : row.googleSub ? "active" : "invited");

const toDto = (row: TrainerRow, clientCount: number) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatarUrl: row.avatarUrl,
  access: accessOf(row) as "invited" | "active" | "disabled",
  isAdmin: isAdminEmail(row.email),
  clientCount,
  createdAt: row.createdAt.toISOString(),
  lastSignInAt: row.lastSignInAt?.toISOString() ?? null,
});

/** `kai.tan@gmail.com` → `k•••@gmail.com`: enough to tell accounts apart, not to copy. */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf("@");
  return at < 1 ? "•••" : `${email[0]}•••${email.slice(at)}`;
};

async function clientCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ trainerId: clients.trainerId, n: count() }).from(clients).groupBy(clients.trainerId);
  return new Map(rows.map((r) => [r.trainerId, Number(r.n)]));
}

/** A program's place in its block: `week` clamped to the plan, `rawWeek` as counted. */
export interface ActiveProgramme {
  row: ProgramRow;
  week: number;
  rawWeek: number;
  of: number;
}

/**
 * Each client's active program with its block week, keyed by clientId.
 * Two queries total: the programs, then each program's first log — the only
 * log that moves the block anchor (blockAnchorDate).
 */
async function activeProgrammes(clientIds?: string[]): Promise<Map<string, ActiveProgramme>> {
  if (clientIds && clientIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(programs)
    .where(
      clientIds
        ? and(eq(programs.status, "active"), inArray(programs.clientId, clientIds))
        : eq(programs.status, "active"),
    );
  if (rows.length === 0) return new Map();
  const firsts = await db
    .select({ programId: sessionLogs.programId, first: min(sessionLogs.date) })
    .from(sessionLogs)
    .where(inArray(sessionLogs.programId, rows.map((p) => p.id)))
    .groupBy(sessionLogs.programId);
  const firstOf = new Map(firsts.map((f) => [f.programId, f.first]));
  const out = new Map<string, ActiveProgramme>();
  for (const p of rows) {
    if (!p.clientId) continue;
    const first = firstOf.get(p.id);
    const rawWeek = weekOf(toSignalProgram(p), first ? [{ programId: p.id, date: first, sets: [] }] : []);
    const of = Math.max(1, p.phasing?.plannedWeeks ?? p.sessions.length);
    out.set(p.clientId, { row: p, week: Math.min(rawWeek, of), rawWeek, of });
  }
  return out;
}

const programmeRef = (a: ActiveProgramme | undefined) =>
  a ? { id: a.row.id, name: a.row.name, week: a.week, of: a.of, over: a.rawWeek > a.of } : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fill any missing exercise names from the exercises table — one lookup,
 *  any trainer's catalog (the admin has no trainer-scoped one). */
async function withExerciseNames(week: ProgramWeek): Promise<ProgramWeek> {
  const missing = [
    ...new Set(
      week.sessions.flatMap((s) => (s.exercises ?? []).filter((e) => !e.exerciseName && UUID.test(e.exerciseId)).map((e) => e.exerciseId)),
    ),
  ];
  if (missing.length === 0) return week;
  const rows = await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(inArray(exercises.id, missing));
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  return {
    ...week,
    sessions: week.sessions.map((s) => ({
      ...s,
      exercises: (s.exercises ?? []).map((e) => (e.exerciseName || !nameOf.has(e.exerciseId) ? e : { ...e, exerciseName: nameOf.get(e.exerciseId) })),
    })),
  };
}

/**
 * Platform admin console. Only the ADMIN_EMAIL account gets past the 403.
 * Adding a trainer is the invite: their Google sign-in with that email
 * links the account. Disabling signs them out everywhere.
 */
export const adminRoutes = new Elysia({ prefix: "/v1/admin", tags: ["admin"] })
  .use(trainerContext)
  .onBeforeHandle(({ isAdmin, status }) => {
    if (!isAdmin) return status(403, { error: "admin only" });
  })
  .get(
    "/trainers",
    async () => {
      const [rows, counts] = await Promise.all([db.select().from(trainers).orderBy(trainers.createdAt), clientCounts()]);
      return { trainers: rows.map((r) => toDto(r, counts.get(r.id) ?? 0)) };
    },
    { detail: { summary: "List trainer accounts" } },
  )
  .post(
    "/trainers",
    async ({ body, status }) => {
      const email = body.email.trim().toLowerCase();
      const [taken] = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.email, email)).limit(1);
      if (taken) return status(409, { error: `${email} already has an account` });
      const [created] = await db.insert(trainers).values({ name: body.name.trim(), email }).returning();
      return status(201, toDto(created, 0));
    },
    {
      body: AdminModel.invite,
      detail: { summary: "Add a trainer (they can then sign in with Google)" },
    },
  )
  .patch(
    "/trainers/:id",
    async ({ params, body, status }) => {
      const [row] = await db.select().from(trainers).where(eq(trainers.id, params.id));
      if (!row) return status(404, { error: "trainer not found" });
      if (body.disabled && isAdminEmail(row.email)) return status(409, { error: "the admin account can't be disabled" });

      const patch: Partial<typeof trainers.$inferInsert> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.disabled !== undefined) patch.disabledAt = body.disabled ? (row.disabledAt ?? new Date()) : null;
      const [updated] = Object.keys(patch).length
        ? await db.update(trainers).set(patch).where(eq(trainers.id, row.id)).returning()
        : [row];
      if (body.disabled) await deleteTrainerSessions(row.id);
      return toDto(updated, (await clientCounts()).get(row.id) ?? 0);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: AdminModel.editTrainer,
      detail: { summary: "Rename, disable or re-enable a trainer" },
    },
  )
  /** The login page's layout and accent — read back by the public GET /v1/public/login-theme. */
  .put("/login-theme", ({ body, trainerId }) => setLoginTheme(body, trainerId), {
    body: LoginThemeBody,
    response: LoginThemeBody,
    detail: { summary: "Set the login page's layout and accent" },
  })
  /** Only invites nobody has used yet — real accounts get disabled, never deleted (that would cascade their data). */
  .delete(
    "/trainers/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(trainers).where(eq(trainers.id, params.id));
      if (!row) return status(404, { error: "trainer not found" });
      if (row.googleSub || isAdminEmail(row.email)) {
        return status(409, { error: "this trainer has signed in — disable them instead" });
      }
      if ((await clientCounts()).get(row.id)) return status(409, { error: "this trainer has clients — disable them instead" });
      await db.delete(trainers).where(and(eq(trainers.id, row.id), isNull(trainers.googleSub)));
      return status(204);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }), detail: { summary: "Remove an unused invite" } },
  )
  /**
   * Every trainer's clients, read-only: the platform's shape, not anyone's
   * client notes — no client contact details, goals, limitations or 1RMs.
   */
  .get(
    "/clients",
    async () => {
      const last = db
        .select({ clientId: sessionLogs.clientId, at: max(sessionLogs.date).as("last_at") })
        .from(sessionLogs)
        .groupBy(sessionLogs.clientId)
        .as("last");
      const [rows, active] = await Promise.all([
        db
          .select({ client: clients, trainer: trainers, lastSessionAt: last.at })
          .from(clients)
          .innerJoin(trainers, eq(trainers.id, clients.trainerId))
          .leftJoin(last, eq(last.clientId, clients.id))
          .orderBy(asc(trainers.name), asc(clients.name)),
        activeProgrammes(),
      ]);
      return {
        clients: rows.map(({ client: c, trainer: t, lastSessionAt }) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          experience: c.experience ?? null,
          clientSince: c.startedOn ?? c.createdAt.toISOString().slice(0, 10),
          lastSessionAt: lastSessionAt ?? null,
          trainer: { id: t.id, name: t.name, access: accessOf(t) as "invited" | "active" | "disabled" },
          programme: programmeRef(active.get(c.id)),
        })),
      };
    },
    { detail: { summary: "List every trainer's clients (read-only directory)" } },
  )
  /**
   * One client, read-only: basics and this week of their active programme.
   * Never contact details, goals, limitations, 1RMs or the birth date (age only).
   */
  .get(
    "/clients/:id",
    async ({ params, status }) => {
      const [row] = await db
        .select({ client: clients, trainer: trainers })
        .from(clients)
        .innerJoin(trainers, eq(trainers.id, clients.trainerId))
        .where(eq(clients.id, params.id));
      if (!row) return status(404, { error: "client not found" });
      const { client: c, trainer: t } = row;
      const [[last], active] = await Promise.all([
        db.select({ at: max(sessionLogs.date) }).from(sessionLogs).where(eq(sessionLogs.clientId, c.id)),
        activeProgrammes([c.id]),
      ]);
      const a = active.get(c.id);
      const p = a?.row;
      const thisWeek = p ? (p.sessions.find((w) => w.week === a.week) ?? p.sessions[0]) : null;
      return {
        client: {
          id: c.id,
          name: c.name,
          status: c.status,
          experience: c.experience ?? null,
          age: c.birthDate ? ageOn(c.birthDate, localDateOf(Date.now())) : null,
          sex: c.sex ?? null,
          bodyweightKg: c.bodyweightKg ?? null,
          heightCm: c.heightCm ?? null,
          sessionsPerWeek: c.sessionsPerWeek ?? null,
          trainingDays: c.trainingDays ?? null,
          clientSince: c.startedOn ?? c.createdAt.toISOString().slice(0, 10),
          lastSessionAt: last?.at ?? null,
          trainer: { id: t.id, name: t.name, access: accessOf(t) as "invited" | "active" | "disabled" },
        },
        programme:
          a && p && thisWeek
            ? {
                id: p.id,
                name: p.name,
                version: p.version,
                aiAssisted: p.aiAssisted,
                activatedAt: p.activatedAt?.toISOString() ?? null,
                week: a.week,
                of: a.of,
                over: a.rawWeek > a.of,
                thisWeek: await withExerciseNames(thisWeek),
              }
            : null,
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: { summary: "One client's basics and active programme (read-only)" },
    },
  )
  .get("/llm-stats", () => datasetStats(), {
    detail: { summary: "LLM dataset counts: final calls by purpose and label, attempts by status, feedback, pairs" },
  })
  /** Recent sends, newest first. No bodies are stored; addresses come back masked. */
  .get(
    "/email-log",
    async ({ query }) => {
      const rows = await db
        .select({
          id: emailLog.id,
          kind: emailLog.kind,
          label: emailLog.label,
          error: emailLog.error,
          createdAt: emailLog.createdAt,
          name: trainers.name,
          email: trainers.email,
          feedbackNumber: feedbackItems.number,
        })
        .from(emailLog)
        .leftJoin(trainers, eq(trainers.id, emailLog.trainerId))
        .leftJoin(feedbackItems, eq(feedbackItems.id, emailLog.feedbackItemId))
        .orderBy(desc(emailLog.createdAt))
        .limit(query.limit ?? 200);
      return {
        sends: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          label: r.label,
          error: r.error,
          sentAt: r.createdAt.toISOString(),
          recipient: r.email ? { name: r.name ?? "", email: maskEmail(r.email) } : null,
          feedbackNumber: r.feedbackNumber,
        })),
      };
    },
    {
      query: t.Object({ limit: t.Optional(t.Integer({ minimum: 1, maximum: 500 })) }),
      detail: { summary: "Recent notification emails sent (recipient masked, no content)" },
    },
  )
  /** Every email the app sends, rendered by the live templates from sample data. */
  .get("/emails", () => ({ emails: emailPreviews(appUrl(), process.env.EMAIL_FROM?.trim() || undefined) }), {
    detail: { summary: "Preview each notification email" },
  });
