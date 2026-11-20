import { Elysia, ValidationError } from "elysia";

/**
 * 422 bodies that name the field: `{ type: "validation", on, error: "instructions: Expected string
 * length less or equal to 6000" }`. In production Elysia sends only `{ type, on, found }`, so the
 * web app could show nothing better than "request failed: 422". Never echoes the submitted value.
 */

/** A TypeBox value error (`path: "/a/b"`) or a Standard Schema issue (`path: ["a", { key: "b" }]`). */
type FirstError = { path?: unknown; message?: unknown } | undefined;

const fieldOf = (path: unknown, on: string): string => {
  const parts =
    typeof path === "string"
      ? path.split("/").filter(Boolean)
      : Array.isArray(path)
        ? path.map((p) => String(p && typeof p === "object" && "key" in p ? (p as { key: unknown }).key : p))
        : [];
  return parts.length ? parts.join(".") : on;
};

/** The 422 body for a validation error. */
export function validationBody(error: Pick<ValidationError, "type" | "valueError">): { type: "validation"; on: string; error: string } {
  const first = error.valueError as FirstError;
  const reason = typeof first?.message === "string" && first.message ? first.message : "invalid value";
  return { type: "validation", on: error.type, error: `${fieldOf(first?.path, error.type)}: ${reason}` };
}

export const validationErrors = new Elysia({ name: "validation-errors" }).onError(
  { as: "global" },
  ({ code, error, status }) => {
    if (code === "VALIDATION") return status(422, validationBody(error));
  }
);
