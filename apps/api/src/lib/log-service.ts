import { z } from "zod";
import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db, sessionLogs, setLogs, exercises, programs, clientHrProfiles } from "@pt/db";
import {
  CardioLog,
  cardioLogIssues,
  carriedReview,
  logPrepCheck,
  profileOn,
  upgradeCardioLog,
  withDurationMin,
  Readiness,
  SessionFlag,
  SessionKind,
  SetType,
  type LoggedBy,
  type LogPrescription,
  type ProgramWeek,
  type ReviewFieldsOf,
} from "@pt/shared";
import { queueSignalsForOutbox } from "./signals-service";

/**
 * Session log writes, shared by the trainer's log route and the client
 * portal — so validation, the duplicate lock and the signals hook stay
 * identical whoever logs.
 */

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

/** The fields of a full session log: session + sets in one payload. */
export const SessionLogFields = z.object({
  clientId: z.string().uuid(),
  programId: z.string().uuid(),
  programSessionId: z.string().uuid().nullable().optional(),
  date: IsoDate,
  kind: SessionKind.default("exercises"),
  cardio: CardioLog.nullable().optional(),
  notes: z.string().max(2000).optional(),
  perceivedEnergy: z.number().int().min(1).max(10).optional(),
  /** Pre-session sleep and soreness, 1–5 each. */
  readiness: Readiness.nullable().optional(),
  /** Per-exercise pain / technique / skipped flags. */
  flags: z.array(SessionFlag).max(100).nullable().optional(),
  /** Minutes from the first entry to Save (portal, logged live). */
  durationMin: z.number().int().min(1).max(600).optional(),
  /** Movement-prep items ticked (program-exercise ids); only the session's prep slots are kept. */
  prepDone: z.array(z.string().min(1).max(64)).max(50).optional(),
  /** Undo after Replace: the coach's review as the removed log had it (trainer route only; the portal omits it). */
  review: z
    .object({
      reviewedAt: z.string().datetime({ offset: true }).nullable(),
      trainerFeedback: z.string().max(2000).nullable(),
    })
    .optional(),
  /** When this program session is already logged: 409 (reject), swap it (replace), or keep both (add). */
  onDuplicate: z.enum(["reject", "replace", "add"]).default("reject"),
  /**
   * Replace only this log: when the session's newest log is another one (a stale save landing
   * late, after a newer save), it's a 409 with that log instead. Optional: absent, replace as before.
   */
  expectedLogId: z.string().uuid().optional(),
  sets: z
    .array(
      z.object({
        programExerciseId: z.string().uuid().nullable().optional(),
        exerciseId: z.string().uuid(),
        setNumber: z.number().int().min(1).max(20),
        type: SetType.default("working"),
        weightKg: z.number().min(0).max(600).optional(),
        reps: z.number().int().min(0).max(200),
        rpe: z.number().min(1).max(10).optional(),
        /** Saved untouched from the prescription (portal one-tap save). */
        asPlanned: z.boolean().optional(),
      })
    )
    .max(100),
});

/** Same four cardio rules as the shared SessionLog (domain.ts). */
export function refineLogKind(
  val: { kind: SessionKind; cardio?: unknown; sets: unknown[] },
  ctx: z.RefinementCtx
): void {
  if (val.kind === "exercises") {
    if (val.sets.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exercise log requires at least 1 set",
        path: ["sets"],
      });
    }
    if (val.cardio != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exercise log must not have cardio payload",
        path: ["cardio"],
      });
    }
  } else if (val.kind === "cardio") {
    if (val.cardio == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cardio log requires cardio payload",
        path: ["cardio"],
      });
    }
    if (val.sets.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cardio log must not have sets",
        path: ["sets"],
      });
    }
  }
}

/**
 * The cardio write rule (shared cardioLogIssues): a completed log needs its
 * time and session RPE, a skipped one only its reason. A minutes-only payload
 * comes from the previous web build (deploy window, rollback), which has no
 * required RPE, so it keeps the old rule: its minutes are enough.
 */
