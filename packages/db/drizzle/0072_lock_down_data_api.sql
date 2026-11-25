-- Close Supabase's Data API (PostgREST) over the public schema. Nothing uses it: the API
-- connects as the table owner (`postgres`, which also has BYPASSRLS), so RLS with no policies
-- and dropped anon/authenticated grants leave the current and previous API untouched while
-- anyone holding the anon key gets nothing. Clears the Supabase security advisor errors.

-- RLS on every table, no policies: only the owner / BYPASSRLS roles see rows.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
-- Views check the querying role's permissions and RLS, not the creator's.
ALTER VIEW "llm_examples" SET (security_invoker = true);
--> statement-breakpoint
ALTER VIEW "llm_pairs" SET (security_invoker = true);
--> statement-breakpoint
-- Pin the trigger function's search_path so a caller can't shadow the tables it updates.
ALTER FUNCTION "llm_scrub_client"() SET search_path = public, pg_catalog;
--> statement-breakpoint
-- Supabase only (local Postgres has no anon/authenticated roles): drop the Data API roles'
-- grants, now and for tables this role creates later.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
