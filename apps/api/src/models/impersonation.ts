/** View as trainer — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { impersonations } from "@pt/db/schema";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "../utility";
import { str } from "./shared";

const fields = { reason: str({ maxLength: 500 }) };
const ImpersonationInsert = createInsertSchema(impersonations, fields);
const ImpersonationUpdate = createUpdateSchema(impersonations, fields);
const StartRequired = t.Pick(ImpersonationInsert, ["trainerId"]);
const StartOptional = t.Pick(ImpersonationUpdate, ["ticketId", "reason"]);

export const ImpersonationModel = {
  /** Start a view: whose account, and the ticket it's for (that ticket's page is where it opens). */
  start: t.Object({
    ...spread(StartRequired),
    ticketId: t.Optional(nonNull(StartOptional.properties.ticketId)),
    reason: t.Optional(nonNull(StartOptional.properties.reason)),
  }),
  started: t.Object({ returnTo: t.String(), until: t.String() }),
  stopped: t.Object({ returnTo: t.String() }),
  /** Allow edits: the viewed trainer's first name, typed back. */
  allowEdits: t.Object({ confirm: t.String({ minLength: 1, maxLength: 120 }) }),
  editsAllowed: t.Object({ writesUntil: t.String() }),
};
