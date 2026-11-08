-- History import (paste import v2): the archived programs one import saved its logged numbers into. Set = saved (undo deletes them).
ALTER TABLE "ai_imports" ADD COLUMN "history_program_ids" uuid[];
