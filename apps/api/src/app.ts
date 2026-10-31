import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { z } from "zod";
import { KNOWN_PROVIDERS, AiProviderConfig } from "@pt/shared";
import { aiRoutes } from "./routes/ai";
import { clientRoutes } from "./routes/clients";
import { programRoutes } from "./routes/programs";
import { exampleRoutes } from "./routes/examples";
import { logRoutes } from "./routes/logs";
import { exerciseRoutes } from "./routes/exercises";
import { schemeRoutes } from "./routes/schemes";
import { chainRoutes } from "./routes/chains";
import { promptTemplateRoutes } from "./routes/prompt-templates";
import { notificationRoutes } from "./routes/notifications";
import { clientMessageRoutes } from "./routes/client-messages";

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const TAGS = [
  { name: "health", description: "Liveness and provider discovery" },
  { name: "ai", description: "AI draft generation, audit trail, and approval gate" },
  { name: "client-messages", description: "Client-facing weekly messages — AI-drafted, trainer-approved, copy-to-LINE" },
  { name: "prompt-templates", description: "Reusable instruction template library" },
  { name: "clients", description: "Client management" },
  { name: "programs", description: "Versioned program documents and lifecycle" },
  { name: "examples", description: "Gold-standard program library used as AI few-shot examples" },
  { name: "logs", description: "Session logging and history aggregation" },
  { name: "exercises", description: "Exercise catalog" },
  { name: "schemes", description: "Periodization scheme library" },
  { name: "chains", description: "Kinetic chains — trainer-maintained muscle-group sets" },
  { name: "notifications", description: "Phase-change signals and snooze" },
];

export const app = new Elysia()
  .use(cors({ origin: corsOrigins }))
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: {
          title: "Program Tracker API",
          version: "0.1.0",
          description:
            "REST API for the trainer app. Programs are versioned jsonb documents; logs are normalized rows; AI drafts are zod-gated and require trainer approval.",
        },
        tags: TAGS,
      },
      // routes that validate with zod (Standard Schema) still render in the spec
      mapJsonSchema: { zod: z.toJSONSchema },
    }),
  )
  .get("/health", () => ({ ok: true, service: "program-tracker-api", time: new Date().toISOString() }), {
    detail: { summary: "Liveness probe", tags: ["health"] },
  })
  /**
   * Which AI providers are usable right now. API keys are read server-side
   * only — the response carries config, never secrets.
   */
  .get("/v1/ai/providers", () => {
    const providers = Object.values(KNOWN_PROVIDERS).map((p) => {
      const parsed = AiProviderConfig.parse(p);
      const id = p.id.toUpperCase();
      const models = process.env[`${id}_MODELS`]?.split(",").map((s) => s.trim()).filter(Boolean)
        ?? parsed.models;
      const model = process.env[`${id}_MODEL`] ?? models[0];
      // the env default may sit outside the listed models — keep it pickable
      const pickable = models.includes(model) ? models : [model, ...models];
      return {
        ...parsed,
        configured: p.id === "mock" || Boolean(process.env[p.apiKeyEnvVar]),
        model,
        models: pickable,
        baseUrl: process.env[`${id}_BASE_URL`] ?? parsed.baseUrl,
      };
    });
    return { providers };
  }, {
    detail: {
      summary: "List configured AI providers",
      description: "Which providers have a server-side API key. The response carries config, never secrets.",
      tags: ["health"],
    },
  })
  .use(aiRoutes)
  .use(clientMessageRoutes)
  .use(clientRoutes)
  .use(programRoutes)
  .use(exampleRoutes)
  .use(logRoutes)
  .use(exerciseRoutes)
  .use(schemeRoutes)
  .use(chainRoutes)
  .use(promptTemplateRoutes)
  .use(notificationRoutes);

export type App = typeof app;
