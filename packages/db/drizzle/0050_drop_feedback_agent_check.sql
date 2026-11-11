-- The readiness check was removed (feedback workflow batch A); nothing has read or written this column since.
ALTER TABLE "feedback_items" DROP COLUMN IF EXISTS "agent_check";
