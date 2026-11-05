import { describe, expect, test } from "bun:test";
import { AiClientMessageDraft } from "@pt/shared";
import { db, trainers } from "@pt/db";
import { chatJson, extractJsonObject } from "./ai/provider";
import { providerRuntime } from "./ai/runtime";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

/**
 * Live smoke suite against the real DeepSeek endpoint. Opt-in only — runs when
 * DEEPSEEK_API_KEY is set AND PT_LIVE_AI=1 (paid network calls otherwise).
 *   cd apps/api && set -a && . ../../.env.local && set +a && PT_LIVE_AI=1 bun test src/deepseek.live.test.ts
 */
const live = Boolean(process.env.DEEPSEEK_API_KEY && process.env.PT_LIVE_AI === "1");

/** Integration test needs a live Postgres (bun run db:up). Skip otherwise. */
let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping live generate test");
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

describe.skipIf(!live)("deepseek live (chatJson)", () => {
  test(
    "T10 deepseek live: chatJson returns a valid AiClientMessageDraft",
    async () => {
      const rt = providerRuntime("deepseek");
      const raw = await chatJson(
        rt,
        [
          { role: "system", content: 'Respond with a single JSON object only: {"message": string}.' },
          { role: "user", content: "Say hello to a client named Maya." },
        ],
        { temperature: 0.7 }
      );
      const parsed = AiClientMessageDraft.safeParse(JSON.parse(extractJsonObject(raw)));
      expect(parsed.success).toBe(true);
    },
    { timeout: 60_000 }
  );
});

describe.skipIf(!live || !dbUp)("deepseek live (POST /v1/ai/generate)", () => {
  test(
    "T11 deepseek live: POST /v1/ai/generate validates a draft",
    async () => {
      const client = await call("POST", "/v1/clients", {
        name: "DeepSeek Live Client",
        email: `deepseek-live-${Date.now()}@test.dev`,
        goals: "build strength",
        daysPerWeek: 2,
      });
      expect(client.status).toBe(201);
      const clientId = client.body.id;

      const gen = await call("POST", "/v1/ai/generate", { clientId, providerId: "deepseek" });
      expect(gen.status).toBe(201);
      expect(gen.body.status).toBe("validated");
      expect(gen.body.providerId).toBe("deepseek");
      expect(gen.body.model).toBe("deepseek-flash");
      expect(gen.body.draft.sessions.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 300_000 }
  );
});
