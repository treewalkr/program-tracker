-- Scheme library: a trainer's schemes get a description, the preset or scheme they were copied from, and an edit time; trainers can hide built-in presets.
ALTER TABLE "periodization_schemes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "periodization_schemes" ADD COLUMN "based_on" text;--> statement-breakpoint
ALTER TABLE "periodization_schemes" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "hidden_scheme_presets" text[] DEFAULT '{}' NOT NULL;
