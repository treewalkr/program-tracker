-- Warm-up sets no longer exist (SET_TYPES = working | backoff).
-- Drop them from every prescription and log, renumbering the surviving sets 1..n.
DELETE FROM "set_logs" WHERE "type" = 'warm_up';
--> statement-breakpoint
CREATE FUNCTION strip_warm_up_sets(sessions jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_set(s, '{exercises}', coalesce((
      SELECT jsonb_agg(
        jsonb_set(e, '{prescribedSets}', coalesce((
          SELECT jsonb_agg(jsonb_set(ps, '{setNumber}', to_jsonb(rn)) ORDER BY rn)
          FROM (
            SELECT ps, row_number() OVER (ORDER BY ord) AS rn
            FROM jsonb_array_elements(e->'prescribedSets') WITH ORDINALITY AS t(ps, ord)
            WHERE ps->>'type' IS DISTINCT FROM 'warm_up'
          ) kept
        ), '[]'::jsonb))
        ORDER BY eord
      )
      FROM jsonb_array_elements(s->'exercises') WITH ORDINALITY AS te(e, eord)
    ), '[]'::jsonb))
    ORDER BY sord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(sessions) WITH ORDINALITY AS ts(s, sord)
$$;
--> statement-breakpoint
UPDATE "programs"
SET "sessions" = strip_warm_up_sets("sessions")
WHERE "sessions"::text LIKE '%"warm\_up"%';
--> statement-breakpoint
UPDATE "ai_generations"
SET "draft" = jsonb_set("draft", '{sessions}', strip_warm_up_sets("draft"->'sessions'))
WHERE "draft" IS NOT NULL AND "draft"::text LIKE '%"warm\_up"%';
--> statement-breakpoint
DROP FUNCTION strip_warm_up_sets(jsonb);
