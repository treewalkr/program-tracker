-- Client portal: a trainer turns it on per client; the client signs in with Google (email match) or a reusable access link, and logs their own sessions. All additive and nullable/defaulted, so the previous API keeps working during the deploy.
ALTER TABLE "clients" ADD COLUMN "portal_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_google_sub" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_portal_google_sub_unique" UNIQUE("portal_google_sub");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_portal_token_unique" UNIQUE("portal_token");--> statement-breakpoint
CREATE TABLE "client_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_sessions_client_idx" ON "client_sessions" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "logged_by" text DEFAULT 'trainer' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_logged_by" CHECK ("logged_by" IN ('trainer', 'client'));
