import { Elysia, t } from "elysia";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  aiGenerations,
  clients,
  exercises,
  programs,
  sessionLogs,
  setLogs,
  trainerPreferences,
  type AiGenerationRow,
} from "@pt/db";
import {
  AiProgramDraft,
  ProgramWeeksDocument,
  blockPulse,
  chainBalanceText,
  chainSetCounts,
  combinePreferenceDocs,
  pulseSummary,
  type ProgramWeek, DEFAULT_PROVIDER_ID } from "@pt/shared";
import { callLlm, contextSnapshot } from "../ai/llm";
import { settleGeneration } from "../lib/settle-generation";
import { draftToWeekDiff, recordFeedback, recordRegenerated } from "../lib/llm-feedback";
import { ContextError, providerRuntime, resolveEffort } from "../ai/runtime";
import {
  buildGenerationMessages,
  buildWeekMessages,
  periodizationContext,
} from "../ai/prompt";
import { MOCK_DRAFT, mockWeekDraft } from "../ai/mock";
import { bindPendingExercises, draftToWeeks, replaceWeek } from "../lib/draftToProgram";
import { ensureSessionTypes } from "../lib/session-types";
import { buildHistory } from "../lib/history";
import { trainerContext } from "../lib/trainer-context";
import { ensureSeededChains } from "../lib/chains";
import { currentBlockWeek, toSignalLog } from "../lib/signals-service";
import { toProgramDto } from "./programs";
import { loadContext } from "../lib/context";
import { runRevision } from "../lib/revision";
import { savePhasingEdit } from "../lib/phasing-edit";
import { abortGeneration, deregisterGeneration, registerGeneration } from "../ai/cancellation";

/** Approve verdict: unedited when the approved week matches the AI draft, else edited with the diff. */
async function recordApproval(
  trainerId: string,
  gen: AiGenerationRow,
  week: ProgramWeek | undefined,
  programId: string
): Promise<void> {
  if (!gen.draft) return;
  const diff = await draftToWeekDiff(trainerId, gen.draft, week).catch(() => []);
  const edited = diff.length > 0 || gen.manualEdit;
  await recordFeedback({
    trainerId,
    clientId: gen.clientId,
    subjectKind: "generation",
    subjectId: gen.id,
    signal: edited ? "draft_approved_edited" : "draft_approved_unedited",
    payload: { programId, diff, manualEdit: gen.manualEdit },
  });
}

