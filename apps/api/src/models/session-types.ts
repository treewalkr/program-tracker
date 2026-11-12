/** Session types — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { sessionTypes } from "@pt/db/schema";
import { SESSION_TYPE_NAME_MAX } from "@pt/shared";
import { createInsertSchema, spread } from "../utility";
import { str, as } from "./shared";

const SessionTypeInsert = createInsertSchema(sessionTypes, {
  name: str({ minLength: 1, maxLength: SESSION_TYPE_NAME_MAX }),
  /** Plain string: the route answers a bad value with "format must be lifting or cardio". */
  format: as(t.String({ maxLength: 20 })),
});

export const SessionTypeModel = {
  create: t.Pick(SessionTypeInsert, ["name", "format"]),
  update: t.Object({
    ...spread(t.Partial(t.Pick(SessionTypeInsert, ["name", "format"]))),
    archived: t.Optional(t.Boolean()),
  }),
};
