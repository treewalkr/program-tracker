import { Elysia, t } from "elysia";
import { and, eq, isNull } from "drizzle-orm";
import { db, clients, trainerPreferences } from "@pt/db";
import { mockDistillPreferences } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { gatherPreferenceSignals } from "../lib/preferences";
import { buildDistillMessages } from "../ai/prompt";
import { callLlm } from "../ai/llm";
import { ContextError, providerRuntime } from "../ai/runtime";

export const preferenceRoutes = new Elysia({
  prefix: "/v1/ai/preferences",
  tags: ["preferences"],
})
  .use(trainerContext)
  .get("/", async ({ trainerId }) => {
    const rows = await db
      .select()
      .from(trainerPreferences)
      .where(eq(trainerPreferences.trainerId, trainerId));

    const trainerClients = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.trainerId, trainerId));
    const clientMap = new Map(trainerClients.map((c) => [c.id, c.name]));

    const sorted = [
      ...rows
        .filter((r) => r.clientId === null)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ...rows
        .filter((r) => r.clientId !== null)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    ].map((r) => ({
      ...r,
      clientName: r.clientId ? clientMap.get(r.clientId) ?? null : null,
    }));

    return { preferences: sorted };
  })
  .post(
    "/distill",
    async ({ body, status, trainerId }) => {
      let clientName: string | null = null;
      const targetClientId = body.clientId ?? null;

      if (targetClientId) {
        const [c] = await db
          .select()
          .from(clients)
          .where(
            and(
              eq(clients.id, targetClientId),
              eq(clients.trainerId, trainerId)
            )
          );
        if (!c) {
          return status(404, { error: "client not found" });
        }
        clientName = c.name;
      }

      const signals = await gatherPreferenceSignals(trainerId, targetClientId);
      if (signals.length === 0) {
        return status(422, { error: "no feedback signals to distill" });
      }

      const [existing] = await db
        .select()
        .from(trainerPreferences)
        .where(
          targetClientId
            ? and(
                eq(trainerPreferences.trainerId, trainerId),
                eq(trainerPreferences.clientId, targetClientId)
              )
            : and(
                eq(trainerPreferences.trainerId, trainerId),
                isNull(trainerPreferences.clientId)
              )
        );

      const previousDocument = existing?.document ?? null;
      const providerId = body.providerId ?? "zai";

      let rt: ReturnType<typeof providerRuntime>;
      try {
        rt = providerRuntime(providerId, providerId === "mock" ? undefined : body.model);
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
      if (providerId === "mock") rt = { ...rt, model: body.model ?? "mock-distill-v1" };
      const effectiveModel = rt.model;
      const messages = buildDistillMessages({ clientName, previousDocument, signals });
      const out = await callLlm({
        purpose: "distill",
        builder: "buildDistillMessages",
        links: { trainerId, clientId: targetClientId },
        context: { clientName, previousDocument, previousPreferenceId: existing?.id ?? null, signals },
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        rt,
        mode: "text",
        mock: () => mockDistillPreferences(signals),
      });
      if (!out.ok) {
        return status(502, { error: out.kind === "provider" ? out.error.message : "distill failed" });
      }
      let document = out.data.trim();
      if (!document) {
        return status(502, { error: "distill returned no content" });
      }
      if (document.length > 4000) {
        document = document.slice(0, 4000);
      }

      if (existing) {
        const [updated] = await db
          .update(trainerPreferences)
          .set({
            document,
            providerId,
            model: effectiveModel,
            updatedAt: new Date(),
          })
          .where(eq(trainerPreferences.id, existing.id))
          .returning();
        return status(200, { ...updated, clientName });
      } else {
        const [inserted] = await db
          .insert(trainerPreferences)
          .values({
            trainerId,
            clientId: targetClientId,
            document,
            providerId,
            model: effectiveModel,
          })
          .returning();
        return status(201, { ...inserted, clientName });
      }
    },
    {
      body: t.Object({
        clientId: t.Optional(t.Union([t.String(), t.Null()])),
        providerId: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    }
  )
  .delete(
    "/:id",
    async ({ params, status, trainerId }) => {
      const [existing] = await db
        .select()
        .from(trainerPreferences)
        .where(
          and(
            eq(trainerPreferences.id, params.id),
            eq(trainerPreferences.trainerId, trainerId)
          )
        );
      if (!existing) return status(404, { error: "preference not found" });
      await db
        .delete(trainerPreferences)
        .where(eq(trainerPreferences.id, params.id));
      return status(204);
    },
    { params: t.Object({ id: t.String() }) }
  );
