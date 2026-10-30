ALTER TABLE "ai_generations" ADD COLUMN "kind" text DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "target_week" integer;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "direction" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "direction" text;