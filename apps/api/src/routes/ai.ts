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
} from "@pt/db";
import {
  AiProgramDraft,
  AiProviderConfig,
  KNOWN_PROVIDERS,
  ProgramWeeksDocument,
  blockPulse,
  chainBalanceText,
  chainSetCounts,
  mockReviseDraft,
  pulseSummary,
  weekOf,
} from "@pt/shared";
import { chatJson, extractJsonObject, ProviderError } from "../ai/provider";
import {
  buildGenerationMessages,
  buildRevisionMessages,
  buildWeekMessages,
  buildWeekRevisionMessages,
  periodizationContext,
} from "../ai/prompt";
import { MOCK_DRAFT, mockWeekDraft } from "../ai/mock";
import { bindPendingExercises, draftToWeeks, replaceWeek } from "../lib/draftToProgram";
import { buildHistory } from "../lib/history";
import { getDefaultTrainerId } from "../lib/trainer";
import { ensureSeededChains } from "../lib/chains";
import { toSignalLog, toSignalProgram } from "../lib/signals-service";
import { toProgramDto } from "./programs";

const HISTORY_WINDOW_DAYS = 56;

async function loadContext(
  trainerId: string,
  clientId: string,
  basedOnProgramId: string | null,
  focus?: { focusWeek: number }
) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new ContextError(404, "client not found");

  const catalog = await db.select().from(exercises);
  const catalogByTrainer = catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId);

  let previous = null;
  let basedOnProgram = null;
  if (basedOnProgramId) {
    const [p] = await db.select().from(programs).where(eq(programs.id, basedOnProgramId));
    if (p) {
      basedOnProgram = p;
      const nameById = new Map(catalogByTrainer.map((e) => [e.id, e.name]));
      const targetWeekObj = focus?.focusWeek
        ? p.sessions.find((w) => w.week === focus.focusWeek) ?? p.sessions[p.sessions.length - 1]
        : p.sessions[p.sessions.length - 1];
      const targetSessions = targetWeekObj ? targetWeekObj.days.flatMap((d) => d.sessions) : [];
      previous = {
        name: p.name,
        sessions: targetSessions.map((s) => ({
          name: s.name,
          exercises: s.exercises.map((e) => ({
            name: nameById.get(e.exerciseId) ?? e.exerciseId,
            role: e.role,
            sets: e.prescribedSets.map(
              (ps) =>
                `${ps.reps}${ps.amrap ? "+" : ""} reps${ps.targetRpe ? ` @ RPE ${ps.targetRpe}` : ""}`
            ),
          })),
        })),
      };
    }
  }

  const since = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const logs = await db
    .select()
    .from(sessionLogs)
    .where(and(eq(sessionLogs.clientId, clientId), gte(sessionLogs.date, since)));
  const sets = logs.length
    ? await db.select().from(setLogs).where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)))
    : [];

  const chains = await ensureSeededChains(trainerId);
  const structuredLogs = logs.map((l) => ({
    date: l.date,
    sets: sets
      .filter((s) => s.sessionLogId === l.id)
      .map((s) => ({ exerciseId: s.exerciseId, type: s.type })),
  }));
  const counts = chainSetCounts(chains, structuredLogs, catalogByTrainer, since);
  const totalWorkingSets = sets.filter((s) => s.type === "working").length;
  const chainBalance = totalWorkingSets === 0 ? null : chainBalanceText(chains, counts);

  // Auto-injected periodization context — derived, never trainer-editable.
  let periodization: string | null = null;
  if (basedOnProgram?.phasing) {
    const ph = basedOnProgram.phasing;
    const signalLogs = logs.map((l) =>
      toSignalLog(l, sets.filter((s) => s.sessionLogId === l.id))
    );
    const program = toSignalProgram(basedOnProgram);
    const week = focus?.focusWeek ? focus.focusWeek + 1 : weekOf(program, signalLogs);
    const summary = pulseSummary(blockPulse(program, signalLogs));
    periodization = periodizationContext(ph, week, summary);
  }

  return {
    client: {
      name: client.name,
      goals: client.goals,
      limitations: client.limitations,
      daysPerWeek: client.daysPerWeek,
      cardioTarget: client.cardioTarget ?? null,
    },
    previousProgram: previous,
    periodization,
    chainBalance,
    programDirection: basedOnProgram?.direction ?? null,
    history: buildHistory({
      logs,
      sets,
      catalog: catalogByTrainer.map((e) => ({ id: e.id, name: e.name })),
    }),
    catalog: catalogByTrainer.map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment,
      movementPattern: e.movementPattern,
      functionalMovement: e.functionalMovement,
    })),
  };
}

class ContextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function providerRuntime(providerId: string, model?: string) {
  const known: AiProviderConfig | undefined = KNOWN_PROVIDERS[providerId as keyof typeof KNOWN_PROVIDERS];
  const id = known?.id ?? providerId;
  if (id === "mock") {
    if (model && model !== "mock-draft-v1")
      throw new ContextError(400, `model "${model}" not available for provider "mock"`);
    return { baseUrl: "mock://local", model: "mock-draft-v1", apiKey: "mock", maxOutputTokens: 4096 };
  }
  const envKey = known?.apiKeyEnvVar ?? `${id.toUpperCase()}_API_KEY`;
  const apiKey = process.env[envKey];
  if (!apiKey) throw new ContextError(400, `provider "${providerId}" not configured (missing ${envKey})`);
  const upper = id.toUpperCase();
  const models = process.env[`${upper}_MODELS`]?.split(",").map((s) => s.trim()).filter(Boolean)
    ?? known?.models
    ?? [];
  const defaultModel = process.env[`${upper}_MODEL`] ?? models[0] ?? "";
  if (model && model !== defaultModel && !models.includes(model))
    throw new ContextError(400, `model "${model}" not available for provider "${id}" (available: ${[defaultModel, ...models].join(", ")})`);
  return {
    baseUrl: process.env[`${upper}_BASE_URL`] ?? known?.baseUrl ?? "",
    model: model ?? defaultModel,
    apiKey,
    maxOutputTokens: known?.maxOutputTokens ?? 8192,
    disableThinking: known?.disableThinking,
  };
}

