import { and, eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  aiGenerations,
  aiImports,
  chatMessages,
  clientMessages,
  clients,
  coachingRules,
  db,
  llmFeedback,
  periodizationSchemes,
  programExamples,
  programs,
  promptTemplates,
  sessionTypes,
} from "@pt/db";

/**
 * Tenant isolation in one place. Every id a request names — the `:id` in the
 * path, or a clientId/programId/generationId in the query or body — must
 * belong to the signed-in trainer. Anything else reads as 404, so trainers
 * can't probe for each other's records.
 */

type Owned = PgTable & { id: PgColumn; trainerId: PgColumn };

/** What the 404 calls each table — matches the handlers' own not-found errors. */
const NOUN = new Map<Owned, string>([
  [clients, "client"],
  [programs, "program"],
  [aiGenerations, "generation"],
  [aiImports, "import"],
  [chatMessages, "proposal"],
  [clientMessages, "client message"],
  [programExamples, "example"],
  [periodizationSchemes, "scheme"],
  [promptTemplates, "template"],
  [sessionTypes, "session type"],
  [coachingRules, "rule"],
  [llmFeedback, "note"],
]);

/** Route prefix → the table its `:id` / `:messageId` param points into. */
const PATH_OWNERS: [prefix: string, table: Owned][] = [
  ["/v1/clients/", clients],
  ["/v1/programs/", programs],
  ["/v1/ai/generations/", aiGenerations],
  ["/v1/ai/imports/", aiImports],
  ["/v1/ai/chat/proposals/", chatMessages],
  ["/v1/client-messages/", clientMessages],
  ["/v1/examples/", programExamples],
  ["/v1/schemes/", periodizationSchemes],
  ["/v1/ai/prompt-templates/", promptTemplates],
  ["/v1/session-types/", sessionTypes],
  ["/v1/ai/rules/", coachingRules],
  ["/v1/ai/feedback/notes/", llmFeedback],
];

/** Query/body field → the table it references. */
const FIELD_OWNERS: [field: string, table: Owned][] = [
  ["clientId", clients],
  ["programId", programs],
  ["basedOnProgramId", programs],
  ["createdFromProgramId", programs],
  ["generationId", aiGenerations],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function owns(table: Owned, id: unknown, trainerId: string): Promise<boolean> {
  if (typeof id !== "string" || !UUID.test(id)) return false;
  const rows = await db
    .select({ id: table.id })
    .from(table as PgTable)
    .where(and(eq(table.id, id), eq(table.trainerId, trainerId)))
    .limit(1);
  return rows.length > 0;
}

const fieldsOf = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** "client not found"-style error for the first id the trainer doesn't own, or null. */
export async function foreignReference(
  trainerId: string,
  req: { route: string; params?: unknown; query?: unknown; body?: unknown },
): Promise<string | null> {
  const params = fieldsOf(req.params);
  const pathId = params.id ?? params.messageId;
  const pathTable = PATH_OWNERS.find(([prefix]) => req.route.startsWith(prefix))?.[1];
  if (pathTable && pathId !== undefined && !(await owns(pathTable, pathId, trainerId))) return notFound(pathTable);

  for (const source of [fieldsOf(req.query), fieldsOf(req.body)]) {
    for (const [field, table] of FIELD_OWNERS) {
      const id = source[field];
      if (id === undefined || id === null || id === "") continue;
      if (!(await owns(table, id, trainerId))) return notFound(table);
    }
  }
  return null;
}

const notFound = (table: Owned) => `${NOUN.get(table)} not found`;
