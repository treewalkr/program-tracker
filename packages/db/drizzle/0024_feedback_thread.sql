CREATE TABLE "feedback_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"trainer_id" uuid,
	"kind" text NOT NULL,
	"body" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_item_id_feedback_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "feedback_comments_item_idx" ON "feedback_comments" USING btree ("item_id","created_at");
--> statement-breakpoint
CREATE TABLE "feedback_reads" (
	"trainer_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "feedback_reads_trainer_id_item_id_pk" PRIMARY KEY("trainer_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "feedback_reads" ADD CONSTRAINT "feedback_reads_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feedback_reads" ADD CONSTRAINT "feedback_reads_item_id_feedback_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN "shipped_in" text;
