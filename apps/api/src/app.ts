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
import { sessionTypeRoutes } from "./routes/session-types";
import { chainRoutes } from "./routes/chains";
import { promptTemplateRoutes } from "./routes/prompt-templates";
import { notificationRoutes } from "./routes/notifications";
import { clientMessageRoutes } from "./routes/client-messages";
import { preferenceRoutes } from "./routes/preferences";
import { chatRoutes } from "./routes/chat";
import { feedbackRoutes } from "./routes/feedback";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { trainerContext } from "./lib/trainer-context";
import { API_BUILD } from "./lib/build";

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const TAGS = [
  { name: "health", description: "Liveness and provider discovery" },
  { name: "auth", description: "Google sign-in for invited trainers; every other /v1 route needs a session" },
  { name: "admin", description: "Platform admin console — invite, disable and remove trainer accounts" },
  { name: "ai", description: "AI draft generation, audit trail, and approval gate" },
  { name: "chat", description: "Conversational surface — client Q&A and draft revision over chat" },
  { name: "client-messages", description: "Client-facing weekly messages — AI-drafted, trainer-approved, copy-to-LINE" },
  { name: "prompt-templates", description: "Reusable instruction template library" },
  { name: "clients", description: "Client management" },
  { name: "programs", description: "Versioned program documents and lifecycle" },
  { name: "examples", description: "Gold-standard program library used as AI few-shot examples" },
  { name: "logs", description: "Session logging and history aggregation" },
  { name: "exercises", description: "Exercise catalog" },
  { name: "schemes", description: "Periodization scheme library" },
  { name: "session-types", description: "Trainer-owned session type labels over the lifting/cardio formats" },
  { name: "chains", description: "Kinetic chains — trainer-maintained muscle-group sets" },
  { name: "notifications", description: "Phase-change signals and snooze" },
  { name: "preferences", description: "Distilled trainer/client style preferences" },
  { name: "account", description: "The signed-in trainer's own settings (email notifications)" },
  { name: "feedback", description: "Feedback mode — trainer comments pinned to UI elements, exported for coding agents" },
];

// Bun's max idle timeout — a held chat-revise POST (deepseek + one validation
// retry can take 30-45s) must not be dropped by the default 30s idle timeout.
export const app = new Elysia({ serve: { idleTimeout: 255 } })
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
  .get("/health", () => ({ ok: true, service: "program-tracker-api", build: API_BUILD, time: new Date().toISOString() }), {
    detail: { summary: "Liveness probe", tags: ["health"] },
  })
  /** The API's build id, under /v1 so the web proxy reaches it (it only forwards /v1/*). */
  .get("/v1/meta", () => ({ build: API_BUILD }), {
    detail: { summary: "API build id", tags: ["health"] },
  })
  .use(authRoutes)
  // everything below needs a signed-in trainer and only sees that trainer's data
  .use(trainerContext)
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
  .use(adminRoutes)
  .use(aiRoutes)
  .use(clientMessageRoutes)
  .use(preferenceRoutes)
  .use(chatRoutes)
  .use(clientRoutes)
  .use(programRoutes)
  .use(exampleRoutes)
  .use(logRoutes)
  .use(exerciseRoutes)
  .use(schemeRoutes)
  .use(sessionTypeRoutes)
  .use(chainRoutes)
  .use(promptTemplateRoutes)
  .use(notificationRoutes)
  .use(feedbackRoutes)
  .use(accountRoutes);

export type App = typeof app;
