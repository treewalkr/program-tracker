/**
 * Dirty checks for the library pages' forms (templates, rules, examples,
 * vocabulary…): a create form is worth guarding once it holds any text, an
 * edit once it differs from the saved copy. Saving trims, so whitespace alone
 * is never unsaved work.
 */

const norm = (v: unknown): unknown => (typeof v === "string" ? v.trim() || null : (v ?? null));

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => same(x, b[i]));
  }
  return norm(a) === norm(b);
}

/** True when any field holds more than whitespace. */
export const hasDraft = (...fields: readonly unknown[]): boolean => fields.some((f) => typeof f === "string" && f.trim() !== "");

/** True when an open edit differs from the saved copy on any of the edit's fields. */
export function editChanged<T extends object>(edit: T | null | undefined, saved: { [K in keyof T]?: unknown } | null | undefined): boolean {
  if (!edit || !saved) return false;
  return (Object.keys(edit) as (keyof T)[]).some((k) => !same(edit[k], saved[k]));
}
