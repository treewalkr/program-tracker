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

export interface ProviderRuntime {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxOutputTokens: number;
  /** Set by providerRuntime(); call sites building literal runtimes may omit it. */
  providerId?: string;
  effortLevels?: readonly string[];
  defaultEffort?: string;
}

/**
 * Effort selection → provider wire params. Vocabulary is low/high/max everywhere,
 * plus "none" (thinking off) on deepseek;
 * deepseek takes `reasoning_effort` (verified live 2026-11-06), Z.ai GLM 5 takes it
 * as `thinking.budget` (Z.ai error 1210 message names low/high/max). No selection →
 * undefined → request body identical to pre-effort behavior.
 */
function effortParams(
  rt: ProviderRuntime,
  effort: string | undefined,
  thinking: { type: string; budget?: string } | undefined
): Record<string, unknown> {
  if (!effort) return {};
  const deepseek = rt.providerId === "deepseek" || /^deepseek/.test(rt.model);
  if (deepseek) return { reasoning_effort: effort };
  // glm5 thinking budget follows the selection; other thinking configs stay as-is
  if (thinking?.type === "enabled") return { thinking: { ...thinking, budget: effort } };
  return {};
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatJson(
  rt: ProviderRuntime,
  messages: ChatMessage[],
  opts: { temperature?: number; signal?: AbortSignal; effort?: string } = {}
): Promise<string> {
  // GLM 5.x always thinks and rejects "disabled" (Z.ai error 1210): budget low
  // so the JSON draft still fits; give those models a roomier token cap since
  // reasoning shares it.
  const glm5 = /^glm-5/.test(rt.model);
  const thinking = glm5 ? { type: "enabled", budget: "low" } : undefined;
  const maxTokens = glm5 ? Math.max(rt.maxOutputTokens, 16384) : rt.maxOutputTokens;
  const effort = effortParams(rt, opts.effort, thinking);
  let res: Response;
  try {
    res = await fetch(`${rt.baseUrl}/chat/completions`, {
      method: "POST",
      signal: opts.signal,
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
        ...effort,
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
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
  opts: { temperature?: number; effort?: string } = {}
): Promise<string> {
  const glm5 = /^glm-5/.test(rt.model);
  const thinking = glm5 ? { type: "enabled", budget: "low" } : undefined;
  const maxTokens = glm5 ? Math.max(rt.maxOutputTokens, 16384) : rt.maxOutputTokens;
  const effort = effortParams(rt, opts.effort, thinking);
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
        ...effort,
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
