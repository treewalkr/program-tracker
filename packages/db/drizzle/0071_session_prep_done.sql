-- Session blocks: movement prep is a checklist, not sets. session_logs.prep_done holds the ticked
-- program-exercise ids. Expand only: a NOT NULL column with a DEFAULT, so the previous API's inserts
-- (which never name it) keep working during the deploy and after a rollback.
ALTER TABLE "session_logs" ADD COLUMN "prep_done" jsonb DEFAULT '[]'::jsonb NOT NULL;
