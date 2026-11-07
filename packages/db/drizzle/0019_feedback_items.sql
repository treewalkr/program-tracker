CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"comment" text NOT NULL,
	"triage_note" text,
	"route" text NOT NULL,
	"source" text,
	"context" jsonb NOT NULL,
	"element_shot" bytea,
	"page_shot" bytea,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_items_number_idx" ON "feedback_items" ("number");
