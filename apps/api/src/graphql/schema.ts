import { readFileSync } from "node:fs";
import { GraphQLError, GraphQLScalarType, Kind, NoSchemaIntrospectionCustomRule } from "graphql";
import { createSchema, createYoga, type Plugin } from "graphql-yoga";
import { loadClientsOverview } from "../lib/clients-overview";

/** What every resolver gets: the trainer trainerContext resolved for this request. */
export interface GraphQLContext {
  trainerId: string;
}

/** The SDL — also what the web's gql.tada types are generated from. */
export const typeDefs = readFileSync(new URL("./schema.graphql", import.meta.url), "utf8");

/** A JSON document passed through as is; output only (the schema takes no arguments). */
const jsonScalar = (name: string) =>
  new GraphQLScalarType({
    name,
    serialize: (v) => v,
    parseValue: () => {
      throw new GraphQLError(`${name} is output only`);
    },
  });

const DateTime = new GraphQLScalarType({
  name: "DateTime",
  serialize: (v) => (v instanceof Date ? v.toISOString() : v),
  parseValue: (v) => v,
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? ast.value : null),
});

export const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers: {
    DateTime,
    CardioTarget: jsonScalar("CardioTarget"),
    ProgramWeeks: jsonScalar("ProgramWeeks"),
    CardioLog: jsonScalar("CardioLog"),
    Query: {
      dashboard: (_: unknown, __: unknown, { trainerId }: GraphQLContext) => loadClientsOverview(trainerId),
    },
  },
});

/** Production answers no introspection: the schema is read from the repo, not the live API. */
const noIntrospection: Plugin = {
  onValidate: ({ addValidationRule }) => addValidationRule(NoSchemaIntrospectionCustomRule),
};

export const createDashboardYoga = (production = process.env.NODE_ENV === "production") =>
  createYoga<GraphQLContext>({
    schema,
    graphqlEndpoint: "/v1/graphql",
    maskedErrors: true,
    graphiql: !production,
    landingPage: false,
    // request logging is requestLog's job; Yoga reports only problems
    logging: "warn",
    plugins: production ? [noIntrospection] : [],
  });
