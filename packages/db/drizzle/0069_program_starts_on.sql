-- "Week 1 starts on" (FB-017): programs.starts_on is the day Week 1 starts; every block-week window
-- derives from it. Expand only: a nullable column the previous API never reads or writes, so it keeps
-- working during the deploy and after a rollback (programs it activates leave it null, and the new code
-- falls back to the old anchor for null). The backfill writes each activated program's current anchor
-- (the earlier of its activation day and its first log), so no existing week moves.
ALTER TABLE "programs" ADD COLUMN "starts_on" date;
--> statement-breakpoint
UPDATE "programs" p
SET "starts_on" = LEAST(
  (p."activated_at" AT TIME ZONE 'UTC')::date,
  COALESCE((SELECT MIN(l."date") FROM "session_logs" l WHERE l."program_id" = p."id"), (p."activated_at" AT TIME ZONE 'UTC')::date)
)
WHERE p."activated_at" IS NOT NULL AND p."starts_on" IS NULL;
