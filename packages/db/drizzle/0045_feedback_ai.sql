-- Feedback auto-reply agent: AI-written thread entries (author_kind 'ai', trainer_id null) that are public, an unsent draft, or a private triage note, with the agent's verdict in ai_meta; plus the admin's AI mode (off / drafts / auto).
ALTER TABLE "feedback_comments" ADD COLUMN "author_kind" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD COLUMN "ai_meta" jsonb;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "feedback_ai_mode" text DEFAULT 'drafts' NOT NULL;
