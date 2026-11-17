-- An exercise can carry several movement patterns, in order; the first is the primary. Expand only:
-- the new column has a default and movement_pattern stays (the API keeps writing the primary to it),
-- so the previous API keeps working during the deploy and after a rollback. Drop it in a later release.
ALTER TABLE "exercises" ADD COLUMN "movement_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "exercises" SET "movement_patterns" = jsonb_build_array("movement_pattern") WHERE "movement_pattern" IS NOT NULL;
