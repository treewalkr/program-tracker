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
        sessionsPerWeek: 2,
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

describe.skipIf(!live || !dbUp)("deepseek live (chat refinement)", () => {
  test(
    "T12 deepseek live: 3 refinement turns, median ≤ 20s, each ≤ 45s",
    async () => {
      // Real HTTP through Bun.serve — this exercises the raised idle timeout
      // (a deepseek turn with a validation retry can exceed 30s).
      app.listen(0);
      try {
        const url = `http://localhost:${app.server!.port}`;
        const json = async (method: string, path: string, body?: unknown) => {
          const res = await fetch(`${url}${path}`, {
            method,
            headers: { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          return { status: res.status, body: (await res.json().catch(() => null)) as any };
        };

        const client = await json("POST", "/v1/clients", {
          name: "DeepSeek Chat Refine Client",
          email: `deepseek-chat-refine-${Date.now()}@test.dev`,
          goals: "build strength",
          sessionsPerWeek: 3,
        });
        expect(client.status).toBe(201);
        const clientId = client.body.id;

        // Untimed seed draft — the clock starts at the first refinement turn.
        const gen = await json("POST", "/v1/ai/generate", { clientId, providerId: "deepseek" });
        expect(gen.status).toBe(201);
        expect(gen.body.status).toBe("validated");

        const messages = [
          "Cut every accessory to 2 sets",
          "Swap the first squat for a front squat",
          "Add a short core finisher to day 1",
        ];
        const elapsedMs: number[] = [];
        let currentId: string = gen.body.id;
        try {
          for (const message of messages) {
            const start = performance.now();
            const res = await fetch(`${url}/v1/ai/chat/turn`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ clientId, generationId: currentId, message, providerId: "deepseek" }),
            });
            const elapsed = performance.now() - start;
            elapsedMs.push(elapsed);

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            // Propose → build: the turn returns a proposal; Build makes the next version.
            expect(body.messages).toHaveLength(2);
            expect(body.messages[1].content.length).toBeGreaterThan(0);
            expect(body.generation).toBeNull();
            expect(body.messages[1].kind).toBe("proposal");

            const built = await json("POST", `/v1/ai/chat/proposals/${body.messages[1].id}/build`, {
              providerId: "deepseek",
            });
            expect(built.status).toBe(201);
            if (built.body.generation?.status !== "validated") {
              console.log("T12 build failed:", built.body.generation?.error ?? built.body.error);
            }
            expect(built.body.generation.status).toBe("validated");
            expect(built.body.generation.model).toBe("deepseek-flash");
            currentId = built.body.generation.id;
          }

          elapsedMs.sort((a, b) => a - b);
          expect(elapsedMs[1]).toBeLessThanOrEqual(20_000);
          expect(Math.max(...elapsedMs)).toBeLessThanOrEqual(45_000);
        } finally {
          console.log("T12 elapsedMs", elapsedMs);
        }
      } finally {
        await app.stop();
      }
    },
    { timeout: 300_000 }
  );
});
