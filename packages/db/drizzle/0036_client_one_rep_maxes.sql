-- F28 (top10-remaining-plan.md P6): the client's 1RMs, exerciseId → { kg, date }; drives %1RM prescriptions.
ALTER TABLE "clients" ADD COLUMN "one_rep_maxes" jsonb;
