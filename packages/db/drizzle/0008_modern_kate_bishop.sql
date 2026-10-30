ALTER TABLE "clients" ADD COLUMN "cardio_target" jsonb;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "kind" text DEFAULT 'lifting' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "cardio" jsonb;