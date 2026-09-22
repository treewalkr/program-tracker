import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { KNOWN_PROVIDERS, AiProviderConfig } from "@pt/shared";
import { aiRoutes } from "./routes/ai";
import { clientRoutes } from "./routes/clients";
import { programRoutes } from "./routes/programs";

const port = Number(process.env.API_PORT ?? 4000);
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = new Elysia()
  .use(cors({ origin: corsOrigins }))
  .get("/health", () => ({ ok: true, service: "program-tracker-api", time: new Date().toISOString() }))
  /**
   * Which AI providers are usable right now. API keys are read server-side
   * only — the response carries config, never secrets.
   */
  .get("/v1/ai/providers", () => {
    const providers = Object.values(KNOWN_PROVIDERS).map((p) => {
      const parsed = AiProviderConfig.parse(p);
      return {
        ...parsed,
        configured: Boolean(process.env[p.apiKeyEnvVar]),
        /** Override model/baseUrl from env when present. */
        model: process.env[`${p.id.toUpperCase()}_MODEL`] ?? parsed.model,
        baseUrl: process.env[`${p.id.toUpperCase()}_BASE_URL`] ?? parsed.baseUrl,
      };
    });
    return { providers };
  })
  .use(aiRoutes)
  .use(clientRoutes)
  .use(programRoutes)
  .listen(port);

console.log(`program-tracker API listening on :${port}`);

export type App = typeof app;
