CREATE TABLE "llm_blobs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"trainer_id" uuid,
	"client_id" uuid,
	"generation_id" uuid,
	"chat_message_id" uuid,
	"client_message_id" uuid,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"temperature" real,
	"max_tokens" integer,
	"json_mode" boolean NOT NULL,
	"prompt_version" text NOT NULL,
	"app_build" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"request_blob_ids" jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_raw" text,
	"reasoning" text,
	"parsed" jsonb,
	"status" text NOT NULL,
	"error" text,
	"http_status" integer,
	"finish_reason" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"tokens_reasoning" integer,
	"tokens_cached" integer,
	"latency_ms" integer,
	"is_mock" boolean DEFAULT false NOT NULL,
	"pruned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid,
	"client_id" uuid,
	"call_id" uuid,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"signal" text NOT NULL,
	"score" smallint,
	"reason_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"comment" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "hidden_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_client_message_id_client_messages_id_fk" FOREIGN KEY ("client_message_id") REFERENCES "public"."client_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_call_id_llm_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."llm_calls"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "llm_calls_trainer_idx" ON "llm_calls" USING btree ("trainer_id","created_at");
--> statement-breakpoint
CREATE INDEX "llm_calls_purpose_idx" ON "llm_calls" USING btree ("purpose","status");
--> statement-breakpoint
CREATE INDEX "llm_calls_generation_idx" ON "llm_calls" USING btree ("generation_id");
--> statement-breakpoint
CREATE INDEX "llm_calls_turn_idx" ON "llm_calls" USING btree ("turn_id");
--> statement-breakpoint
CREATE INDEX "llm_calls_chat_message_idx" ON "llm_calls" USING btree ("chat_message_id");
--> statement-breakpoint
CREATE INDEX "llm_calls_client_message_idx" ON "llm_calls" USING btree ("client_message_id");
--> statement-breakpoint
CREATE INDEX "llm_feedback_subject_idx" ON "llm_feedback" USING btree ("subject_kind","subject_id");
--> statement-breakpoint
CREATE INDEX "llm_feedback_call_idx" ON "llm_feedback" USING btree ("call_id");
--> statement-breakpoint
-- Client deletion keeps the LLM log but anonymizes it: before the FKs null
-- client_id, blank the client's name everywhere their calls stored text.
-- Blob hashes stay as ids (content no longer matches the hash after a scrub).
CREATE OR REPLACE FUNCTION "llm_scrub_client"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  nm text := OLD.name;
  nm_json text := trim(both '"' from to_jsonb(OLD.name)::text);
BEGIN
  IF nm IS NULL OR length(trim(nm)) = 0 THEN
    RETURN OLD;
  END IF;
  UPDATE "llm_blobs" b SET "content" = replace(b."content", nm, '[client]')
  WHERE position(nm in b."content") > 0
    AND b."sha256" IN (
      SELECT r->>'sha' FROM "llm_calls" c, jsonb_array_elements(c."request_blob_ids") r
      WHERE c."client_id" = OLD.id
    );
  UPDATE "llm_calls" SET
    "response_raw" = replace("response_raw", nm, '[client]'),
    "reasoning" = replace("reasoning", nm, '[client]'),
    "error" = replace("error", nm, '[client]'),
    "parsed" = replace("parsed"::text, nm_json, '[client]')::jsonb,
    "context" = replace("context"::text, nm_json, '[client]')::jsonb
  WHERE "client_id" = OLD.id;
  UPDATE "llm_feedback" SET
    "comment" = replace("comment", nm, '[client]'),
    "payload" = replace("payload"::text, nm_json, '[client]')::jsonb
  WHERE "client_id" = OLD.id;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "clients_llm_scrub" BEFORE DELETE ON "clients" FOR EACH ROW EXECUTE FUNCTION "llm_scrub_client"();
