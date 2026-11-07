ALTER TABLE "trainers" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "last_sign_in_at" timestamp with time zone;
