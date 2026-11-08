-- Client email is optional: drop NOT NULL and store a missing email as NULL, never ''.
ALTER TABLE "clients" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
UPDATE "clients" SET "email" = NULL WHERE btrim("email") = '';
