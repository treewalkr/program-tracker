-- Role labels (role-labels-plan.md): the trainer's own labels and overrides of the built-ins. Postgres ≥ 15 (NULLS NOT DISTINCT).
CREATE TABLE "role_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid REFERENCES "trainers"("id") ON DELETE cascade,
	"builtin_key" text,
	"name" text NOT NULL,
	"chip" text,
	"description" text,
	"rank" double precision NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_labels_custom_description" CHECK ("builtin_key" IS NOT NULL OR "description" IS NOT NULL)
);--> statement-breakpoint
CREATE UNIQUE INDEX "role_labels_trainer_name_idx" ON "role_labels" USING btree ("trainer_id",lower("name")) NULLS NOT DISTINCT;--> statement-breakpoint
CREATE UNIQUE INDEX "role_labels_trainer_builtin_idx" ON "role_labels" USING btree ("trainer_id","builtin_key") NULLS NOT DISTINCT WHERE "builtin_key" IS NOT NULL;