export function refineCardioLog(val: { kind: SessionKind; cardio?: CardioLog | null }, ctx: z.RefinementCtx): void {
  if (val.kind !== "cardio" || !val.cardio) return;
  if (val.cardio.durationSec == null && val.cardio.durationMin != null) return;
  for (const message of cardioLogIssues(upgradeCardioLog(val.cardio))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["cardio"] });
  }
}

/** A cardio payload as stored: seconds authoritative, minutes mirrored for a rollback. */
export const storedCardio = (cardio: CardioLog | null | undefined): CardioLog | null =>
  cardio ? withDurationMin(upgradeCardioLog(cardio)) : null;

/** Write boundary for a full session log. */
export const SessionLogInput = SessionLogFields.superRefine((val, ctx) => {
  refineLogKind(val, ctx);
  refineCardioLog(val, ctx);
});
export type SessionLogInput = z.infer<typeof SessionLogInput>;

/** numeric columns come back as strings — convert to numbers at the API boundary. */
export function serializeSets(rows: (typeof setLogs.$inferSelect)[]) {
  return rows.map((s) => ({
    ...s,
    weightKg: s.weightKg != null ? Number(s.weightKg) : null,
    rpe: s.rpe != null ? Number(s.rpe) : null,
  }));
}

type SerializedSet = ReturnType<typeof serializeSets>[number];

/** Which session logs to read; the scope (e.g. a trainer's clients) is always applied. */
export interface LogQuery {
  scope: SQL;
  clientIds?: string[];
  programId?: string;
  from?: string;
  to?: string;
  /** Newest N logs in all, or newest N per client when `perClient`. */
  limit: number;
  perClient?: boolean;
}

/**
 * Session logs, newest first, each with its sets — two queries whatever the
 * number of clients. Shared by GET /v1/logs/sessions and the home overview.
 */
export async function loadLogsWithSets(q: LogQuery) {
  if (q.clientIds && q.clientIds.length === 0) return [];
  const conds = [q.scope];
  if (q.clientIds) conds.push(inArray(sessionLogs.clientId, q.clientIds));
  if (q.programId) conds.push(eq(sessionLogs.programId, q.programId));
  if (q.from) conds.push(gte(sessionLogs.date, q.from));
  if (q.to) conds.push(lte(sessionLogs.date, q.to));
  const where = and(...conds);
  let logs;
  if (q.perClient) {
    const ranked = db
      .select({
        id: sessionLogs.id,
        rank: sql<number>`row_number() over (partition by ${sessionLogs.clientId} order by ${sessionLogs.date} desc)`.as(
          "rank"
        ),
      })
      .from(sessionLogs)
      .where(where)
      .as("ranked");
    const newest = db.select({ id: ranked.id }).from(ranked).where(lte(ranked.rank, q.limit));
    logs = await db.select().from(sessionLogs).where(inArray(sessionLogs.id, newest)).orderBy(desc(sessionLogs.date));
  } else {
    logs = await db.select().from(sessionLogs).where(where).orderBy(desc(sessionLogs.date)).limit(q.limit);
  }
  const sets = logs.length
    ? await db.select().from(setLogs).where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)))
    : [];
  const byLog = Map.groupBy(serializeSets(sets), (s) => s.sessionLogId);
  return logs.map((l) => ({ ...l, sets: byLog.get(l.id) ?? [] }));
}
type ReplacedLog = typeof sessionLogs.$inferSelect & { sets: SerializedSet[] };

export type CreateSessionLogResult =
  | { outcome: "created"; log: typeof sessionLogs.$inferSelect; sets: SerializedSet[]; replaced: ReplacedLog[] }
  | { outcome: "program_not_found" }
  | { outcome: "program_mismatch" }
  | { outcome: "unknown_exercises"; ids: string[] }
  | { outcome: "prep_sets"; ids: string[] }
  | { outcome: "conflict"; existing: { id: string; date: string; setCount: number; loggedBy: LoggedBy } };

/** The program session a log fulfils, wherever it sits in the weeks document; null for freestyle or a stale id. */
export function findProgramSession(weeks: readonly ProgramWeek[], programSessionId: string | null | undefined) {
  if (!programSessionId) return null;
  for (const w of weeks) for (const s of w.sessions) if (s.id === programSessionId) return s;
  return null;
}

