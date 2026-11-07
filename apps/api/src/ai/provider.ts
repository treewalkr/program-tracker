/**
 * OpenAI-compatible chat completion call with JSON mode.
 * Works for Z.ai (GLM), OpenAI, Groq, OpenRouter, ... — anything speaking
 * the /chat/completions dialect.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
    public readonly meta: ProviderErrorMeta = {}
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
  /** Image data URLs sent with a user message (vision models only). */
  images?: string[];
}

/** OpenAI-style wire form: text-only messages stay a string, images become content parts. */
export const wireMessage = ({ role, content, images }: ChatMessage) =>
  images?.length
    ? {
        role,
        content: [
          ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          { type: "text" as const, text: content },
        ],
      }
    : { role, content };

export interface ProviderUsage {
  tokensIn: number | null;
  tokensOut: number | null;
  tokensReasoning: number | null;
  tokensCached: number | null;
}

/** One completion: the text plus what the log needs (usage, truncation, timing). */
export interface ProviderResult {
  content: string;
  /** Thinking text when the provider returns it (deepseek `reasoning_content`, GLM). */
  reasoning: string | null;
  usage: ProviderUsage | null;
  finishReason: string | null;
  latencyMs: number;
}

/** Response metadata a ProviderError may carry (e.g. "no content" after a length cut-off). */
export interface ProviderErrorMeta {
  latencyMs?: number;
  finishReason?: string | null;
  usage?: ProviderUsage | null;
  reasoning?: string | null;
}

export interface CompletionOpts {
  temperature?: number;
  signal?: AbortSignal;
  effort?: string;
}

/** Wire params a call is sent with — shared by the request and the log row. */
export function completionParams(rt: ProviderRuntime, opts: { temperature?: number } = {}) {
  // GLM 5.x always thinks and rejects "disabled" (Z.ai error 1210): budget low
  // so the JSON draft still fits; give those models a roomier token cap since
  // reasoning shares it.
  const glm5 = /^glm-5/.test(rt.model);
  return {
    temperature: opts.temperature ?? 0.7,
    maxTokens: glm5 ? Math.max(rt.maxOutputTokens, 16384) : rt.maxOutputTokens,
    thinking: glm5 ? { type: "enabled", budget: "low" } : undefined,
  };
}

function toUsage(u: Record<string, any> | undefined): ProviderUsage | null {
  if (!u || typeof u !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    tokensIn: num(u.prompt_tokens),
    tokensOut: num(u.completion_tokens),
    tokensReasoning: num(u.completion_tokens_details?.reasoning_tokens),
    tokensCached: num(u.prompt_tokens_details?.cached_tokens) ?? num(u.prompt_cache_hit_tokens),
  };
}

async function chatCompletion(
  rt: ProviderRuntime,
  messages: ChatMessage[],
  opts: CompletionOpts & { json: boolean }
): Promise<ProviderResult> {
  const p = completionParams(rt, opts);
  const effort = effortParams(rt, opts.effort, p.thinking);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
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
        messages: messages.map(wireMessage),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        ...(p.thinking ? { thinking: p.thinking } : {}),
        ...effort,
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ProviderError(`network error calling provider: ${(err as Error).message}`, undefined, undefined, {
      latencyMs: elapsed(),
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? detail;
    } catch {
      // body wasn't JSON — keep the raw slice
    }
    throw new ProviderError(`provider returned ${res.status}: ${detail}`, res.status, body.slice(0, 500), {
      latencyMs: elapsed(),
    });
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[];
    usage?: Record<string, any>;
  };
  const choice = json.choices?.[0];
  const meta = {
    latencyMs: elapsed(),
    finishReason: choice?.finish_reason ?? null,
    usage: toUsage(json.usage),
    reasoning: choice?.message?.reasoning_content || null,
  };
  const content = choice?.message?.content;
  if (!content) throw new ProviderError("provider returned no content", 200, JSON.stringify(json).slice(0, 500), meta);
  return { content, ...meta };
}

export function chatJson(rt: ProviderRuntime, messages: ChatMessage[], opts: CompletionOpts = {}): Promise<ProviderResult> {
  return chatCompletion(rt, messages, { ...opts, json: true });
}

export function chatText(rt: ProviderRuntime, messages: ChatMessage[], opts: CompletionOpts = {}): Promise<ProviderResult> {
  return chatCompletion(rt, messages, { ...opts, json: false });
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
