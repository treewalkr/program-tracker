-- Session kind rename, release 2 (docs/kind-rename-plan.md): the stored session kind "lifting" becomes
-- "exercises" in the three live stores — session_logs.kind (and its column DEFAULT), session_types.format
-- and every session in programs.sessions (weeks[].sessions[].kind). Data only: no column is added, dropped,
-- renamed or retyped. History (ai_generations.draft, llm_calls.parsed, chat_messages.proposal,
-- ai_imports.result), device drafts and old import files keep "lifting" and read through the permanent alias.
--
-- Why the previous release (v0.1.35) keeps working on this data, during the deploy and after a rollback:
-- it already reads "exercises" through its kind alias (packages/shared/src/sessionKind.ts maps
-- "exercises" → "lifting" in every zod schema, in the kind/format column reads and in the web client), so
-- it sees these rows as it sees its own. Rows it writes after a rollback say "lifting"; this release reads
-- both, and re-running these statements by hand converts them.
--
-- The program JSON is rewritten structurally (jsonb_set on each session object, no text replace), only
-- for programs that hold a "lifting" session; weeks, sessions and every other field keep their order and
-- values. programs.version (optimistic locking) is not bumped: open editors keep saving, and their
-- "lifting" values are normalized on write. Drizzle runs the whole migration in one transaction. Re-running
-- the statements is a no-op.
--
-- Dry run (read-only; how many rows each statement touches):
--   SELECT
--     (SELECT count(*) FROM "session_logs" WHERE "kind" = 'lifting') AS session_logs,
--     (SELECT count(*) FROM "session_types" WHERE "format" = 'lifting') AS session_types,
--     (SELECT count(*) FROM "programs" p WHERE jsonb_typeof(p."sessions") = 'array' AND EXISTS (
--        SELECT 1 FROM jsonb_array_elements(p."sessions") w
--        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w->'sessions') = 'array' THEN w->'sessions' ELSE '[]'::jsonb END) s
--        WHERE s->>'kind' = 'lifting')) AS programs,
--     (SELECT count(*) FROM "programs" p
--        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p."sessions") = 'array' THEN p."sessions" ELSE '[]'::jsonb END) w
--        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w->'sessions') = 'array' THEN w->'sessions' ELSE '[]'::jsonb END) s
--        WHERE s->>'kind' = 'lifting') AS program_sessions;
-- To rehearse the writes, run this file between BEGIN and ROLLBACK.
ALTER TABLE "session_logs" ALTER COLUMN "kind" SET DEFAULT 'exercises';--> statement-breakpoint
UPDATE "session_logs" SET "kind" = 'exercises' WHERE "kind" = 'lifting';--> statement-breakpoint
UPDATE "session_types" SET "format" = 'exercises' WHERE "format" = 'lifting';--> statement-breakpoint
UPDATE "programs" AS p
SET "sessions" = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(w->'sessions') = 'array' THEN jsonb_set(w, '{sessions}', (
        SELECT coalesce(jsonb_agg(
          CASE WHEN s->>'kind' = 'lifting' THEN jsonb_set(s, '{kind}', '"exercises"') ELSE s END
          ORDER BY si
        ), '[]'::jsonb)
        FROM jsonb_array_elements(w->'sessions') WITH ORDINALITY AS ss(s, si)
      ))
      ELSE w
    END
    ORDER BY wi
  )
  FROM jsonb_array_elements(p."sessions") WITH ORDINALITY AS ws(w, wi)
)
WHERE jsonb_typeof(p."sessions") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p."sessions") w
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w->'sessions') = 'array' THEN w->'sessions' ELSE '[]'::jsonb END) s
    WHERE s->>'kind' = 'lifting'
  );
