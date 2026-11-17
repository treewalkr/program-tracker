-- Session types become a fixed two-level taxonomy (docs/session-types-plan.md): preset rows carry a
-- preset_key and are locked; a trainer's own types stay custom (preset_key null). Expand only: one
-- nullable column and a data backfill. The previous API keeps working: it never reads preset_key, and
-- its ensureSessionTypes returns the existing rows as they are. The new API seeds any missing presets.
--
-- Backfill: the old defaults map onto presets when their format fits; Hypertrophy and anything else stay
-- custom. A mapped row takes the preset name unless another of the trainer's types already has it (saved
-- programs keep the typeName they captured either way). Circuit becomes format 'any' (it fits lifting and
-- cardio sessions); the previous web build leaves 'any' rows out of its picker until the new one loads,
-- which is acceptable for the deploy window.
--
-- No unique index on (trainer_id, preset_key): preset names are locked, so the existing unique index on
-- (trainer_id, lower(name)) already keeps one row per preset, and a new UNIQUE would be a contract change.
ALTER TABLE "session_types" ADD COLUMN "preset_key" text;--> statement-breakpoint
UPDATE "session_types" AS st
SET
  "preset_key" = m.key,
  "format" = m.format,
  "name" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "session_types" AS o
      WHERE o.trainer_id = st.trainer_id AND o.id <> st.id AND lower(o.name) = lower(m.name)
    ) THEN st.name
    ELSE m.name
  END
FROM (
  VALUES
    ('strength', 'strength-training', 'Strength training', 'lifting'),
    ('mobility', 'strength-training.stability-mobility', 'Stability & mobility', 'lifting'),
    ('circuit', 'metabolic.circuit', 'Circuit', 'any'),
    ('zone 2', 'cardiovascular.aerobic-base', 'Aerobic base', 'cardio'),
    ('intervals', 'cardiovascular.anaerobic-endurance', 'Anaerobic endurance', 'cardio')
) AS m(old_name, key, name, format)
WHERE lower(st.name) = m.old_name
  AND st.preset_key IS NULL
  AND (st.format = m.format OR m.format = 'any');