/**
 * The snapshot a new log keeps of what it was measured against: the prescribed
 * session as it is now (deep copy), the program version, and for cardio the
 * bpm zones of the member's HR profile version in effect on the log's date.
 */
export async function logPrescription(
  program: Pick<typeof programs.$inferSelect, "version" | "sessions">,
  clientId: string,
  programSessionId: string | null | undefined,
  date: string
): Promise<LogPrescription | null> {
  const session = findProgramSession(program.sessions, programSessionId);
  if (!session) return null;
  const snapshot: LogPrescription = { programVersion: program.version, session: structuredClone(session) };
  if (session.kind === "cardio") {
    const versions = await db.select().from(clientHrProfiles).where(eq(clientHrProfiles.clientId, clientId));
    const profile = profileOn(versions, date);
    if (profile) {
      snapshot.hrProfileVersion = profile.version;
      snapshot.zonesBpm = profile.zones;
    }
  }
  return snapshot;
}

type ReviewFields = ReviewFieldsOf<Date>;

/** Which duplicates a `replace` may remove: any (the trainer), or only the client's own (the portal). */
export type ReplacePolicy = "any" | "own";

/**
 * Write a validated session log for a client of `trainerId`: checks the
 * program and exercises, takes the per-session lock, handles a duplicate per
 * `input.onDuplicate`, and queues signals once the write is committed.
 */
