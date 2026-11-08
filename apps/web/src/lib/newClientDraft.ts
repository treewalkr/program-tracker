/**
 * The unfinished "New client" form, kept in sessionStorage (not localStorage:
 * it holds client PII and health notes, so it dies with the tab). Scoped by
 * data mode and trainer so mock and live drafts never mix.
 */
import { clearDraft, readDraft, writeDraft } from "./localDraft";
import { emptyProfile, profileKey, type ProfileForm } from "./clientProfile";

export const NEW_CLIENT_DRAFT_PREFIX = "pt.newClientDraft.";

export interface NewClientDraft {
  name: string;
  email: string;
  profile: ProfileForm;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ListStore = Store & Pick<Storage, "key" | "length">;

const session = (): ListStore | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

export function newClientDraftKey(mode: string, trainerId: string | null | undefined): string {
  return `${NEW_CLIENT_DRAFT_PREFIX}${mode}.${trainerId ?? "open"}`;
}

export function isEmptyNewClient(d: NewClientDraft): boolean {
  return d.name.trim() === "" && d.email.trim() === "" && profileKey(d.profile) === profileKey(emptyProfile());
}

const isNums = (v: unknown) => Array.isArray(v) && v.every((n) => typeof n === "number");

const isStr = (v: unknown) => typeof v === "string";
const isNumOrNull = (v: unknown) => v === null || typeof v === "number";

/** A stored profile merged over `emptyProfile()`, so drafts saved before newer fields
 *  (e.g. the basics) still restore; null when the shape is wrong. */
function restoreProfile(p: unknown): ProfileForm | null {
  if (p == null || typeof p !== "object" || Array.isArray(p)) return null;
  const merged = { ...emptyProfile(), ...(p as Partial<ProfileForm>) };
  return validProfile(merged) ? merged : null;
}

function validProfile(p: unknown): p is ProfileForm {
  if (p == null || typeof p !== "object") return false;
  const f = p as Record<string, unknown>;
  return (
    ["", "beginner", "intermediate", "advanced"].includes(f.experience as string) &&
    isStr(f.birthDate) &&
    ["", "female", "male"].includes(f.sex as string) &&
    isNumOrNull(f.bodyweightKg) &&
    isNumOrNull(f.heightCm) &&
    isStr(f.startedOn) &&
    typeof f.sessionsPerWeek === "number" &&
    isNums(f.trainingDays) &&
    isNums(f.cardioDays) &&
    (f.longRunDay === null || typeof f.longRunDay === "number") &&
    Array.isArray(f.oneRepMaxes) &&
    f.oneRepMaxes.every(
      (r) => r != null && typeof r === "object" && typeof r.exerciseId === "string" && (r.kg === null || typeof r.kg === "number") && typeof r.date === "string"
    ) &&
    ["none", "minutes", "sessions", "zone_minutes"].includes(f.cardioUnit as string) &&
    typeof f.cardioValue === "number" &&
    typeof f.goals === "string" &&
    typeof f.limitations === "string"
  );
}

/** A stored draft, or null. A corrupt or mis-shaped entry is removed. */
export function readNewClientDraft(key: string, s: Store | null = session()): NewClientDraft | null {
  const raw = s?.getItem(key);
  if (!raw) return null;
  const d = readDraft<Partial<NewClientDraft>>(key, s)?.data;
  const profile = d ? restoreProfile(d.profile) : null;
  if (d && typeof d.name === "string" && typeof d.email === "string" && profile) {
    return { name: d.name, email: d.email, profile };
  }
  clearDraft(key, s);
  return null;
}

/** Saves the form, or removes the key once it's back to empty. */
export function saveNewClientDraft(key: string, d: NewClientDraft, s: Store | null = session()): void {
  if (isEmptyNewClient(d)) clearDraft(key, s);
  else writeDraft(key, d, s);
}

export function clearNewClientDraft(key: string, s: Store | null = session()): void {
  clearDraft(key, s);
}

/** Sign-out: drop every mode/trainer's draft. */
export function clearAllNewClientDrafts(s: ListStore | null = session()): void {
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(NEW_CLIENT_DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch {
    /* storage blocked */
  }
}
