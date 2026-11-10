-- Feedback tickets can be edited by their reporter or the admin while open: when, and by whom (no history kept).
ALTER TABLE "feedback_items" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN "edited_by" uuid;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_edited_by_trainers_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
