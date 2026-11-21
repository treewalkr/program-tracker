/** Member HR profiles — request/response schemas derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { clientHrProfiles } from "@pt/db/schema";
import { HR_ZONE_METHODS, type HrZones } from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, spread } from "../utility";
import { as, oneOf } from "./shared";

const Day = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const Bpm = t.Integer({ minimum: 30, maximum: 240 });

const row = {
  method: as(oneOf(HR_ZONE_METHODS)),
  zones: as(t.Unsafe<HrZones>(t.Any())),
};
const fields = {
  ...row,
  effectiveFrom: as(Day),
  maxHrTestedOn: as(Day),
  restingHr: as(Bpm),
  maxHr: as(Bpm),
  lthr: as(Bpm),
};

const HrInsert = createInsertSchema(clientHrProfiles, fields);
const HrUpdate = createUpdateSchema(clientHrProfiles, fields);
const HrSelect = createSelectSchema(clientHrProfiles, row);

export const HrProfileModel = {
  /** A new version. The zones are computed by the server unless the method is custom; the
   *  cross-field rules (inputs per method, gaps/overlaps) are the shared zod HrProfileInput. */
  create: t.Object({
    ...spread(t.Pick(HrInsert, ["effectiveFrom", "method"])),
    ...spread(t.Pick(HrUpdate, ["restingHr", "maxHr", "maxHrTestedOn", "lthr", "zones"])),
  }),
  dto: HrSelect,
};
