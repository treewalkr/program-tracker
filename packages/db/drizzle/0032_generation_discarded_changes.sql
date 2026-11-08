-- F04 (docs/exact-revisions-plan.md §B): AI changes outside a built proposal, reverted before storing.
ALTER TABLE "ai_generations" ADD COLUMN "discarded_changes" jsonb;
