-- Deload settings: the trainer's deload rule (null = the built-in default) and a client's override (null = the trainer's).
ALTER TABLE "trainers" ADD COLUMN "deload_settings" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "deload_settings" jsonb;
