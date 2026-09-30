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
import { AiProgramDraft, KNOWN_PROVIDERS, blockPulse, pulseSummary, weekOf } from "@pt/shared";
import { chatJson, extractJsonObject, ProviderError } from "../ai/provider";
import { buildGenerationMessages } from "../ai/prompt";
import { MOCK_DRAFT } from "../ai/mock";
import { bindPendingExercises, draftToSessions } from "../lib/draftToProgram";
import { buildHistory } from "../lib/history";
import { getDefaultTrainerId } from "../lib/trainer";
import { toSignalLog, toSignalProgram } from "../lib/signals-service";

const HISTORY_WINDOW_DAYS = 56;

async function loadContext(trainerId: string, clientId: string, basedOnProgramId: string | null) {
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
      previous = {
        name: p.name,
        sessions: p.sessions.map((s) => ({
          name: s.name,
          exercises: s.exercises.map((e) => ({
            name: nameById.get(e.exerciseId) ?? e.exerciseId,
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

  // Auto-injected periodization context — derived, never trainer-editable.
  let periodization: string | null = null;
  if (basedOnProgram?.phasing) {
    const ph = basedOnProgram.phasing;
    const signalLogs = logs.map((l) =>
      toSignalLog(l, sets.filter((s) => s.sessionLogId === l.id))
    );
    const program = toSignalProgram(basedOnProgram);
    const week = weekOf(program, signalLogs);
    const directive = ph.weeks?.find((w) => w.week === week)?.directive;
    const summary = pulseSummary(blockPulse(program, signalLogs));
    periodization = [
      `week ${week} of ${ph.plannedWeeks} · ${ph.phase}`,
      directive ? `this week's directive: ${directive}` : null,
      summary,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return {
    client: {
      name: client.name,
      goals: client.goals,
      limitations: client.limitations,
      daysPerWeek: client.daysPerWeek,
    },
    previousProgram: previous,
    periodization,
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
    })),
  };
}

class ContextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function providerRuntime(providerId: string) {
  const known = KNOWN_PROVIDERS[providerId as keyof typeof KNOWN_PROVIDERS];
  const id = known?.id ?? providerId;
  if (id === "mock") {
    return { baseUrl: "mock://local", model: "mock-draft-v1", apiKey: "mock", maxOutputTokens: 4096 };
  }
  const envKey = known?.apiKeyEnvVar ?? `${id.toUpperCase()}_API_KEY`;
  const apiKey = process.env[envKey];
  if (!apiKey) throw new ContextError(400, `provider "${providerId}" not configured (missing ${envKey})`);
  return {
    baseUrl: process.env[`${id.toUpperCase()}_BASE_URL`] ?? known?.baseUrl ?? "",
    model: process.env[`${id.toUpperCase()}_MODEL`] ?? known?.model ?? "",
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
        const ctx = await loadContext(trainerId, body.clientId, body.basedOnProgramId ?? null);
        const rt = providerRuntime(body.providerId ?? "zai");
        const messages = buildGenerationMessages({
          ...ctx,
          trainerInstructions: body.instructions ?? "",
        });

        const [generation] = await db
          .insert(aiGenerations)
          .values({
            trainerId,
            clientId: body.clientId,
            basedOnProgramId: body.basedOnProgramId ?? null,
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
        instructions: t.Optional(t.String({ maxLength: 2000 })),
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
  /** Approve: draft → real draft-status Program (never client-visible until trainer activates). */
  .post(
    "/generations/:id/approve",
    async ({ params, status }) => {
      const trainerId = await getDefaultTrainerId();
      const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, params.id));
      if (!gen) return status(404, { error: "generation not found" });
      if (gen.status !== "validated") return status(409, { error: `generation is ${gen.status}, not validated` });
      if (!gen.draft) return status(409, { error: "generation has no draft" });

      const catalog = await db.select().from(exercises);
      const { sessions, createdNames, unresolvable } = draftToSessions(
        gen.draft,
        catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId)
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

      const finalSessions = bindPendingExercises(sessions, nameToId);
      const [program] = await db
        .insert(programs)
        .values({
          trainerId,
          clientId: gen.clientId,
          name: gen.draft.name,
          description: gen.draft.clientSummary,
          sessions: finalSessions,
          phasing: gen.draft.phasing ?? null,
          aiAssisted: true,
          createdFromProgramId: gen.basedOnProgramId,
          status: "draft",
        })
        .returning();

      await db.update(aiGenerations).set({ status: "approved" }).where(eq(aiGenerations.id, gen.id));
      return status(201, program);
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
  );
