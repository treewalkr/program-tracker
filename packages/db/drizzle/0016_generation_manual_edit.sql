ALTER TABLE "ai_generations" ADD COLUMN "manual_edit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "ai_generations" SET "revision_message" = substring("revision_message" from 'Trainer request: ([^\n]*)') WHERE "revision_message" LIKE 'Apply exactly these changes%';
