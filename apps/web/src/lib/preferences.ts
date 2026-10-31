import { combinePreferenceDocs } from "@pt/shared";
import type { PreferencesDto } from "./api/types";

/** The document auto-injected into every draft for this client:
 *  trainer-wide style first, then the client-specific addendum. */
export function effectivePreferences(prefs: PreferencesDto[], clientId: string): string | null {
  const trainer = prefs.find((p) => p.clientId === null)?.document ?? null;
  const client = prefs.find((p) => p.clientId === clientId)?.document ?? null;
  return combinePreferenceDocs(trainer, client);
}
