import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, coachingRules, llmBlobs, llmCalls, type LlmRequestRef } from "@pt/db";
import type { LlmCallStatus, LlmPurpose } from "@pt/shared";
import {
  chatJson,
  chatText,
  completionParams,
  extractJsonObject,
  ProviderError,
  type ChatMessage,
  type ProviderResult,
  type ProviderRuntime,
} from "./provider";
import { API_BUILD } from "../lib/build";

/**
 * The one door to the model. Every provider attempt (mock included) is
 * logged to llm_calls with its exact prompt (deduped into llm_blobs), the
 * structured inputs, the raw response and its outcome. Logging is
 * best-effort: a failed write is reported to the console and never fails
 * the user's request.
 */

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Hash of the prompt module source — changes whenever any template wording changes. */
const PROMPT_SOURCE_HASH: string = (() => {
  try {
    return sha256(readFileSync(new URL("./prompt.ts", import.meta.url), "utf8")).slice(0, 12);
  } catch {
    return "unknown";
  }
})();

export const promptVersion = (builder: string) => `${builder}:${PROMPT_SOURCE_HASH}`;

export interface LlmLinks {
  trainerId?: string | null;
  clientId?: string | null;
  generationId?: string | null;
  chatMessageId?: string | null;
  clientMessageId?: string | null;
}

export type LlmOutcome<T> = { turnId: string; callId: string | null; attempts: number } & (
  | { ok: true; data: T; content: string }
  | { ok: false; kind: "provider"; error: ProviderError }
  | { ok: false; kind: "validation"; error: string }
  | { ok: false; kind: "aborted" }
);

export interface CallLlmArgs<T> {
  purpose: LlmPurpose;
  /** Name of the prompt builder that rendered `messages` (prompt_version). */
  builder: string;
  links: LlmLinks;
  /** Structured inputs. A `catalog` array is stored once as a blob and referenced by hash. */
  context?: Record<string, unknown>;
  messages: ChatMessage[];
  rt: ProviderRuntime;
  effort?: string | null;
  temperature?: number;
  signal?: AbortSignal;
  /** json: response_format json_object, parsed + validated with `schema`. text: plain completion. */
  mode: "json" | "text";
  schema?: z.ZodType<T>;
  /** Canned raw content for the mock provider — goes through the same parse + log path. */
  mock?: () => string;
  /** Default: 2 (one retry on parse/validation failure) for json, 1 for text. */
  maxAttempts?: number;
  /** Group several calls of one user action. Default: a fresh id. */
  turnId?: string;
}

export const isMockRuntime = (rt: ProviderRuntime) => rt.providerId === "mock" || rt.baseUrl.startsWith("mock://");

/** The effort actually sent: the caller's pick, else the provider's registry default. */
const effectiveEffort = (args: Pick<CallLlmArgs<unknown>, "effort" | "rt">): string | undefined =>
  args.effort ?? args.rt.defaultEffort ?? undefined;

export async function callLlm<T = string>(args: CallLlmArgs<T>): Promise<LlmOutcome<T>> {
  const out = await attemptCalls(args);
  // Once per call (not per retry attempt) that carried coaching rules in its prompt.
  const ruleIds = args.context?.ruleIds;
  if (Array.isArray(ruleIds) && ruleIds.length > 0) await bumpRulesApplied(ruleIds as string[]);
  return out;
}

async function bumpRulesApplied(ruleIds: string[]): Promise<void> {
  try {
    await db
      .update(coachingRules)
      .set({ appliedCount: sql`${coachingRules.appliedCount} + 1` })
      .where(inArray(coachingRules.id, ruleIds));
  } catch (err) {
    console.error("[llm-log] failed to bump coaching rule applied_count:", err);
  }
}

