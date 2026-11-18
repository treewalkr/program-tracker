import { normalizeKinds } from "@pt/shared";

/**
 * The mock API answers the way the live client reads (real.ts → trainerWire,
 * portal → portalWire): every result passes through the session kind alias
 * (docs/kind-rename-plan.md). The mock store holds some release-2 rows (kind
 * "exercises", see data.ts), so mock mode walks the same old-tab path.
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

/** A document as release 2 stores it: every session kind / type format "lifting" written as "exercises". */
export function asRelease2<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc).replace(/"(kind|format)":"lifting"/g, '"$1":"exercises"')) as T;
}
