CREATE TABLE "trainer_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"client_id" uuid,
	"document" text NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "approved_program_id" uuid;--> statement-breakpoint
ALTER TABLE "trainer_preferences" ADD CONSTRAINT "trainer_preferences_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_preferences" ADD CONSTRAINT "trainer_preferences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_approved_program_id_programs_id_fk" FOREIGN KEY ("approved_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;