async function attemptCalls<T>(args: CallLlmArgs<T>): Promise<LlmOutcome<T>> {
  const turnId = args.turnId ?? randomUUID();
  const maxAttempts = args.maxAttempts ?? (args.mode === "json" ? 2 : 1);
  const mock = isMockRuntime(args.rt);
  const effort = effectiveEffort(args);
  const prepared = prepareRequest(args);
  let lastCallId: string | null = null;
  let validationError = "unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let result: ProviderResult;
    try {
      if (mock) {
        const started = performance.now();
        const content = args.mock ? args.mock() : "";
        result = { content, reasoning: null, usage: null, finishReason: "stop", latencyMs: Math.round(performance.now() - started) };
      } else {
        const call = args.mode === "json" ? chatJson : chatText;
        result = await call(args.rt, args.messages, { signal: args.signal, effort, temperature: args.temperature });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        lastCallId = await writeCall(prepared, args, { turnId, attempt, mock, status: "aborted", error: "aborted" });
        return { ok: false, kind: "aborted", turnId, callId: lastCallId, attempts: attempt };
      }
      if (err instanceof ProviderError) {
        lastCallId = await writeCall(prepared, args, {
          turnId,
          attempt,
          mock,
          status: "provider_error",
          error: err.message,
          httpStatus: err.status ?? null,
          responseRaw: err.body ?? null,
          meta: err.meta,
        });
        return { ok: false, kind: "provider", error: err, turnId, callId: lastCallId, attempts: attempt };
      }
      throw err;
    }

    const parsed = parseContent(args, result.content);
    lastCallId = await writeCall(prepared, args, {
      turnId,
      attempt,
      mock,
      status: parsed.status,
      error: parsed.ok ? null : parsed.error,
      responseRaw: result.content,
      parsed: parsed.ok && args.mode === "json" ? parsed.data : null,
      meta: result,
    });
    if (parsed.ok) {
      return { ok: true, data: parsed.data as T, content: result.content, turnId, callId: lastCallId, attempts: attempt };
    }
    validationError = parsed.error;
  }
  return { ok: false, kind: "validation", error: validationError, turnId, callId: lastCallId, attempts: maxAttempts };
}

type Parsed = { ok: true; status: "ok"; data: unknown } | { ok: false; status: "parse_error" | "validation_error"; error: string };

function parseContent<T>(args: CallLlmArgs<T>, content: string): Parsed {
  if (args.mode === "text") {
    if (!args.schema) return { ok: true, status: "ok", data: content };
    const out = args.schema.safeParse(content);
    return out.success ? { ok: true, status: "ok", data: out.data } : { ok: false, status: "validation_error", error: z.prettifyError(out.error) };
  }
  let json: unknown;
  try {
    json = JSON.parse(extractJsonObject(content));
  } catch (err) {
    return { ok: false, status: "parse_error", error: `parse failure: ${(err as Error).message}` };
  }
  if (!args.schema) return { ok: true, status: "ok", data: json };
  const out = args.schema.safeParse(json);
  return out.success ? { ok: true, status: "ok", data: out.data } : { ok: false, status: "validation_error", error: z.prettifyError(out.error) };
}

interface PreparedRequest {
  blobs: { sha256: string; content: string; bytes: number }[];
  refs: LlmRequestRef[];
  context: Record<string, unknown>;
}

/** Hash the messages (and a catalog in the context) once per call, reused by every attempt. */
function prepareRequest(args: CallLlmArgs<unknown>): PreparedRequest {
  const blobs = new Map<string, { sha256: string; content: string; bytes: number }>();
  const put = (content: string) => {
    const sha = sha256(content);
    if (!blobs.has(sha)) blobs.set(sha, { sha256: sha, content, bytes: Buffer.byteLength(content) });
    return sha;
  };
  const refs = args.messages.map((m) => ({ role: m.role, sha: put(m.content) }));
  const context: Record<string, unknown> = { ...(args.context ?? {}) };
  // Images are referenced by hash and size only — the bytes stay out of the log.
  const images = args.messages.flatMap((m, message) =>
    (m.images ?? []).map((url) => ({ message, sha256: sha256(url), bytes: Buffer.byteLength(url) })),
  );
  if (images.length) context.images = images;
  if (Array.isArray(context.catalog)) {
    const list = context.catalog;
    context.catalog = { blob: put(JSON.stringify(list)), count: list.length };
  }
  return { blobs: [...blobs.values()], refs, context };
}

