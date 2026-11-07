/**
 * Unsaved form work kept in localStorage so a closed tab or a distraction
 * doesn't cost the trainer their progress. Versioned; bad JSON reads as none.
 */

const VERSION = 1;

export interface LocalDraft<T> {
  savedAt: string;
  data: T;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const store = (): Store | null => (typeof localStorage === "undefined" ? null : localStorage);

export function readDraft<T>(key: string, s: Store | null = store()): LocalDraft<T> | null {
  try {
    const raw = s?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== VERSION || typeof parsed.savedAt !== "string" || parsed.data == null) return null;
    return { savedAt: parsed.savedAt, data: parsed.data as T };
  } catch {
    return null;
  }
}

/** Returns the save time, or null when storage is unavailable or full. */
export function writeDraft<T>(key: string, data: T, s: Store | null = store(), now = new Date()): string | null {
  try {
    const savedAt = now.toISOString();
    s?.setItem(key, JSON.stringify({ v: VERSION, savedAt, data }));
    return s ? savedAt : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, s: Store | null = store()): void {
  try {
    s?.removeItem(key);
  } catch {
    /* storage blocked */
  }
}
