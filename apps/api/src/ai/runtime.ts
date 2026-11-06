import type { AiProviderConfig } from "@pt/shared";
import { KNOWN_PROVIDERS } from "@pt/shared";

/** Guard failure with an HTTP status — routes map it onto their error envelope. */
export class ContextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** Resolve a provider id (+ optional model) into runtime call config.
 *  Pure move from routes/ai.ts — behavior unchanged. */
export function providerRuntime(providerId: string, model?: string) {
  const known: AiProviderConfig | undefined = KNOWN_PROVIDERS[providerId as keyof typeof KNOWN_PROVIDERS];
  const id = known?.id ?? providerId;
  if (id === "mock") {
    if (model && model !== "mock-draft-v1")
      throw new ContextError(400, `model "${model}" not available for provider "mock"`);
    return { baseUrl: "mock://local", model: "mock-draft-v1", apiKey: "mock", maxOutputTokens: 4096, providerId: id };
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
    providerId: id,
    baseUrl: process.env[`${upper}_BASE_URL`] ?? known?.baseUrl ?? "",
    model: model ?? defaultModel,
    apiKey,
    maxOutputTokens: known?.maxOutputTokens ?? 8192,
    disableThinking: known?.disableThinking,
    effortLevels: known?.effortLevels,
    defaultEffort: known?.defaultEffort,
  };
}