export const aiRoutes = new Elysia({ prefix: "/v1/ai", tags: ["ai"] })
  .use(trainerContext)
  .post(
    "/generate",
    async ({ body, status, trainerId }) => {
      try {
        if (body.targetWeek !== undefined && body.targetWeek !== null) {
          if (!body.basedOnProgramId) {
            return status(422, { error: "weekly generation requires basedOnProgramId" });
          }
          const [basedProg] = await db
            .select()
            .from(programs)
            .where(eq(programs.id, body.basedOnProgramId));
          if (!basedProg) {
            return status(404, { error: "program not found" });
          }
          if (basedProg.status !== "active") {
            return status(422, { error: "weekly generation requires an active program" });
          }
          if (body.targetWeek > basedProg.sessions.length) {
            return status(422, { error: "target week is beyond the block" });
          }
          const currentWeek = await currentBlockWeek(basedProg);
          if (body.targetWeek !== currentWeek + 1) {
            return status(422, { error: `target week must be the upcoming week (week ${currentWeek} + 1)` });
          }

          const ctx = await loadContext(trainerId, body.clientId, body.basedOnProgramId, {
            focusWeek: currentWeek,
          });
          const rt = providerRuntime(body.providerId ?? DEFAULT_PROVIDER_ID, body.model);
          const effort = resolveEffort(rt, body.effort);

          const targetWeek = body.targetWeek;
          const targetPlan = basedProg.phasing?.weeks?.find((w) => w.week === body.targetWeek);
          const targetDirective = targetPlan?.directive ?? null;
          const target = targetPlan?.target ?? null;
          const plannedWeeks = basedProg.phasing?.plannedWeeks ?? basedProg.sessions.length;

          const messages = buildWeekMessages({
            ...ctx,
            targetWeek: body.targetWeek,
            plannedWeeks,
            targetDirective,
            target,
            direction: ctx.programDirection,
            trainerInstructions: body.instructions ?? "",
          });

          const [generation] = await db
            .insert(aiGenerations)
            .values({
              trainerId,
              clientId: body.clientId,
              basedOnProgramId: body.basedOnProgramId,
              kind: "week",
              targetWeek: body.targetWeek,
              direction: ctx.programDirection,
              instructions: body.instructions ?? null,
              providerId: body.providerId ?? DEFAULT_PROVIDER_ID,
              model: rt.model,
              effort,
              status: "pending",
              exampleProgramIds: ctx.examples.map((e) => e.programId),
            })
            .returning();

          await recordRegenerated(trainerId, body.clientId, "week", generation.id);
          const ac = registerGeneration(generation.id);
          try {
            const out = await callLlm({
              purpose: "week_generate",
              builder: "buildWeekMessages",
              links: { trainerId, clientId: body.clientId, generationId: generation.id },
              context: contextSnapshot(ctx, {
                basedOnProgramId: basedProg.id,
                basedOnProgramVersion: basedProg.version,
                targetWeek: body.targetWeek,
                plannedWeeks,
                targetDirective,
                target,
                direction: ctx.programDirection,
                trainerInstructions: body.instructions ?? "",
              }),
              messages: [
                { role: "system", content: messages.system },
                { role: "user", content: messages.user },
              ],
              rt,
              effort,
              signal: ac.signal,
              mode: "json",
              schema: AiProgramDraft,
              mock: () => JSON.stringify(mockWeekDraft(targetWeek, targetDirective)),
            });
            const { code, row } = await settleGeneration(generation.id, out);
            return status(code, row);
          } finally {
            deregisterGeneration(generation.id);
          }
        }

        const ctx = await loadContext(trainerId, body.clientId, body.basedOnProgramId ?? null);
        const rt = providerRuntime(body.providerId ?? DEFAULT_PROVIDER_ID, body.model);
        const effort = resolveEffort(rt, body.effort);
        const messages = buildGenerationMessages({
          ...ctx,
          direction: body.direction ?? null,
          trainerInstructions: body.instructions ?? "",
        });

        const [generation] = await db
          .insert(aiGenerations)
          .values({
            trainerId,
            clientId: body.clientId,
            basedOnProgramId: body.basedOnProgramId ?? null,
            kind: "block",
            direction: body.direction ?? null,
            instructions: body.instructions ?? null,
            providerId: body.providerId ?? DEFAULT_PROVIDER_ID,
            model: rt.model,
            effort,
            status: "pending",
            exampleProgramIds: ctx.examples.map((e) => e.programId),
          })
          .returning();

        await recordRegenerated(trainerId, body.clientId, "block", generation.id);
        const ac = registerGeneration(generation.id);
        try {
          // Call + validate, with exactly one retry on validation failure.
          const out = await callLlm({
            purpose: "block_generate",
            builder: "buildGenerationMessages",
            links: { trainerId, clientId: body.clientId, generationId: generation.id },
            context: contextSnapshot(ctx, {
              basedOnProgramId: body.basedOnProgramId ?? null,
              direction: body.direction ?? null,
              trainerInstructions: body.instructions ?? "",
            }),
            messages: [
              { role: "system", content: messages.system },
              { role: "user", content: messages.user },
            ],
            rt,
            effort,
            signal: ac.signal,
            mode: "json",
            schema: AiProgramDraft,
            mock: () => JSON.stringify(MOCK_DRAFT),
          });
          const { code, row } = await settleGeneration(generation.id, out);
          return status(code, row);
        } finally {
          deregisterGeneration(generation.id);
        }
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: t.Object({
        clientId: t.String(),
        basedOnProgramId: t.Optional(t.Union([t.String(), t.Null()])),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        effort: t.Optional(t.String()),
        instructions: t.Optional(t.String({ maxLength: 2000 })),
        direction: t.Optional(t.String({ maxLength: 500 })),
        targetWeek: t.Optional(t.Integer()),
      }),
    }
  )
  .get(
    "/generations",
    async ({ query, trainerId }) => {
      const mine = eq(aiGenerations.trainerId, trainerId);
      return db
        .select()
        .from(aiGenerations)
        .where(query.clientId ? and(mine, eq(aiGenerations.clientId, query.clientId)) : mine)
        .orderBy(desc(aiGenerations.createdAt));
    },
    { query: t.Object({ clientId: t.Optional(t.String()) }) }
  )
  .get(
    "/generations/:id",
    async ({ params, status }) => {
      const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
      if (!gen) return status(404, { error: "generation not found" });
      return gen;
    },
    { params: t.Object({ id: t.String() }) }
  )
  /** Approve: draft → real draft-status Program (never client-visible until trainer activates). */
  .post(
    "/generations/:id/approve",
    async ({ params, status, trainerId }) => {
      const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
      if (!gen) return status(404, { error: "generation not found" });
      if (gen.status !== "validated") return status(409, { error: `generation is ${gen.status}, not validated` });
      if (!gen.draft) return status(409, { error: "generation has no draft" });

      const [client] = gen.clientId
        ? await db.select().from(clients).where(eq(clients.id, gen.clientId))
        : [null];

      const catalog = await db.select().from(exercises);
      if (gen.kind === "week") {
        if (!gen.basedOnProgramId) return status(404, { error: "program not found" });
        const [prog] = await db.select().from(programs).where(eq(programs.id, gen.basedOnProgramId));
        if (!prog) return status(404, { error: "program not found" });
        if (prog.status !== "active") return status(409, { error: "program is not active" });

        const weekNow = await currentBlockWeek(prog);
        if (
          !gen.targetWeek ||
          gen.targetWeek > prog.sessions.length ||
          !(gen.targetWeek === weekNow || gen.targetWeek === weekNow + 1)
        ) {
          return status(409, { error: "generation targets a week that is no longer current" });
        }

        const { weeks, createdNames, unresolvable } = replaceWeek(
          prog.sessions,
          gen.targetWeek,
          gen.draft,
          catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId),
          client,
          await ensureSessionTypes(trainerId)
        );
        if (unresolvable.length > 0) {
          return status(422, { error: "draft references unresolvable exercises", refs: unresolvable });
        }

        const nameToId = new Map<string, string>();
        for (const name of createdNames) {
          const [created] = await db
            .insert(exercises)
            .values({
              trainerId,
              name,
              primaryMuscleGroup: "full_body",
              equipment: "other",
            })
            .returning();
          nameToId.set(name.toLowerCase(), created.id);
        }

        const finalWeeks = bindPendingExercises(weeks, nameToId);
        const parsedDoc = ProgramWeeksDocument.safeParse(finalWeeks);
        if (!parsedDoc.success) {
          return status(422, { error: "invalid weeks document" });
        }

        const [updatedProgram] = await db
          .update(programs)
          .set({
            sessions: parsedDoc.data,
            version: prog.version + 1,
          })
          .where(eq(programs.id, prog.id))
          .returning();

        await db
          .update(aiGenerations)
          .set({ status: "approved", approvedProgramId: prog.id })
          .where(eq(aiGenerations.id, gen.id));
        await recordApproval(trainerId, gen, parsedDoc.data.find((w) => w.week === gen.targetWeek), prog.id);
        return status(201, toProgramDto(updatedProgram));
      }

      const { weeks, createdNames, unresolvable } = draftToWeeks(
        gen.draft,
        catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId),
        gen.draft.phasing?.plannedWeeks ?? 4,
        client,
        await ensureSessionTypes(trainerId)
      );
      if (unresolvable.length > 0) {
        return status(422, { error: "draft references unresolvable exercises", refs: unresolvable });
      }

      const parsedDoc = ProgramWeeksDocument.safeParse(weeks);
      if (!parsedDoc.success) {
        await db
          .update(aiGenerations)
          .set({ status: "failed_validation", error: z.prettifyError(parsedDoc.error) })
          .where(eq(aiGenerations.id, gen.id));
        return status(422, { error: "invalid weeks document" });
      }

      // Create custom exercise rows for genuinely new movements.
      const nameToId = new Map<string, string>();
      for (const name of createdNames) {
        const [created] = await db
          .insert(exercises)
          .values({
            trainerId,
            name,
            primaryMuscleGroup: "full_body", // trainer renames/recategorizes later
            equipment: "other",
          })
          .returning();
        nameToId.set(name.toLowerCase(), created.id);
      }

      const finalWeeks = bindPendingExercises(parsedDoc.data, nameToId);
      const [program] = await db
        .insert(programs)
        .values({
          trainerId,
          clientId: gen.clientId,
          name: gen.draft.name,
          description: gen.draft.clientSummary,
          sessions: finalWeeks,
          phasing: gen.draft.phasing ?? null,
          direction: gen.direction ?? null,
          aiAssisted: true,
          createdFromProgramId: gen.basedOnProgramId,
          status: "draft",
        })
        .returning();

      await db
        .update(aiGenerations)
        .set({ status: "approved", approvedProgramId: program.id })
        .where(eq(aiGenerations.id, gen.id));
      await recordApproval(trainerId, gen, finalWeeks[0], program.id);
      const { sessions, ...rest } = program;
      return status(201, { ...rest, weeks: sessions });
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/generations/:id/reject",
    async ({ params, body, status, trainerId }) => {
      const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
      if (!gen) return status(404, { error: "generation not found" });
      const reason = body?.reason?.trim() || null;
      const [updated] = await db
        .update(aiGenerations)
        .set(reason ? { status: "rejected", rejectReason: reason } : { status: "rejected" })
        .where(eq(aiGenerations.id, params.id))
        .returning();
      await recordFeedback({
        trainerId,
        clientId: gen.clientId,
        subjectKind: "generation",
        subjectId: gen.id,
        signal: "draft_rejected",
        comment: reason,
      });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Optional(t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) })),
    }
  )
  .post(
    "/generations/:id/cancel",
    async ({ params, status }) => {
      const [cancelled] = await db
        .update(aiGenerations)
        .set({ status: "cancelled" })
        .where(and(eq(aiGenerations.id, params.id), eq(aiGenerations.status, "pending")))
        .returning();

      if (!cancelled) {
        const [row] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
        if (!row) return status(404, { error: "generation not found" });
        return status(409, { error: `generation is ${row.status}, not pending` });
      }

      abortGeneration(params.id);
      return cancelled;
    },
    { params: t.Object({ id: t.String() }) }
  )
  /** Save a trainer-edited block plan as the next draft version (no AI call). */
  .post(
    "/generations/:id/phasing",
    async ({ params, body, status }) => {
      const res = await savePhasingEdit(params.id, body.phasing);
      if (!res.ok) return status(res.status, { error: res.error, ...(res.issues ? { issues: res.issues } : {}) });
      return status(201, res.generation);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ phasing: t.Unknown() }),
    }
  )
  .post(
    "/generations/:id/revise",
    async ({ params, body, status }) => {
      try {
        const res = await runRevision(params.id, body.message, { lockPhasing: true });
        if (!res.ok) {
          return status(res.status, { error: res.error });
        }
        const code =
          res.generation.status === "validated"
            ? 201
            : res.generation.status === "cancelled"
              ? 200
              : 502;
        return status(code, res.generation);
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ message: t.String({ minLength: 1, maxLength: 2000 }) }),
    }
  );
