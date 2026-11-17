/**
 * Redaction for what a feedback ticket carries beyond the trainer's own words:
 * page data, runtime entries and the expected/actual text. Masks contact
 * details and credentials; leaves everything else (client names, Thai text,
 * numbers) as it is, so the agent can still find the record. The web applies
 * it before sending and the API again on ingest — never trust the client.
 */

export const REDACTED = "[redacted]";

/** Object keys whose value is dropped whole, whatever it holds. */
const SECRET_KEY = /email|phone|token|password|secret|authorization|cookie/i;

const RULES: [RegExp, string][] = [
  // `Bearer <anything token-like>` — before the JWT rule, so the word survives
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  // JWTs: three base64url segments, the first one a JSON header (`eyJ…`)
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[email]"],
  // 32+ hex characters in a row: API keys, session ids, hashes (uuids have dashes, so they stay)
  [/\b[0-9a-fA-F]{32,}\b/g, "[token]"],
  // Phone numbers: `+<country>` or a leading 0, then 8+ more digits in groups (081-234-5678, +66 81 234 5678).
  // Not inside a longer token (uuids, versions, dates).
  [/(?<![\w+.-])(?:\+\d{1,3}[\s-]?|0)\d{1,3}[\s-]?\d{3,4}[\s-]?\d{4}(?![\w-])/g, "[phone]"],
];

/** `s` with emails, phone numbers and tokens masked. */
export function redactText(s: string): string {
  let out = s;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

/**
 * A JSON value with every string passed through `redactText`, and the value
 * of any secret-named key (`email`, `accessToken`, `cookie`, …) replaced
 * whole. Returns a new value; the input is not changed.
 */
export function redactJson<T>(v: T): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") return redactText(x);
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>).map(([k, val]) => [
          k,
          SECRET_KEY.test(k) && val !== null && val !== undefined ? REDACTED : walk(val),
        ]),
      );
    }
    return x;
  };
  return walk(v) as T;
}
