-- A deploy closes tickets its commits name (FB-012): the release's thread entries (author_kind 'system') record the commit and the live version, so one commit closes a ticket at most once.
ALTER TABLE "feedback_comments" ADD COLUMN "ship" jsonb;
