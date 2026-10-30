import { KNOWN_PROVIDERS, type AiProviderConfig } from "@pt/shared";

/**
 * OpenAI-compatible chat completion call with JSON mode.
 * Works for Z.ai (GLM), OpenAI, Groq, OpenRouter, ... — anything speaking
 * the /chat/completions dialect.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class ContextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ContextError";
  }
}

export interface ProviderRuntime {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxOutputTokens: number;
  /** Z.ai GLM 4.x: skip reasoning so JSON output fits the token budget.
   *  GLM 5.x can't disable thinking — budget "low" is forced regardless. */
  disableThinking?: boolean;
}

export function providerRuntime(providerId: string, model?: string): ProviderRuntime {
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

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatJson(
  rt: ProviderRuntime,
  messages: ChatMessage[],
  opts: { temperature?: number } = {}
): Promise<string> {
  // GLM 5.x always thinks and rejects "disabled" (Z.ai error 1210): budget low
  // so the JSON draft still fits; give those models a roomier token cap since
  // reasoning shares it. 4.x honors disabled and skips reasoning entirely.
  const glm5 = /^glm-5/.test(rt.model);
  const thinking = glm5
    ? { type: "enabled", budget: "low" }
    : rt.disableThinking
      ? { type: "disabled" }
      : undefined;
  const maxTokens = glm5 ? Math.max(rt.maxOutputTokens, 16384) : rt.maxOutputTokens;
  let res: Response;
  try {
    res = await fetch(`${rt.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rt.apiKey}`,
      },
      body: JSON.stringify({
        model: rt.model,
        messages,
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.7,
        max_tokens: maxTokens,
        ...(thinking ? { thinking } : {}),
      }),
    });
  } catch (err) {
    throw new ProviderError(`network error calling provider: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? detail;
    } catch {
      // body wasn't JSON — keep the raw slice
    }
    throw new ProviderError(`provider returned ${res.status}: ${detail}`, res.status, body.slice(0, 500));
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError("provider returned no content", 200, JSON.stringify(json).slice(0, 500));
  return content;
}

export async function chatText(
  rt: ProviderRuntime,
  messages: ChatMessage[],
  opts: { temperature?: number } = {}
): Promise<string> {
  const glm5 = /^glm-5/.test(rt.model);
  const thinking = glm5
    ? { type: "enabled", budget: "low" }
    : rt.disableThinking
      ? { type: "disabled" }
      : undefined;
  const maxTokens = glm5 ? Math.max(rt.maxOutputTokens, 16384) : rt.maxOutputTokens;
  let res: Response;
  try {
    res = await fetch(`${rt.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rt.apiKey}`,
      },
      body: JSON.stringify({
        model: rt.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: maxTokens,
        ...(thinking ? { thinking } : {}),
      }),
    });
  } catch (err) {
    throw new ProviderError(`network error calling provider: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? detail;
    } catch {
      // body wasn't JSON — keep the raw slice
    }
    throw new ProviderError(`provider returned ${res.status}: ${detail}`, res.status, body.slice(0, 500));
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError("provider returned no content", 200, JSON.stringify(json).slice(0, 500));
  return content;
}

/** LLMs sometimes wrap JSON in fences or prose; extract the outermost JSON object. */
export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return candidate;
  return candidate.slice(start, end + 1);
}
