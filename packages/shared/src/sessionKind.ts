/**
 * The session kind alias (docs/kind-rename-plan.md): `lifting` is becoming
 * `exercises`. Every read of a session kind — or a session type's format —
 * passes through here, so data written by either release reads the same.
 *
 * Release 1 (now): the canonical value is still "lifting"; "exercises" reads
 * as "lifting". Release 2 flips `KIND_ALIAS` (from "lifting" to "exercises")
 * and nothing else here changes. The alias is permanent.
 */
export const KIND_ALIAS = { from: "exercises", to: "lifting" } as const;

/** The keys whose values are a session kind (`kind`) or a session type format (`format`). */
const KIND_KEYS = new Set(["kind", "format"]);

/** A session kind (or type format) read from anywhere: the alias becomes the canonical value; anything else passes through. */
export function normalizeKind<T>(value: T): T {
  return (value === KIND_ALIAS.from ? KIND_ALIAS.to : value) as T;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * A JSON document (program weeks, AI draft, import result, API response) with
 * every `kind` / `format` alias value rewritten, at any depth. No other kind or
 * format in the app takes the alias value, so the walk is safe on whole
 * responses. Unchanged branches keep their identity; nothing is mutated.
 */
export function normalizeKinds<T>(doc: T): T {
  if (Array.isArray(doc)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < doc.length; i++) {
      const next = normalizeKinds(doc[i]);
      if (next !== doc[i]) (out ??= doc.slice())[i] = next;
    }
    return (out ?? doc) as T;
  }
  if (!isPlainObject(doc)) return doc;
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(doc)) {
    const v = doc[key];
    const next = KIND_KEYS.has(key) && typeof v === "string" ? normalizeKind(v) : normalizeKinds(v);
    if (next !== v) (out ??= { ...doc })[key] = next;
  }
  return (out ?? doc) as T;
}
