import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { z } from "zod";
import { KNOWN_PROVIDERS, AiProviderConfig } from "@pt/shared";
import { aiRoutes } from "./routes/ai";
import { clientRoutes } from "./routes/clients";
import { programRoutes } from "./routes/programs";
import { logRoutes } from "./routes/logs";
import { exerciseRoutes } from "./routes/exercises";
import { schemeRoutes } from "./routes/schemes";
import { promptTemplateRoutes } from "./routes/prompt-templates";
import { notificationRoutes } from "./routes/notifications";

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const TAGS = [
  { name: "health", description: "Liveness and provider discovery" },
  { name: "ai", description: "AI draft generation, audit trail, and approval gate" },
  { name: "prompt-templates", description: "Reusable instruction template library" },
  { name: "clients", description: "Client management" },
  { name: "programs", description: "Versioned program documents and lifecycle" },
  { name: "logs", description: "Session logging and history aggregation" },
  { name: "exercises", description: "Exercise catalog" },
  { name: "schemes", description: "Periodization scheme library" },
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
      return {
        ...parsed,
        configured: p.id === "mock" || Boolean(process.env[p.apiKeyEnvVar]),
        model: process.env[`${p.id.toUpperCase()}_MODEL`] ?? parsed.model,
        baseUrl: process.env[`${p.id.toUpperCase()}_BASE_URL`] ?? parsed.baseUrl,
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
  .use(clientRoutes)
  .use(programRoutes)
  .use(logRoutes)
  .use(exerciseRoutes)
  .use(schemeRoutes)
  .use(promptTemplateRoutes)
  .use(notificationRoutes);

export type App = typeof app;
