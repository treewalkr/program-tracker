-- What a ticket is (bug / behaviour / idea / question), picked when filing. Expand only: a nullable
-- column the previous API never writes or reads, so it keeps working during the deploy and after a
-- rollback; null = a ticket filed before kinds.
ALTER TABLE "feedback_items" ADD COLUMN "kind" text;
