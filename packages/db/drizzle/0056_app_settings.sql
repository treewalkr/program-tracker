-- Platform-wide settings the admin owns, one jsonb value per key. First key: `login_theme` (the login page's layout and accent). No row = the built-in default.
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_trainers_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
