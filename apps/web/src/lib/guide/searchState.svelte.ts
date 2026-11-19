/**
 * The guide search palette's state, shared by the one palette in the root
 * layout and whatever opens it (⌘K, the /guide bar, the guides' buttons).
 */
export const guideSearch = $state({ open: false, query: "" });

/** Open the palette, optionally with a first character already typed. */
export function openGuideSearch(query = ""): void {
  guideSearch.query = query;
  guideSearch.open = true;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export const searchShortcut = isMac ? "⌘K" : "Ctrl K";
