-- Phase 6 (docs/llm-logging-plan.md §10): detailed feedback notes + coaching rules.
CREATE TABLE "coaching_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"client_id" uuid,
	"text" text NOT NULL,
	"category" text DEFAULT 'style' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"source" text NOT NULL,
	"source_feedback_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"violated_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaching_rules" ADD CONSTRAINT "coaching_rules_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coaching_rules" ADD CONSTRAINT "coaching_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "coaching_rules_trainer_idx" ON "coaching_rules" USING btree ("trainer_id","status");
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD COLUMN "anchor" jsonb;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD COLUMN "correction" text;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD COLUMN "scope" text;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD COLUMN "rule_id" uuid;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_rule_id_coaching_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."coaching_rules"("id") ON DELETE set null ON UPDATE no action;