export const aiRoutes = new Elysia({ prefix: "/v1/ai", tags: ["ai"] })
  .post(
    "/generate",
    async ({ body, status }) => {
      const trainerId = await getDefaultTrainerId();
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
          const currentWeek = weekOf(toSignalProgram(basedProg), []);
          if (body.targetWeek !== currentWeek + 1) {
            return status(422, { error: `target week must be the upcoming week (week ${currentWeek} + 1)` });
          }

          const ctx = await loadContext(trainerId, body.clientId, body.basedOnProgramId, {
            focusWeek: currentWeek,
          });
          const rt = providerRuntime(body.providerId ?? "zai", body.model);

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
              providerId: body.providerId ?? "zai",
              model: rt.model,
              status: "pending",
            })
            .returning();

          let draft: z.infer<typeof AiProgramDraft> | null = null;
          let validationError: string | null = null;
          for (let attempt = 0; attempt < 2 && !draft; attempt++) {
            try {
              const raw =
                (body.providerId ?? "zai") === "mock"
                  ? JSON.stringify(mockWeekDraft(body.targetWeek, targetDirective))
                  : await chatJson(rt, [
                      { role: "system", content: messages.system },
                      { role: "user", content: messages.user },
                    ]);
              const parsed = AiProgramDraft.safeParse(JSON.parse(extractJsonObject(raw)));
              if (parsed.success) {
                draft = parsed.data;
              } else {
                validationError = z.prettifyError(parsed.error);
              }
            } catch (err) {
              if (err instanceof ProviderError) {
                const [failed] = await db
                  .update(aiGenerations)
                  .set({ status: "failed_provider", error: err.message })
                  .where(eq(aiGenerations.id, generation.id))
                  .returning();
                return status(502, failed);
              }
              validationError = `parse failure: ${(err as Error).message}`;
            }
          }

          if (draft) {
            const [updated] = await db
              .update(aiGenerations)
              .set({ status: "validated", draft, error: null })
              .where(eq(aiGenerations.id, generation.id))
              .returning();
            return status(201, updated);
          }

          const [failed] = await db
            .update(aiGenerations)
            .set({ status: "failed_validation", error: validationError })
            .where(eq(aiGenerations.id, generation.id))
            .returning();
          return status(502, failed);
        }

        const ctx = await loadContext(trainerId, body.clientId, body.basedOnProgramId ?? null);
        const rt = providerRuntime(body.providerId ?? "zai", body.model);
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
            providerId: body.providerId ?? "zai",
            model: rt.model,
            status: "pending",
          })
          .returning();

        // Call + validate, with exactly one retry on validation failure.
        let draft: z.infer<typeof AiProgramDraft> | null = null;
        let validationError: string | null = null;
        for (let attempt = 0; attempt < 2 && !draft; attempt++) {
          try {
            const raw =
              (body.providerId ?? "zai") === "mock"
                ? JSON.stringify(MOCK_DRAFT)
                : await chatJson(rt, [
                    { role: "system", content: messages.system },
                    { role: "user", content: messages.user },
                  ]);
            const parsed = AiProgramDraft.safeParse(JSON.parse(extractJsonObject(raw)));
            if (parsed.success) {
              draft = parsed.data;
            } else {
              validationError = z.prettifyError(parsed.error);
            }
          } catch (err) {
            if (err instanceof ProviderError) {
              // Persist the audit trail — a pending-forever row would lie.
              const [failed] = await db
                .update(aiGenerations)
                .set({ status: "failed_provider", error: err.message })
                .where(eq(aiGenerations.id, generation.id))
                .returning();
              return status(502, failed);
            }
            validationError = `parse failure: ${(err as Error).message}`;
          }
        }

        if (draft) {
          const [updated] = await db
            .update(aiGenerations)
            .set({ status: "validated", draft, error: null })
            .where(eq(aiGenerations.id, generation.id))
            .returning();
          return status(201, updated);
        }

        const [failed] = await db
          .update(aiGenerations)
          .set({ status: "failed_validation", error: validationError })
          .where(eq(aiGenerations.id, generation.id))
          .returning();
        return status(502, failed);
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
        instructions: t.Optional(t.String({ maxLength: 2000 })),
        direction: t.Optional(t.String({ maxLength: 500 })),
        targetWeek: t.Optional(t.Integer()),
      }),
    }
  )
  .get(
    "/generations",
    async ({ query }) => {
      const rows = query.clientId
        ? await db
            .select()
            .from(aiGenerations)
            .where(eq(aiGenerations.clientId, query.clientId))
            .orderBy(desc(aiGenerations.createdAt))
        : await db.select().from(aiGenerations).orderBy(desc(aiGenerations.createdAt));
      return rows;
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
    async ({ params, status }) => {
      const trainerId = await getDefaultTrainerId();
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

        const weekNow = weekOf(toSignalProgram(prog), []);
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
          client?.trainingDays
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

        await db.update(aiGenerations).set({ status: "approved" }).where(eq(aiGenerations.id, gen.id));
        return status(201, toProgramDto(updatedProgram));
      }

      const { weeks, createdNames, unresolvable } = draftToWeeks(
        gen.draft,
        catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId),
        gen.draft.phasing?.plannedWeeks ?? 4,
        client?.trainingDays
      );
      if (unresolvable.length > 0) {
        return status(422, { error: "draft references unresolvable exercises", refs: unresolvable });
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

      const finalWeeks = bindPendingExercises(weeks, nameToId);
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

      await db.update(aiGenerations).set({ status: "approved" }).where(eq(aiGenerations.id, gen.id));
      const { sessions, ...rest } = program;
      return status(201, { ...rest, weeks: sessions });
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/generations/:id/reject",
    async ({ params, status }) => {
      const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
      if (!gen) return status(404, { error: "generation not found" });
      const [updated] = await db
        .update(aiGenerations)
        .set({ status: "rejected" })
        .where(eq(aiGenerations.id, params.id))
        .returning();
      return updated;
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/generations/:id/revise",
    async ({ params, body, status }) => {
      const [parent] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
      if (!parent) return status(404, { error: "generation not found" });

      const message = body.message.trim();
      if (!message) return status(422, { error: "message must not be empty" });

      if (parent.status !== "validated") {
        return status(409, { error: `generation is ${parent.status}, not validated` });
      }

      const [pendingChild] = await db
        .select()
        .from(aiGenerations)
        .where(
          and(
            eq(aiGenerations.parentGenerationId, parent.id),
            eq(aiGenerations.status, "pending")
          )
        );
      if (pendingChild) {
        return status(409, { error: "a revision is already running for this generation" });
      }

      const [generation] = await db
        .insert(aiGenerations)
        .values({
          trainerId: parent.trainerId,
          clientId: parent.clientId,
          basedOnProgramId: parent.basedOnProgramId,
          kind: parent.kind,
          targetWeek: parent.targetWeek,
          direction: parent.direction,
          providerId: parent.providerId,
          model: parent.model,
          status: "pending",
          parentGenerationId: parent.id,
          revisionMessage: message,
        })
        .returning();

      try {
        let messages: { system: string; user: string } | null = null;
        let rt: ReturnType<typeof providerRuntime> | null = null;
        if (parent.providerId !== "mock") {
          if (parent.kind === "week") {
            const [basedProg] = parent.basedOnProgramId
              ? await db.select().from(programs).where(eq(programs.id, parent.basedOnProgramId))
              : [null];
            const focusWeek = basedProg
              ? weekOf(toSignalProgram(basedProg), [])
              : (parent.targetWeek ? parent.targetWeek - 1 : 1);
            const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId, {
              focusWeek,
            });
            const targetPlan = basedProg?.phasing?.weeks?.find((w) => w.week === parent.targetWeek);
            const targetDirective = targetPlan?.directive ?? null;
            const target = targetPlan?.target ?? null;
            const plannedWeeks = basedProg?.phasing?.plannedWeeks ?? basedProg?.sessions.length ?? 4;
            messages = buildWeekRevisionMessages({
              ...ctx,
              targetWeek: parent.targetWeek ?? 1,
              plannedWeeks,
              targetDirective,
              target,
              direction: parent.direction ?? ctx.programDirection,
              trainerInstructions: "",
              previousDraft: parent.draft!,
              feedback: message,
            });
          } else {
            const ctx = await loadContext(parent.trainerId, parent.clientId, parent.basedOnProgramId);
            messages = buildRevisionMessages({
              ...ctx,
              trainerInstructions: "",
              direction: parent.direction,
              previousDraft: parent.draft!,
              feedback: message,
            });
          }
          rt = providerRuntime(parent.providerId, parent.model);
        }

        // Call + validate, with exactly one retry on validation failure.
        let draft: z.infer<typeof AiProgramDraft> | null = null;
        let validationError: string | null = null;
        for (let attempt = 0; attempt < 2 && !draft; attempt++) {
          try {
            const raw =
              parent.providerId === "mock"
                ? JSON.stringify(mockReviseDraft(parent.draft!, message))
                : await chatJson(rt!, [
                    { role: "system", content: messages!.system },
                    { role: "user", content: messages!.user },
                  ]);
            const parsed = AiProgramDraft.safeParse(JSON.parse(extractJsonObject(raw)));
            if (parsed.success) {
              draft = parsed.data;
            } else {
              validationError = z.prettifyError(parsed.error);
            }
          } catch (err) {
            if (err instanceof ProviderError) {
              const [failed] = await db
                .update(aiGenerations)
                .set({ status: "failed_provider", error: err.message })
                .where(eq(aiGenerations.id, generation.id))
                .returning();
              return status(502, failed);
            }
            validationError = `parse failure: ${(err as Error).message}`;
          }
        }

        if (draft) {
          const [updated] = await db
            .update(aiGenerations)
            .set({ status: "validated", draft, error: null })
            .where(eq(aiGenerations.id, generation.id))
            .returning();
          return status(201, updated);
        }

        const [failed] = await db
          .update(aiGenerations)
          .set({ status: "failed_validation", error: validationError })
          .where(eq(aiGenerations.id, generation.id))
          .returning();
        return status(502, failed);
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
