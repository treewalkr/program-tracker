-- The trainer's last "Weeks" choice on the generate page (FB-013): "same" (same every week) or "alternate" (A/B weeks). Null = same every week. Nullable, so the previous API keeps working during the deploy.
ALTER TABLE "trainers" ADD COLUMN "last_weeks_choice" text;
