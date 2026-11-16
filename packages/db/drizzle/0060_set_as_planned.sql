-- A set saved untouched from the prescription (a portal one-tap save). Additive and defaulted, so the previous API keeps working during the deploy.
ALTER TABLE "set_logs" ADD COLUMN "as_planned" boolean DEFAULT false NOT NULL;
