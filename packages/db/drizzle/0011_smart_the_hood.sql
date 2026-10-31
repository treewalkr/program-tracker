CREATE TABLE "program_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"level" text NOT NULL,
	"days_per_week" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_examples_program_id_unique" UNIQUE("program_id")
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "example_program_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "program_examples" ADD CONSTRAINT "program_examples_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_examples" ADD CONSTRAINT "program_examples_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;