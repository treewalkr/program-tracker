-- Cardio module (docs/cardio-plan.md). Expand only: every new column is nullable or has a default and
-- every new table is unused by the previous release, so the previous API keeps working during the deploy
-- and after a rollback — it never reads or writes the new columns (its inserts leave them null/default)
-- and never touches the new tables.
--
-- session_logs gains a snapshot of the prescribed session (`prescription`) and the coach's review stamp
-- and feedback. client_hr_profiles holds versioned HR zones (a new row per change; one version number per
-- client is kept unique in code — a UNIQUE index would be a contract change). assessments holds VO2max
-- field tests (the result is always computed by the server). cardio_templates and cardio_modalities are
-- the trainer's library; modality names are unique per trainer in code, with a plain lookup index.
--
-- Data step: the weekly cardio target unit `zone_minutes` is replaced by session load, and existing
-- zone-minutes targets are cleared (decided 2026-11-21). A null target is valid for the previous API too.
ALTER TABLE "session_logs" ADD COLUMN "prescription" jsonb;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "reviewed_by" uuid REFERENCES "trainers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "trainer_feedback" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "display_units" jsonb;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "hidden_cardio_presets" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "display_units" jsonb;--> statement-breakpoint
CREATE TABLE "client_hr_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "effective_from" date NOT NULL,
  "method" text NOT NULL,
  "resting_hr" integer,
  "max_hr" integer,
  "max_hr_tested_on" date,
  "lthr" integer,
  "zones" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "client_hr_profiles_client_effective_idx" ON "client_hr_profiles" ("client_id", "effective_from");--> statement-breakpoint
CREATE TABLE "assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "protocol" text NOT NULL,
  "formula_version" text NOT NULL,
  "tested_on" date NOT NULL,
  "inputs" jsonb NOT NULL,
  "result" real NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "assessments_client_tested_idx" ON "assessments" ("client_id", "tested_on");--> statement-breakpoint
CREATE TABLE "cardio_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trainer_id" uuid NOT NULL REFERENCES "trainers"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "prescription" jsonb NOT NULL,
  "based_on" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "cardio_templates_trainer_idx" ON "cardio_templates" ("trainer_id");--> statement-breakpoint
CREATE TABLE "cardio_modalities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trainer_id" uuid NOT NULL REFERENCES "trainers"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "metric" text NOT NULL,
  "preset_key" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "cardio_modalities_trainer_name_idx" ON "cardio_modalities" ("trainer_id", lower("name"));--> statement-breakpoint
UPDATE "clients" SET "cardio_target" = NULL WHERE "cardio_target"->>'unit' = 'zone_minutes';
