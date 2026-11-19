import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./graphql-env.d.ts";
import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";

/**
 * gql.tada over the API's SDL (apps/api/src/graphql/schema.graphql) — the
 * GraphQL trial's only source of types. JSON scalars map to the DTO field
 * types the REST path already uses, so both feed the same page code.
 */
export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    ID: string;
    DateTime: string;
    CardioTarget: NonNullable<ClientDto["cardioTarget"]>;
    ProgramWeeks: ProgramDto["weeks"];
    CardioLog: NonNullable<SessionLogDto["cardio"]>;
  };
}>();

export type { ResultOf } from "gql.tada";
