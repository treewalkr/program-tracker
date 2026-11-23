import { Elysia, t } from "elysia";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  aiGenerations,
  clients,
  programs,
  sessionLogs,
  setLogs,
  trainerPreferences,
  type AiGenerationRow,
} from "@pt/db";
import {
  AiProgramDraft,
  blockPulse,
  chainBalanceText,
  chainSetCounts,
  combinePreferenceDocs,
  pulseSummary,
  type ProgramWeek, DEFAULT_PROVIDER_ID, PENDING_GENERATIONS_LIMIT, STALE_PENDING_MS } from "@pt/shared";
import { callLlm, contextSnapshot } from "../ai/llm";
import { settleGeneration } from "../lib/settle-generation";
import { draftToWeekDiff, recordFeedback, recordRegenerated } from "../lib/llm-feedback";
import { ContextError, providerRuntime, resolveEffort } from "../ai/runtime";
import {
  buildWeekMessages,
  periodizationContext,
} from "../ai/prompt";
import { mockWeekDraft } from "../ai/mock";
import { stampWeekDraft } from "../lib/draft-weeks";
import { startFill } from "../lib/fill";
import { approveGeneration } from "../lib/approve";
import { startBlock } from "../lib/block";
import { buildHistory } from "../lib/history";
import { trainerContext } from "../lib/trainer-context";
import { ensureSeededChains } from "../lib/chains";
import { currentBlockWeek, toSignalLog } from "../lib/signals-service";
import { toProgramDto } from "./programs";
import { loadContext } from "../lib/context";
import { runRevision } from "../lib/revision";
import { savePhasingEdit } from "../lib/phasing-edit";
import { saveDraftEdit } from "../lib/draft-edit";
import { abortGeneration, deregisterGeneration, registerGeneration } from "../ai/cancellation";
import { AiGenerationModel } from "../models/ai-generations";

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
          const targetRotation = basedProg.sessions.find((w) => w.week === targetWeek)?.rotation;
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
              mock: () => JSON.stringify(mockWeekDraft(targetWeek, targetDirective, targetRotation)),
            });
            // The draft is the target week, with its A/B letter.
            const { code, row } = await settleGeneration(generation.id, out.ok ? { ...out, data: stampWeekDraft(out.data, targetWeek, targetRotation) } : out);
            return status(code, row);
          } finally {
            deregisterGeneration(generation.id);
          }
        }

        const { code, row } = await startBlock(trainerId, body);
        return status(code, row);
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: AiGenerationModel.generate,
    }
  )
  /**
   * Fill with AI (FB-013): the AI writes every week after the last logged one
   * (and after the first week of each letter) of an existing program; the
   * trainer's weeks ride in the draft as locked weeks.
   */
  .post(
    "/fill",
    async ({ body, status, trainerId }) => {
      try {
        const res = await startFill(trainerId, body);
        if (!res.ok) return status(res.status, { error: res.error });
        return status(res.code, res.row);
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    { body: AiGenerationModel.fill }
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
  // Before "/generations/:id", so "pending" is never read as a generation id.
  .get(
    "/generations/pending",
    async ({ trainerId }) =>
      db
        .select({
          id: aiGenerations.id,
          clientId: aiGenerations.clientId,
          clientName: clients.name,
          kind: aiGenerations.kind,
          targetWeek: aiGenerations.targetWeek,
          createdAt: aiGenerations.createdAt,
        })
        .from(aiGenerations)
        .innerJoin(clients, eq(clients.id, aiGenerations.clientId))
        .where(
          and(
            eq(aiGenerations.trainerId, trainerId),
            eq(aiGenerations.status, "pending"),
            gte(aiGenerations.createdAt, new Date(Date.now() - STALE_PENDING_MS))
          )
        )
        .orderBy(desc(aiGenerations.createdAt))
        .limit(PENDING_GENERATIONS_LIMIT),
    { response: AiGenerationModel.pending }
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
  /**
   * Approve: draft → real draft-status Program (never client-visible until trainer activates),
   * or a week / fill written into the active program. At most once: a second approve (409
   * "This draft was already approved.") waits on the first and writes nothing.
   */
  .post(
    "/generations/:id/approve",
    async ({ params, status, trainerId }) => {
      const res = await approveGeneration(trainerId, params.id);
      if (!res.ok) return status(res.status, { error: res.error, ...(res.refs ? { refs: res.refs } : {}) });
      // After commit, so only the winning approve records feedback.
      await recordApproval(trainerId, res.gen, res.week, res.program.id);
      return status(201, toProgramDto(res.program));
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
      body: AiGenerationModel.reject,
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
  /**
   * Save a hand edit (move, superset, move to session, undo) as the next draft
   * version (no AI call), or fold it into the target when that is already the
   * latest hand-edit version (`folded`, 200). Ops replay on the stored draft
   * (@pt/shared draftEdit); `undo` is the op list that puts the previous draft back.
   */
  .post(
    "/generations/:id/edit",
    async ({ params, body, status }) => {
      const res = await saveDraftEdit(params.id, body.ops);
      if (!res.ok) return status(res.status, { error: res.error, ...(res.issues ? { issues: res.issues } : {}) });
      const { generation, message, undo, folded, version, changes } = res;
      return status(folded ? 200 : 201, { generation, message, undo, folded, version, changes });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ ops: t.Array(t.Unknown(), { minItems: 1, maxItems: 20 }) }),
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
      body: AiGenerationModel.revise,
    }
  );
