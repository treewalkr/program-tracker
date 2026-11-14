-- The program version a fill was drafted from: applying it refuses when the program changed since. Null = not recorded (older rows, non-fill drafts). Nullable, so the previous API keeps working during the deploy.
ALTER TABLE "ai_generations" ADD COLUMN "based_on_program_version" integer;
