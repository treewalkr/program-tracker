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
  /** Z.ai GLM 4.x: skip reasoning so JSON output fits the token budget. */
  disableThinking?: boolean;
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
        max_tokens: rt.maxOutputTokens,
        ...(rt.disableThinking ? { thinking: { type: "disabled" } } : {}),
      }),
    });
  } catch (err) {
    throw new ProviderError(`network error calling provider: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(`provider returned ${res.status}`, res.status, body.slice(0, 500));
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
