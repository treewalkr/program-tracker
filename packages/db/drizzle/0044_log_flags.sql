-- Log flags: pre-session readiness ({ sleep, soreness } 1–5) and per-exercise flags (pain, technique, skipped + reason). Null on older rows.
ALTER TABLE "session_logs" ADD COLUMN "readiness" jsonb;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "flags" jsonb;
