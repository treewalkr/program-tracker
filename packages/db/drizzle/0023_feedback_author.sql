ALTER TABLE "feedback_items" ADD COLUMN "trainer_id" uuid;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "feedback_items_trainer_idx" ON "feedback_items" USING btree ("trainer_id");
