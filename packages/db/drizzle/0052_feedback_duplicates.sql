-- A ticket can be a duplicate of another open one (FB-014 → FB-012): closing the original closes it too. Nullable, so the previous API keeps working during the deploy.
ALTER TABLE "feedback_items" ADD COLUMN "duplicate_of" uuid REFERENCES "feedback_items"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_items_duplicate_of_idx" ON "feedback_items" ("duplicate_of");
