ALTER TABLE "clients" ADD COLUMN "training_days" jsonb;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "phasing" jsonb;