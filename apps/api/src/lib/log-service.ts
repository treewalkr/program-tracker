import { z } from "zod";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, sessionLogs, setLogs, exercises, programs } from "@pt/db";
import { CardioLog, Readiness, SessionFlag, SessionKind, SetType, type LoggedBy } from "@pt/shared";
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
  /** When this program session is already logged: 409 (reject), swap it (replace), or keep both (add). */
  onDuplicate: z.enum(["reject", "replace", "add"]).default("reject"),
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
        message: "lifting log requires at least 1 set",
        path: ["sets"],
      });
    }
    if (val.cardio != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lifting log must not have cardio payload",
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

/** Write boundary for a full session log. */
export const SessionLogInput = SessionLogFields.superRefine(refineLogKind);
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
type ReplacedLog = typeof sessionLogs.$inferSelect & { sets: SerializedSet[] };

export type CreateSessionLogResult =
  | { outcome: "created"; log: typeof sessionLogs.$inferSelect; sets: SerializedSet[]; replaced: ReplacedLog[] }
  | { outcome: "program_not_found" }
  | { outcome: "program_mismatch" }
  | { outcome: "unknown_exercises"; ids: string[] }
  | { outcome: "conflict"; existing: { id: string; date: string; setCount: number; loggedBy: LoggedBy } };

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
    if ((duplicates.length > 0 && input.onDuplicate === "reject") || locked) {
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
      replaced = removed.map((l) => ({ ...l, sets: removedSets.filter((st) => st.sessionLogId === l.id) }));
    }
    const [log] = await tx
      .insert(sessionLogs)
      .values({
        clientId: input.clientId,
        programId: input.programId,
        programSessionId: input.programSessionId ?? null,
        date: input.date,
        kind: input.kind,
        cardio: input.cardio ?? null,
        notes: input.notes ?? null,
        perceivedEnergy: input.perceivedEnergy ?? null,
        // An empty readiness or flag list stores as null, like an old row.
        readiness: input.readiness && Object.keys(input.readiness).length > 0 ? input.readiness : null,
        flags: input.flags?.length ? input.flags : null,
        durationMin: input.durationMin ?? null,
        loggedBy,
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
