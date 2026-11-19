-- View as trainer (admin impersonation): two audit tables, the acting columns on auth_sessions and
-- request_logs.actor_id. Expand only: new tables and nullable columns the previous API never reads or
-- writes, so it keeps working during the deploy and after a rollback (a session it signs in leaves them null).
CREATE TABLE "impersonations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"ticket_id" uuid,
	"reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" text
);
--> statement-breakpoint
CREATE TABLE "impersonation_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"impersonation_id" uuid NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_admin_id_trainers_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_ticket_id_feedback_items_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."feedback_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_writes" ADD CONSTRAINT "impersonation_writes_impersonation_id_impersonations_id_fk" FOREIGN KEY ("impersonation_id") REFERENCES "public"."impersonations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impersonations_trainer_id_idx" ON "impersonations" USING btree ("trainer_id","started_at");--> statement-breakpoint
CREATE INDEX "impersonation_writes_impersonation_id_idx" ON "impersonation_writes" USING btree ("impersonation_id");--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "acting_as_trainer_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "acting_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "acting_writes_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "impersonation_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_acting_as_trainer_id_trainers_id_fk" FOREIGN KEY ("acting_as_trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_impersonation_id_impersonations_id_fk" FOREIGN KEY ("impersonation_id") REFERENCES "public"."impersonations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_actor_id_trainers_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
