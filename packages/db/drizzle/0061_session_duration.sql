-- How long a session took, first edit to Save in the portal (minutes). Additive and nullable, so the previous API keeps working during the deploy.
ALTER TABLE "session_logs" ADD COLUMN "duration_min" integer;
