-- F03 (top10-remaining-plan.md P5): separate cardio availability and a fixed long-run day.
ALTER TABLE "clients" ADD COLUMN "cardio_days" jsonb;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "long_run_day" integer;
