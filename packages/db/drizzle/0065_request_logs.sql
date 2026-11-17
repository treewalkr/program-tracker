-- Failed (>= 400, not 401) and slow (>= 2 s) API requests, keyed by the x-request-id a feedback ticket records.
-- Expand only: a new table nothing reads yet, so the previous API keeps working during the deploy and after a rollback.
CREATE TABLE "request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"trainer_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_logs_request_id_idx" ON "request_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_logs_created_at_idx" ON "request_logs" USING btree ("created_at");