interface CallOutcome {
  turnId: string;
  attempt: number;
  mock: boolean;
  status: LlmCallStatus;
  error?: string | null;
  httpStatus?: number | null;
  responseRaw?: string | null;
  parsed?: unknown;
  meta?: Partial<Pick<ProviderResult, "reasoning" | "usage" | "finishReason" | "latencyMs">>;
}

async function writeCall(prep: PreparedRequest, args: CallLlmArgs<unknown>, o: CallOutcome): Promise<string | null> {
  try {
    if (prep.blobs.length) await db.insert(llmBlobs).values(prep.blobs).onConflictDoNothing();
    const params = completionParams(args.rt, { temperature: args.temperature });
    const [row] = await db
      .insert(llmCalls)
      .values({
        turnId: o.turnId,
        purpose: args.purpose,
        trainerId: args.links.trainerId ?? null,
        clientId: args.links.clientId ?? null,
        generationId: args.links.generationId ?? null,
        chatMessageId: args.links.chatMessageId ?? null,
        clientMessageId: args.links.clientMessageId ?? null,
        providerId: args.rt.providerId ?? (o.mock ? "mock" : "unknown"),
        model: args.rt.model,
        effort: effectiveEffort(args) ?? null,
        temperature: params.temperature,
        maxTokens: o.mock ? null : params.maxTokens,
        jsonMode: args.mode === "json",
        promptVersion: promptVersion(args.builder),
        appBuild: API_BUILD,
        attempt: o.attempt,
        requestBlobIds: prep.refs,
        context: prep.context,
        responseRaw: o.responseRaw ?? null,
        reasoning: o.meta?.reasoning ?? null,
        parsed: o.parsed ?? null,
        status: o.status,
        error: o.error ?? null,
        httpStatus: o.httpStatus ?? null,
        finishReason: o.meta?.finishReason ?? null,
        tokensIn: o.meta?.usage?.tokensIn ?? null,
        tokensOut: o.meta?.usage?.tokensOut ?? null,
        tokensReasoning: o.meta?.usage?.tokensReasoning ?? null,
        tokensCached: o.meta?.usage?.tokensCached ?? null,
        latencyMs: o.meta?.latencyMs ?? null,
        isMock: o.mock,
      })
      .returning({ id: llmCalls.id });
    return row.id;
  } catch (err) {
    console.error("[llm-log] failed to write call:", err);
    return null;
  }
}

/**
 * Attach a domain row created after the call (the chat reply row, …) to every
 * call of a turn. The one allowed update on llm_calls: it only fills empty links.
 */
export async function linkTurn(turnId: string, links: Pick<LlmLinks, "chatMessageId" | "generationId">): Promise<void> {
  try {
    if (links.chatMessageId) {
      await db
        .update(llmCalls)
        .set({ chatMessageId: links.chatMessageId })
        .where(and(eq(llmCalls.turnId, turnId), isNull(llmCalls.chatMessageId)));
    }
    if (links.generationId) {
      await db
        .update(llmCalls)
        .set({ generationId: links.generationId })
        .where(and(eq(llmCalls.turnId, turnId), isNull(llmCalls.generationId)));
    }
  } catch (err) {
    console.error("[llm-log] failed to link turn:", err);
  }
}

/** Structured prompt inputs: a loadContext() result (examples kept whole, catalog → blob) plus call extras. */
export function contextSnapshot(ctx: object, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const snap: Record<string, unknown> = { ...(ctx as Record<string, unknown>), ...extra };
  // The rules this prompt carried — callLlm bumps their applied_count.
  if (Array.isArray(snap.coachingRules)) snap.ruleIds = (snap.coachingRules as { id: string }[]).map((r) => r.id);
  return snap;
}
