import { PortalDuplicateError } from "$lib/api/portalTypes";
import { PortalTimeoutError } from "./timeout";

/**
 * A save that never left the phone (no signal, DNS, a refused connection): Eden reports it
 * as a 503 whose value is the fetch's own Error. `unwrap` tags it so it isn't read as the
 * server's 503.
 */
export const networkFailure = () => Object.assign(new Error("request failed: network"), { status: 503, network: true as const });

/**
 * Could this failed save have reached the server and been written, with only the answer
 * lost? A timeout (the request may be in flight), or a 5xx the server answered. Never
 * when the phone says it's offline, and never a fetch that failed before it left.
 */
export function mayHaveLanded(e: unknown, online: boolean): boolean {
  if (!online) return false;
  if (e instanceof PortalTimeoutError) return true;
  if (e instanceof PortalDuplicateError) return false;
  const err = e as { status?: unknown; network?: unknown } | null;
  return typeof err?.status === "number" && err.status >= 500 && err.network !== true;
}

/**
 * A 409 on save. After a save that may have landed, the member's own log is most likely
 * that save, but it may as well be an earlier real log: never adopt it as this one.
 * Resend once with replace, so what's on screen wins. Anything else is shown to the member.
 */
export function duplicateAction(
  existing: PortalDuplicateError["existing"],
  ctx: { lastSaveLost: boolean; replacing: boolean },
): "replace" | "refuse" {
  return ctx.lastSaveLost && !ctx.replacing && existing.loggedBy === "client" ? "replace" : "refuse";
}
