/** Role labels — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { roleLabels } from "@pt/db/schema";
import { ROLE_LABEL_CHIP_MAX, ROLE_LABEL_DESCRIPTION_MAX, ROLE_LABEL_NAME_MAX } from "@pt/shared";
import { createUpdateSchema, nonNull } from "../utility";
import { str } from "./shared";

const RoleLabelUpdate = createUpdateSchema(roleLabels, {
  name: str({ minLength: 1, maxLength: ROLE_LABEL_NAME_MAX }),
  chip: str({ maxLength: ROLE_LABEL_CHIP_MAX }),
  description: str({ maxLength: ROLE_LABEL_DESCRIPTION_MAX }),
});
const RoleLabelText = t.Required(t.Pick(RoleLabelUpdate, ["name", "chip", "description"]));
/** The route clears chip/description with "" (→ NULL), so bodies take strings, not null. */
const roleLabel = {
  name: RoleLabelText.properties.name,
  chip: nonNull(RoleLabelText.properties.chip),
  description: nonNull(RoleLabelText.properties.description),
};

export const RoleLabelModel = {
  create: t.Object({
    name: roleLabel.name,
    chip: t.Optional(roleLabel.chip),
    description: roleLabel.description,
    /** Key of the label this one sorts right after; absent = last. */
    after: t.Optional(t.String({ maxLength: 60 })),
  }),
  update: t.Object({
    name: t.Optional(roleLabel.name),
    chip: t.Optional(roleLabel.chip),
    description: t.Optional(roleLabel.description),
    rank: t.Optional(t.Number()),
  }),
};
