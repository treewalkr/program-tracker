-- A status change (and its Won't-fix reason) the admin made without telling the reporter: no email, no unread badge. Additive with a default, so the previous API keeps working during the deploy.
ALTER TABLE "feedback_comments" ADD COLUMN "silent" boolean DEFAULT false NOT NULL;
