/** Vocabulary — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { exerciseAliases, glossaryTerms } from "@pt/db/schema";
import { GLOSSARY_KINDS, GLOSSARY_MEANING_MAX, GLOSSARY_TERM_MAX } from "@pt/shared";
import { createInsertSchema, createUpdateSchema } from "../utility";
import { str, oneOf, as } from "./shared";

const AliasInsert = createInsertSchema(exerciseAliases, {
  alias: str({ minLength: 1, maxLength: 200 }),
  /** "seed" is written by the seeder only. */
  source: as(oneOf(["import", "manual"])),
});

const glossaryFields = {
  term: str({ minLength: 1, maxLength: GLOSSARY_TERM_MAX }),
  meaning: str({ minLength: 1, maxLength: GLOSSARY_MEANING_MAX }),
  kind: as(oneOf(GLOSSARY_KINDS)),
};
const GlossaryInsert = createInsertSchema(glossaryTerms, glossaryFields);
const GlossaryUpdate = createUpdateSchema(glossaryTerms, glossaryFields);

export const VocabularyModel = {
  saveAliases: t.Object({
    items: t.Array(t.Pick(AliasInsert, ["alias", "exerciseId", "source"]), { minItems: 1, maxItems: 200 }),
  }),
  moveAlias: t.Pick(AliasInsert, ["exerciseId"]),
  createTerm: t.Pick(GlossaryInsert, ["term", "meaning", "kind"]),
  updateTerm: t.Pick(GlossaryUpdate, ["term", "meaning", "kind"]),
};
