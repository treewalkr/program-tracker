-- Deload is no longer baked into phasing — it's a hand-set week directive.
-- Strip the dead key from stored program phasing.
UPDATE "programs"
SET "phasing" = "phasing" - 'deloadWeeks'
WHERE "phasing" ? 'deloadWeeks';
