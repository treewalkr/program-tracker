import { Elysia } from "elysia";
import { trainerContext } from "../lib/trainer-context";
import { createDashboardYoga } from "../graphql/schema";

const yoga = createDashboardYoga();

/**
 * GraphQL trial — read-only, GET only. trainerContext signs the request in
 * (401 signed out); a read-only "view as trainer" passes because it's a GET.
 * Not in the OpenAPI spec: the SDL (src/graphql/schema.graphql) documents it.
 */
export const graphqlRoutes = new Elysia()
  .use(trainerContext)
  .get("/v1/graphql", ({ request, trainerId }) => yoga.fetch(request, { trainerId }), { detail: { hide: true } });
