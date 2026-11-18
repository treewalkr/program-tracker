import { normalizeKinds } from "@pt/shared";

/**
 * The mock API answers the way the live client reads (real.ts → trainerWire,
 * portal → portalWire): every result passes through the session kind alias
 * (docs/kind-rename-plan.md). The mock store holds some release-1 rows (kind
 * "lifting", see data.ts), so mock mode reads old data the way the live API does.
 */
export function withKindAlias<T extends object>(api: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(api)) {
    out[key] =
      typeof value === "function"
        ? (...args: unknown[]) => {
            const result = value.apply(api, args);
            return result instanceof Promise ? result.then(normalizeKinds) : normalizeKinds(result);
          }
        : value;
  }
  return out as T;
}

/** A document as release 1 stored it (before the backfill): every session kind / type format "exercises" written as "lifting". */
export function asRelease1<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc).replace(/"(kind|format)":"exercises"/g, '"$1":"lifting"')) as T;
}
