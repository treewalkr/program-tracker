ALTER TABLE "trainers" ADD COLUMN "google_sub" text;
--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "avatar_url" text;
--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_google_sub_unique" UNIQUE("google_sub");
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
