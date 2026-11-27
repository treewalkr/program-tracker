/**
 * The raw `?mock=` demo choice, kept for the tab in sessionStorage under the key the portal mock
 * uses (portal.ts), so a name set on one URL still holds after navigating. The trainer mock reads
 * it once, when it loads: `roster` swaps the three demo members for the 25-member roster
 * (bigRoster.ts). `?mock=off` clears it.
 */
const KEY = "pt.mock.portal";

export function mockScenarioName(): string | null {
  if (typeof location === "undefined") return null;
  const asked = new URLSearchParams(location.search).get("mock");
  try {
    if (asked) sessionStorage.setItem(KEY, asked === "off" ? "" : asked);
    return sessionStorage.getItem(KEY) || null;
  } catch {
    return asked && asked !== "off" ? asked : null;
  }
}
