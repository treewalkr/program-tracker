-- The feedback agent's run behind each AI answer and note (llm_calls, purpose `feedback_answer`, transcript in llm_blobs). Nullable, so the previous API keeps working during the deploy; ratings go in llm_feedback (subject kind `feedback_answer`) with no schema change.
ALTER TABLE "feedback_comments" ADD COLUMN "llm_call_id" uuid REFERENCES "llm_calls"("id") ON DELETE SET NULL;
