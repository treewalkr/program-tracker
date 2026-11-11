-- The fix agent's pull request for a ticket (`bun run feedback:fix`): recorded so the next run skips a ticket whose PR is still open. Nullable, so the previous API keeps working during the deploy.
ALTER TABLE "feedback_items" ADD COLUMN "fix_pr" text;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD COLUMN "fix_pr_at" timestamp with time zone;
