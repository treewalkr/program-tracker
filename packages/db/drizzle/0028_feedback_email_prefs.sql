ALTER TABLE "trainers" ADD COLUMN "feedback_email_prefs" jsonb DEFAULT '{"newTickets":true,"replies":"all","status":true}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "email_token" text;
--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_email_token_unique" UNIQUE("email_token");
--> statement-breakpoint
CREATE TABLE "feedback_mutes" (
	"trainer_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_mutes_trainer_id_item_id_pk" PRIMARY KEY("trainer_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "feedback_mutes" ADD CONSTRAINT "feedback_mutes_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feedback_mutes" ADD CONSTRAINT "feedback_mutes_item_id_feedback_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;