export async function createSessionLog({
  trainerId,
  input,
  loggedBy = "trainer",
  replacePolicy = "any",
}: {
  trainerId: string;
  input: SessionLogInput;
  loggedBy?: LoggedBy;
  replacePolicy?: ReplacePolicy;
}): Promise<CreateSessionLogResult> {
  const [program] = await db.select().from(programs).where(eq(programs.id, input.programId));
  if (!program) return { outcome: "program_not_found" };
  if (program.clientId !== input.clientId) return { outcome: "program_mismatch" };

  const exerciseIds = [...new Set(input.sets.map((s) => s.exerciseId))];
  if (exerciseIds.length > 0) {
    const known = await db.select().from(exercises).where(inArray(exercises.id, exerciseIds));
    // A swap may pick any exercise — but only from this trainer's catalog (seed or own).
    const knownIds = new Set(known.filter((e) => e.trainerId === null || e.trainerId === trainerId).map((e) => e.id));
    const missing = exerciseIds.filter((id) => !knownIds.has(id));
    if (missing.length) return { outcome: "unknown_exercises", ids: missing };
  }

  // Movement prep is a checklist: a set on a prep slot is refused, so no logged-set metric ever sees prep.
  // Only the session's prep slot ids are kept as ticks.
  const { prepSets, prepDone } = logPrepCheck(findProgramSession(program.sessions, input.programSessionId), input.sets, input.prepDone);
  if (prepSets.length) return { outcome: "prep_sets", ids: prepSets };

  const prescription = await logPrescription(program, input.clientId, input.programSessionId, input.date);

  const saved = await db.transaction(async (tx) => {
    // A duplicate is this exact program session logged again; ad-hoc logs never are.
    // Two saves of one session queue on this lock, so the second sees the first's row.
    const programSessionId = input.programSessionId;
    if (programSessionId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.clientId} || ':' || ${programSessionId}))`);
    }
    const duplicates = programSessionId
      ? await tx
          .select({ id: sessionLogs.id, date: sessionLogs.date, loggedBy: sessionLogs.loggedBy })
          .from(sessionLogs)
          .where(
            and(
              eq(sessionLogs.clientId, input.clientId),
              eq(sessionLogs.programId, input.programId),
              eq(sessionLogs.programSessionId, programSessionId)
            )
          )
          .orderBy(desc(sessionLogs.date))
      : [];
    // Under "own", a log someone else entered is never replaced (nor added beside): it's a 409.
    const locked = replacePolicy === "own" ? duplicates.find((d) => d.loggedBy !== loggedBy) : undefined;
    // A replace that names the log it saw: a newer log there now wins over this (stale) save.
    const stale = input.onDuplicate === "replace" && input.expectedLogId && duplicates.length > 0 && !duplicates.some((d) => d.id === input.expectedLogId);
    if ((duplicates.length > 0 && input.onDuplicate === "reject") || locked || stale) {
      const latest = locked ?? duplicates[0];
      const [{ setCount }] = await tx.select({ setCount: count() }).from(setLogs).where(eq(setLogs.sessionLogId, latest.id));
      return { conflict: { id: latest.id, date: latest.date, setCount, loggedBy: latest.loggedBy } } as const;
    }
    // Replace hands back what it removed, in full, so Undo can write it back.
    let replaced: ReplacedLog[] = [];
    if (duplicates.length > 0 && input.onDuplicate === "replace") {
      const ids = duplicates.map((d) => d.id);
      // Read the sets first: they go with their log (ON DELETE CASCADE).
      const removedSets = serializeSets(await tx.select().from(setLogs).where(inArray(setLogs.sessionLogId, ids)));
      const removed = await tx.delete(sessionLogs).where(inArray(sessionLogs.id, ids)).returning();
      // Newest first, like `duplicates`: the coach's note comes from the newest log that has one.
      const order = new Map(ids.map((id, i) => [id, i]));
      removed.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      replaced = removed.map((l) => ({ ...l, sets: removedSets.filter((st) => st.sessionLogId === l.id) }));
    }
    // A replace keeps the coach's review (D5); an Undo write-back (trainer only) restores it as it was.
    const review: ReviewFields =
      input.review && loggedBy === "trainer"
        ? {
            trainerFeedback: input.review.trainerFeedback,
            reviewedAt: input.review.reviewedAt ? new Date(input.review.reviewedAt) : null,
            reviewedBy: input.review.reviewedAt ? trainerId : null,
          }
        : carriedReview<Date>(replaced, loggedBy);
    const [log] = await tx
      .insert(sessionLogs)
      .values({
        clientId: input.clientId,
        programId: input.programId,
        programSessionId: input.programSessionId ?? null,
        date: input.date,
        kind: input.kind,
        cardio: storedCardio(input.cardio),
        notes: input.notes ?? null,
        perceivedEnergy: input.perceivedEnergy ?? null,
        // An empty readiness or flag list stores as null, like an old row.
        readiness: input.readiness && Object.keys(input.readiness).length > 0 ? input.readiness : null,
        flags: input.flags?.length ? input.flags : null,
        durationMin: input.durationMin ?? null,
        prepDone,
        prescription,
        loggedBy,
        ...review,
      })
      .returning();

    // Cardio logs carry no sets — drizzle `.values([])` throws, so insert only with rows.
    const insertedSets =
      input.sets.length > 0
        ? await tx
            .insert(setLogs)
            .values(
              input.sets.map((s) => ({
                sessionLogId: log.id,
                programExerciseId: s.programExerciseId ?? null,
                exerciseId: s.exerciseId,
                setNumber: s.setNumber,
                type: s.type,
                weightKg: s.weightKg !== undefined ? String(s.weightKg) : null,
                reps: s.reps,
                rpe: s.rpe !== undefined ? String(s.rpe) : null,
                asPlanned: s.asPlanned ?? false,
              }))
            )
            .returning()
        : [];
    return { log, insertedSets, replaced };
  });
  if ("conflict" in saved && saved.conflict) return { outcome: "conflict", existing: saved.conflict };
  const { log, insertedSets, replaced } = saved;

  // Write path: the log is committed — queue any new signals for the outbox.
  // A queueing failure must not fail the already-committed log write.
  await queueSignalsForOutbox(program.trainerId, input.clientId).catch((err) =>
    console.error("signal outbox queue failed:", err)
  );

  return { outcome: "created", log, sets: serializeSets(insertedSets), replaced };
}

/** Remove a log by id within `scope`; its sets go by cascade, then signals re-queue. */
export async function deleteSessionLog(trainerId: string, where: ReturnType<typeof and>): Promise<boolean> {
  const [deleted] = await db.delete(sessionLogs).where(where).returning({ clientId: sessionLogs.clientId });
  if (!deleted) return false;
  await queueSignalsForOutbox(trainerId, deleted.clientId).catch((err) => console.error("signal outbox queue failed:", err));
  return true;
}
