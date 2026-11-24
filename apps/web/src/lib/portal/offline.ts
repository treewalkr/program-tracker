import { PORTAL_SESSION_CACHE_KEY } from "./gate";
import { PORTAL_WEEK_CACHE_KEY, PORTAL_WEEK_DTO_CACHE_KEY } from "./logForm";

/**
 * Forget what this phone kept for offline use: the session and the week. On sign-out
 * (or when the gate sees another member signed in), so the next person on a shared phone
 * doesn't see this member's program. Unsent drafts stay: they're the member's own entries,
 * kept under their id and cleared by Save or "Start over".
 */
export function clearPortalCopies(storage: Pick<Storage, "removeItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  for (const key of [PORTAL_SESSION_CACHE_KEY, PORTAL_WEEK_CACHE_KEY, PORTAL_WEEK_DTO_CACHE_KEY]) {
    try {
      storage?.removeItem(key);
    } catch {
      // private mode: nothing was kept
    }
  }
}
