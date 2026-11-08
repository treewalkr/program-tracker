-- Paste import (paste-import-plan.md): stored imports and exercise aliases. Postgres ≥ 15 (NULLS NOT DISTINCT).
CREATE TABLE "ai_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL REFERENCES "trainers"("id") ON DELETE cascade,
	"client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
	"text" text NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"chunks_total" integer DEFAULT 0 NOT NULL,
	"chunks_done" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "ai_imports_client_idx" ON "ai_imports" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE TABLE "exercise_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid REFERENCES "trainers"("id") ON DELETE cascade,
	"alias" text NOT NULL,
	"exercise_id" uuid NOT NULL REFERENCES "exercises"("id") ON DELETE cascade,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_aliases_trainer_alias_key" UNIQUE NULLS NOT DISTINCT("trainer_id","alias")
);
