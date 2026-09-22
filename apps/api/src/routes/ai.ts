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
import { AiProgramDraft, KNOWN_PROVIDERS, estimate1rm } from "@pt/shared";
import { chatJson, extractJsonObject, ProviderError } from "../ai/provider";
import { buildGenerationMessages } from "../ai/prompt";
import { bindPendingExercises, draftToSessions } from "../lib/draftToProgram";
import { getDefaultTrainerId } from "../lib/trainer";

const HISTORY_WINDOW_DAYS = 56;

async function loadContext(trainerId: string, clientId: string, basedOnProgramId: string | null) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new ContextError(404, "client not found");

  const catalog = await db.select().from(exercises);
  const catalogByTrainer = catalog.filter((e) => e.trainerId === null || e.trainerId === trainerId);

  let previous = null;
  if (basedOnProgramId) {
    const [p] = await db.select().from(programs).where(eq(programs.id, basedOnProgramId));
    if (p) {
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

  // Group per exercise: recent working sets (text) + best e1RM in window.
  const byExercise = new Map<string, { name: string; sets: string[]; best: number }>();
  for (const set of sets) {
    if (set.type !== "working") continue;
    const exercise = catalogByTrainer.find((e) => e.id === set.exerciseId);
    if (!exercise) continue;
    const weight = set.weightKg ? Number(set.weightKg) : 0;
    const entry = byExercise.get(set.exerciseId) ?? { name: exercise.name, sets: [], best: 0 };
    entry.sets.push(`${weight ? `${weight}kg × ` : ""}${set.reps}${set.rpe ? ` @ RPE ${Number(set.rpe)}` : ""}`);
    entry.best = Math.max(entry.best, estimate1rm(weight, set.reps));
    byExercise.set(set.exerciseId, entry);
  }

  return {
    client: {
      name: client.name,
      goals: client.goals,
      limitations: client.limitations,
      daysPerWeek: client.daysPerWeek,
    },
    previousProgram: previous,
    history: [...byExercise.entries()].map(([id, h]) => ({
      exerciseName: h.name,
      recentSets: h.sets.slice(-6),
      bestE1rm: h.best,
    })),
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
  const envKey = known?.apiKeyEnvVar ?? `${id.toUpperCase()}_API_KEY`;
  const apiKey = process.env[envKey];
  if (!apiKey) throw new ContextError(400, `provider "${providerId}" not configured (missing ${envKey})`);
  return {
    baseUrl: process.env[`${id.toUpperCase()}_BASE_URL`] ?? known?.baseUrl ?? "",
    model: process.env[`${id.toUpperCase()}_MODEL`] ?? known?.model ?? "",
    apiKey,
    maxOutputTokens: known?.maxOutputTokens ?? 8192,
  };
}

export const aiRoutes = new Elysia({ prefix: "/v1/ai" })
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
            const raw = await chatJson(rt, [
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
            if (err instanceof ProviderError) throw err;
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
        if (err instanceof ProviderError) {
          return status(502, { error: err.message, detail: err.body });
        }
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: t.Object({
        clientId: t.String(),
        basedOnProgramId: t.Optional(t.String()),
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
