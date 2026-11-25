import { Elysia, t } from "elysia";
import { and, count, desc, eq, ne, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { db, programExamples, programs, sessionLogs } from "@pt/db";
import { localDateOf, Phasing, ProgramWeeksWrite, startsOnIssue } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { recordProgramEdit } from "../lib/llm-feedback";
import { ProgramModel } from "../models/programs";
import { ErrorBody } from "../models/shared";

/** Write boundary: raw jsonb weeks are only accepted if they pass the shared schema and the cardio workload rule. */
const WeeksDoc = ProgramWeeksWrite;

const STALE_SAVE = "This program changed since you opened it. Reload to see the latest.";

export function toProgramDto(row: typeof programs.$inferSelect) {
  const { sessions, ...rest } = row;
  return { ...rest, weeks: sessions };
}

/** null clears the phasing; a malformed document is a 422. */
function parsePhasing(raw: unknown): { ok: true; value: Phasing | null } | { ok: false; issues: unknown } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const parsed = Phasing.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: z.treeifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

export const programRoutes = new Elysia({ prefix: "/v1/programs", tags: ["programs"] })
  .use(trainerContext)
  .get("/", async ({ query, trainerId }) => {
    const rows = query.clientId
      ? await db
          .select()
          .from(programs)
          .where(and(eq(programs.trainerId, trainerId), eq(programs.clientId, query.clientId)))
          .orderBy(desc(programs.createdAt))
      : await db
          .select()
          .from(programs)
          .where(eq(programs.trainerId, trainerId))
          .orderBy(desc(programs.createdAt));
    return rows.map(toProgramDto);
  }, { response: t.Array(ProgramModel.dto) })
  .get(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!row) return status(404, { error: "program not found" });
      return toProgramDto(row);
    },
    { params: t.Object({ id: t.String() }), response: { 200: ProgramModel.dto, 404: ErrorBody } }
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const parsed = WeeksDoc.safeParse(body.weeks);
      if (!parsed.success) {
        return status(422, { error: "invalid weeks document", issues: z.treeifyError(parsed.error) });
      }
      const phasing = parsePhasing(body.phasing);
      if (!phasing.ok) {
        return status(422, { error: "invalid phasing document", issues: phasing.issues });
      }
      const [created] = await db
        .insert(programs)
        .values({
          trainerId,
          clientId: body.clientId ?? null,
          name: body.name,
          description: body.description ?? null,
          sessions: parsed.data,
          phasing: phasing.value,
          direction: body.direction ?? null,
          aiAssisted: body.aiAssisted ?? false,
          createdFromProgramId: body.createdFromProgramId ?? null,
        })
        .returning();
      return status(201, toProgramDto(created));
    },
    {
      body: ProgramModel.create,
      response: { 201: ProgramModel.dto, 422: ErrorBody },
    }
  )
  /** Replace the whole weeks document (trainer edited an active program) → version++.
   *  An absent phasing leaves it untouched; explicit null clears it.
   *  A `baseVersion` other than the stored one is a 409 (another tab or an AI fill saved first). */
  .put(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const parsed = WeeksDoc.safeParse(body.weeks);
      if (!parsed.success) {
        return status(422, { error: "invalid weeks document", issues: z.treeifyError(parsed.error) });
      }
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });
      if (body.baseVersion !== undefined && body.baseVersion !== current.version) {
        return status(409, { error: STALE_SAVE });
      }

      const update: Record<string, unknown> = { sessions: parsed.data, version: current.version + 1 };
      if (body.phasing !== undefined) {
        const phasing = parsePhasing(body.phasing);
        if (!phasing.ok) {
          return status(422, { error: "invalid phasing document", issues: phasing.issues });
        }
        update.phasing = phasing.value;
      }
      if (body.direction !== undefined) {
        update.direction = body.direction;
      }

      // Conditional on the version read above, so of two saves racing from one version only the first lands.
      const [updated] = await db
        .update(programs)
        .set(update)
        .where(
          body.baseVersion === undefined
            ? eq(programs.id, params.id)
            : and(eq(programs.id, params.id), eq(programs.version, current.version))
        )
        .returning();
      if (!updated) return body.baseVersion === undefined ? status(404, { error: "program not found" }) : status(409, { error: STALE_SAVE });
      await recordProgramEdit(trainerId, current, updated);
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: ProgramModel.replace,
      response: { 200: ProgramModel.dto, 404: ErrorBody, 409: ErrorBody, 422: ErrorBody },
    }
  )
  .patch(
    "/:id/direction",
    async ({ params, body, status }) => {
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });

      const [updated] = await db
        .update(programs)
        .set({ direction: body.direction })
        .where(eq(programs.id, params.id))
        .returning();
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: ProgramModel.direction,
      response: { 200: ProgramModel.dto, 404: ErrorBody },
    }
  )
  /** Status transitions; activating a program archives the client's other active ones
   *  and stamps activated_at on FIRST activation only (block-week anchor). */
  .patch(
    "/:id/status",
    async ({ params, body, status }) => {
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });
      if (body.startsOn !== undefined) {
        if (body.status !== "active") return status(422, { error: "startsOn is set on activation only" });
        const issue = startsOnIssue(body.startsOn, current.sessions.length, localDateOf(Date.now()));
        if (issue) return status(422, { error: issue });
      }

      if (body.status === "active" && current.clientId) {
        const clientPrograms = await db
          .select()
          .from(programs)
          .where(eq(programs.clientId, current.clientId));
        for (const p of clientPrograms) {
          if (p.id !== current.id && p.status === "active") {
            await db.update(programs).set({ status: "archived" }).where(eq(programs.id, p.id));
          }
        }
      }
      const stamp = body.status === "active" && !current.activatedAt ? { activatedAt: new Date() } : {};
      const start = body.startsOn !== undefined ? { startsOn: body.startsOn } : {};
      const [updated] = await db
        .update(programs)
        .set({ status: body.status, ...stamp, ...start })
        .where(eq(programs.id, params.id))
        .returning();
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: ProgramModel.status,
      response: { 200: ProgramModel.dto, 404: ErrorBody, 422: ErrorBody },
    }
  )
  /** Delete a program that was never used. Session logs cascade from programs, so one with any logs
   *  (the member's history) or one that is live is refused — archive those instead. A program kept in the
   *  example library is refused too: its example row would go with it. */
  .delete(
    "/:id",
    async ({ params, status, trainerId }) => {
      const [current] = await db
        .select()
        .from(programs)
        .where(and(eq(programs.id, params.id), eq(programs.trainerId, trainerId)));
      if (!current) return status(404, { error: "program not found" });
      if (current.status === "active") {
        return status(409, { error: "This program is active. Archive it first (activate another block), then it can be deleted if it was never logged." });
      }
      const [{ logs }] = await db.select({ logs: count() }).from(sessionLogs).where(eq(sessionLogs.programId, current.id));
      if (logs > 0) {
        return status(409, { error: "This program has logged sessions, so it can't be deleted. Archive it instead to keep the history." });
      }
      const [{ examples }] = await db.select({ examples: count() }).from(programExamples).where(eq(programExamples.programId, current.id));
      if (examples > 0) {
        return status(409, { error: "This program is in the example library. Remove it from the library first." });
      }
      // The same checks in the delete itself: a log or activation landing after the reads above keeps the program.
      const [deleted] = await db
        .delete(programs)
        .where(
          and(
            eq(programs.id, current.id),
            eq(programs.trainerId, trainerId),
            ne(programs.status, "active"),
            notExists(db.select({ one: sql`1` }).from(sessionLogs).where(eq(sessionLogs.programId, current.id))),
            notExists(db.select({ one: sql`1` }).from(programExamples).where(eq(programExamples.programId, current.id)))
          )
        )
        .returning({ id: programs.id });
      if (!deleted) return status(409, { error: "This program changed while you were deleting it. Reload and try again." });
      return { id: deleted.id };
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Object({ id: t.String() }), 404: ErrorBody, 409: ErrorBody },
      detail: { summary: "Delete a draft or never-logged program; active or logged ones answer 409 (archive instead)" },
    }
  )
  /** Move Week 1's start on an active program; every block week follows (logs keep their dates). */
  .patch(
    "/:id/starts-on",
    async ({ params, body, status }) => {
      const [current] = await db.select().from(programs).where(eq(programs.id, params.id));
      if (!current) return status(404, { error: "program not found" });
      if (current.status !== "active") return status(422, { error: "only an active program's start date can change" });
      const issue = startsOnIssue(body.startsOn, current.sessions.length, localDateOf(Date.now()));
      if (issue) return status(422, { error: issue });
      const [updated] = await db
        .update(programs)
        .set({ startsOn: body.startsOn })
        .where(eq(programs.id, params.id))
        .returning();
      return toProgramDto(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: ProgramModel.startsOn,
      response: { 200: ProgramModel.dto, 404: ErrorBody, 422: ErrorBody },
    }
  );
