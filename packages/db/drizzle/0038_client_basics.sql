-- Client basics (client-basics-plan.md): intake fields, all optional. Dates are calendar days.
ALTER TABLE "clients" ADD COLUMN "experience" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "bodyweight_kg" real;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "height_cm" real;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "started_on" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "phone" text;
