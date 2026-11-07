-- Dataset views over the LLM log (docs/llm-logging-plan.md §4). Views, not copies:
-- labels always reflect the latest feedback.

-- One row per turn: its last successful attempt, labeled by the feedback on it.
-- Priority: explicit 👎 → negative; a trainer edit → silver (target = the edit);
-- explicit 👍 → gold; implicit −1 (reject, regenerate, ignore) → negative;
-- implicit +1 (approve unedited, build, copy) → gold; else unlabeled.
CREATE VIEW "llm_examples" AS
WITH final AS (
  SELECT DISTINCT ON (c."turn_id") c.*
  FROM "llm_calls" c
  WHERE c."status" = 'ok'
  ORDER BY c."turn_id", c."attempt" DESC, c."created_at" DESC
),
explicit AS (
  SELECT DISTINCT ON (f."call_id") f."call_id", f."signal"
  FROM "llm_feedback" f
  WHERE f."call_id" IS NOT NULL AND f."signal" IN ('thumbs_up', 'thumbs_down')
  ORDER BY f."call_id", f."created_at" DESC
),
agg AS (
  SELECT
    f."call_id",
    array_agg(DISTINCT f."signal") AS signals,
    bool_or(f."score" = -1 AND f."signal" <> 'thumbs_down') AS implicit_negative,
    bool_or(f."score" = 1 AND f."signal" <> 'thumbs_up') AS implicit_positive,
    bool_or(
      f."signal" IN ('draft_approved_edited', 'program_edited_after_approval')
      OR (f."signal" = 'client_message_approved' AND f."score" = 0)
    ) AS edited,
    (array_agg(f."payload" ORDER BY f."created_at" DESC) FILTER (
      WHERE f."signal" IN ('draft_approved_edited', 'program_edited_after_approval')
         OR (f."signal" = 'client_message_approved' AND f."score" = 0)
    ))[1] AS edit_payload,
    array_agg(f."comment" ORDER BY f."created_at") FILTER (WHERE f."comment" IS NOT NULL) AS comments
  FROM "llm_feedback" f
  WHERE f."call_id" IS NOT NULL
  GROUP BY f."call_id"
),
tags AS (
  SELECT f."call_id", array_agg(DISTINCT t) AS reason_tags
  FROM "llm_feedback" f, unnest(f."reason_tags") t
  WHERE f."call_id" IS NOT NULL
  GROUP BY f."call_id"
)
SELECT
  c."id" AS "call_id",
  c."turn_id",
  c."purpose",
  c."trainer_id",
  c."client_id",
  c."generation_id",
  c."chat_message_id",
  c."client_message_id",
  c."provider_id",
  c."model",
  c."prompt_version",
  c."is_mock",
  c."created_at",
  CASE
    WHEN e."signal" = 'thumbs_down' THEN 'negative'
    WHEN a."edited" THEN 'silver'
    WHEN e."signal" = 'thumbs_up' THEN 'gold'
    WHEN a."implicit_negative" THEN 'negative'
    WHEN a."implicit_positive" THEN 'gold'
    ELSE 'unlabeled'
  END AS "label",
  coalesce(a."signals", '{}') AS "signals",
  coalesce(tg."reason_tags", '{}') AS "reason_tags",
  coalesce(a."comments", '{}') AS "comments",
  a."edit_payload"
FROM final c
LEFT JOIN explicit e ON e."call_id" = c."id"
LEFT JOIN agg a ON a."call_id" = c."id"
LEFT JOIN tags tg ON tg."call_id" = c."id";
--> statement-breakpoint
-- Preference pairs over draft lineages: the approved draft (preferred) against
-- the draft the trainer asked to change (kind 'revision', its direct parent) or
-- a sibling they rejected or moved past (kind 'sibling', same parent, or both
-- roots for the same client, kind and base program).
CREATE VIEW "llm_pairs" AS
WITH gen_call AS (
  SELECT DISTINCT ON (c."generation_id") c."generation_id", c."id" AS call_id, c."is_mock"
  FROM "llm_calls" c
  WHERE c."status" = 'ok'
    AND c."generation_id" IS NOT NULL
    AND c."purpose" IN ('block_generate', 'week_generate', 'revision', 'week_revision')
  ORDER BY c."generation_id", c."created_at" DESC
)
SELECT
  'revision' AS "kind",
  g."trainer_id",
  g."client_id",
  g."id" AS "preferred_generation_id",
  gc.call_id AS "preferred_call_id",
  p."id" AS "non_preferred_generation_id",
  pc.call_id AS "non_preferred_call_id",
  g."revision_message" AS "critique",
  (gc."is_mock" OR pc."is_mock") AS "is_mock",
  g."created_at"
FROM "ai_generations" g
JOIN "ai_generations" p ON p."id" = g."parent_generation_id"
JOIN gen_call gc ON gc."generation_id" = g."id"
JOIN gen_call pc ON pc."generation_id" = p."id"
WHERE g."status" = 'approved'
UNION ALL
SELECT
  'sibling',
  g."trainer_id",
  g."client_id",
  g."id",
  gc.call_id,
  s."id",
  sc.call_id,
  s."reject_reason",
  (gc."is_mock" OR sc."is_mock"),
  g."created_at"
FROM "ai_generations" g
JOIN "ai_generations" s
  ON s."client_id" = g."client_id"
 AND s."kind" = g."kind"
 AND s."id" <> g."id"
 AND s."status" IN ('rejected', 'validated')
 AND s."parent_generation_id" IS NOT DISTINCT FROM g."parent_generation_id"
 AND s."based_on_program_id" IS NOT DISTINCT FROM g."based_on_program_id"
 AND s."target_week" IS NOT DISTINCT FROM g."target_week"
JOIN gen_call gc ON gc."generation_id" = g."id"
JOIN gen_call sc ON sc."generation_id" = s."id"
WHERE g."status" = 'approved';
