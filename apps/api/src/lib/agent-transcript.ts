/**
 * Claude Code `--output-format stream-json` transcripts of feedback-agent
 * runs: what the watcher saves, the CLI uploads with an answer, and the API
 * logs in llm_calls / llm_blobs. Pure, shared by the scripts and the API.
 */

/** Biggest transcript the API stores (characters). The CLI trims to this before upload. */
export const TRANSCRIPT_MAX_CHARS = 2_000_000;

export interface TranscriptStats {
  model: string | null;
  sessionId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensCached: number | null;
  /** Only in the final `result` event — absent when uploaded mid-run. */
  costUsd: number | null;
  durationMs: number | null;
  numTurns: number | null;
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Model, tokens, cost and duration from a stream-json transcript. Assistant
 * events repeat a message's usage once per content block, so usage is
 * counted once per message id. A final `result` event, when present, wins:
 * it has the run's totals. Lines that aren't JSON are skipped.
 */
export function transcriptStats(text: string): TranscriptStats {
  const out: TranscriptStats = {
    model: null,
    sessionId: null,
    tokensIn: null,
    tokensOut: null,
    tokensCached: null,
    costUsd: null,
    durationMs: null,
    numTurns: null,
  };
  const seen = new Set<string>();
  let tin = 0;
  let tout = 0;
  let cached = 0;
  let any = false;
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e: Record<string, any>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof e.session_id === "string") out.sessionId ??= e.session_id;
    if (e.type === "system" && e.subtype === "init" && typeof e.model === "string") out.model ??= e.model;
    if (e.type === "assistant" && e.message) {
      const m = e.message as { id?: string; model?: string; usage?: Usage };
      if (typeof m.model === "string") out.model = m.model;
      const key = m.id ?? `line:${seen.size}`;
      if (m.usage && !seen.has(key)) {
        seen.add(key);
        any = true;
        tin += (m.usage.input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0);
        tout += m.usage.output_tokens ?? 0;
        cached += m.usage.cache_read_input_tokens ?? 0;
      }
    }
    if (e.type === "result") {
      out.costUsd = num(e.total_cost_usd);
      out.durationMs = num(e.duration_ms);
      out.numTurns = num(e.num_turns);
      const u = e.usage as Usage | undefined;
      if (u) {
        any = true;
        tin = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        tout = u.output_tokens ?? 0;
        cached = u.cache_read_input_tokens ?? 0;
      }
    }
  }
  if (any) {
    out.tokensIn = tin;
    out.tokensOut = tout;
    out.tokensCached = cached;
  }
  return out;
}

/**
 * A transcript at most `max` characters long. Too long → the first line (the
 * run's init: model, tools) and the newest whole lines, joined by a marker.
 */
export function capTranscript(text: string, max = TRANSCRIPT_MAX_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const firstEnd = text.indexOf("\n");
  const head = firstEnd > 0 && firstEnd < max / 4 ? text.slice(0, firstEnd + 1) : "";
  const marker = `{"type":"pt_truncated","dropped_chars":${text.length - max}}\n`;
  const room = max - head.length - marker.length;
  let tail = text.slice(text.length - room);
  const nl = tail.indexOf("\n");
  if (nl >= 0) tail = tail.slice(nl + 1);
  return { text: head + marker + tail, truncated: true };
}

/** Transcript files to delete so only the newest `keep` remain (names sort by time). */
export function transcriptsToPrune(names: string[], keep = 20): string[] {
  const runs = names.filter((n) => /^run-.*\.jsonl$/.test(n)).sort();
  return runs.slice(0, Math.max(0, runs.length - keep));
}
