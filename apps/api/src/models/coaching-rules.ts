/** Coaching rules — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { clients, coachingRules } from "@pt/db/schema";
import { COACHING_RULE_CATEGORIES } from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "../utility";
import { str, oneOf, as } from "./shared";

const coachingRuleFields = {
  text: str({ minLength: 3, maxLength: 400 }),
  category: as(oneOf(COACHING_RULE_CATEGORIES)),
  /** A trainer activates or retires; only the extractor proposes. */
  status: as(oneOf(["active", "retired"])),
};
const CoachingRuleInsert = createInsertSchema(coachingRules, coachingRuleFields);
const CoachingRuleUpdate = createUpdateSchema(coachingRules, coachingRuleFields);

export const RuleScope = oneOf(["client", "always"]);

export const CoachingRuleModel = {
  create: t.Object({
    ...spread(t.Pick(CoachingRuleInsert, ["text"])),
    /** null = all clients. */
    ...spread(t.Pick(CoachingRuleUpdate, ["category", "clientId"])),
  }),
  update: t.Pick(CoachingRuleUpdate, ["text", "category", "clientId", "status"]),
  confirm: t.Object({
    scope: RuleScope,
    clientId: t.Optional(nonNull(CoachingRuleUpdate.properties.clientId)),
    text: CoachingRuleUpdate.properties.text,
  }),
};
