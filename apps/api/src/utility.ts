/**
 * Drizzle table → Elysia TypeBox schema helpers (Elysia "Drizzle" recipe, `spread`/`spreads`).
 * Elysia doesn't re-export `Kind`/`TObject`, so this one file reads them from `@sinclair/typebox`
 * (pinned to the copy elysia resolves). Schemas are built with elysia's `t`, so e.g. `t.Date`
 * accepts ISO strings like the rest of the API.
 */
import { t } from "elysia";
import { Kind, type TExclude, type TNull, type TObject, type TSchema } from "@sinclair/typebox";
import { createSchemaFactory, type BuildSchema } from "drizzle-typebox";
import type { Table } from "drizzle-orm";

/** drizzle-typebox bound to elysia's `t`. Refine with callbacks — drizzle re-applies null/optional after. */
export const { createInsertSchema, createSelectSchema, createUpdateSchema } = createSchemaFactory({
  typeboxInstance: t,
});

type Spread<T extends TObject | Table, Mode extends "select" | "insert" | undefined> =
  T extends TObject<infer Fields>
    ? { [K in keyof Fields]: Fields[K] }
    : T extends Table
      ? Mode extends "select"
        ? BuildSchema<"select", T["_"]["columns"], undefined>["properties"]
        : Mode extends "insert"
          ? BuildSchema<"insert", T["_"]["columns"], undefined>["properties"]
          : {}
      : {};

/** Spread a Drizzle table (or TypeBox object) into a plain record of field schemas. */
export const spread = <T extends TObject | Table, Mode extends "select" | "insert" | undefined>(
  schema: T,
  mode?: Mode
): Spread<T, Mode> => {
  const newSchema: Record<string, unknown> = {};
  let table: TObject;

  switch (mode) {
    case "insert":
    case "select":
      if (Kind in schema) {
        table = schema as TObject;
        break;
      }
      table = (mode === "insert" ? createInsertSchema(schema as Table) : createSelectSchema(schema as Table)) as TObject;
      break;
    default:
      if (!(Kind in schema)) throw new Error("Expect a schema");
      table = schema as TObject;
  }

  for (const key of Object.keys(table.properties)) newSchema[key] = table.properties[key];

  return newSchema as Spread<T, Mode>;
};

/** `spread` over a record of tables: `spreads({ programs }, "insert").programs.name`. */
export const spreads = <T extends Record<string, TObject | Table>, Mode extends "select" | "insert" | undefined>(
  models: T,
  mode?: Mode
): { [K in keyof T]: Spread<T[K], Mode> } => {
  const newSchema: Record<string, unknown> = {};
  for (const key of Object.keys(models)) newSchema[key] = spread(models[key], mode);
  return newSchema as { [K in keyof T]: Spread<T[K], Mode> };
};

/**
 * A nullable column's schema without `| null` (for bodies that take a value or nothing).
 * Filters the union by hand: `t.Exclude` throws on elysia kinds such as `UnionEnum`.
 */
export const nonNull = <S extends TSchema>(schema: S): TExclude<S, TNull> => {
  const members = (schema as { anyOf?: TSchema[] }).anyOf;
  if (!members) return schema as unknown as TExclude<S, TNull>;
  const rest = members.filter((m) => m[Kind] !== "Null");
  return (rest.length === 1 ? rest[0] : t.Union(rest)) as unknown as TExclude<S, TNull>;
};
