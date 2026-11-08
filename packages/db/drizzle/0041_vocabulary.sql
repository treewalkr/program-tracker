-- Vocabulary (paste import v1.1): the glossary, plus global seed aliases and terms. Postgres ≥ 15 (NULLS NOT DISTINCT).
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid REFERENCES "trainers"("id") ON DELETE cascade,
	"term" text NOT NULL,
	"meaning" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glossary_terms_meaning_len" CHECK (char_length("meaning") <= 200),
	CONSTRAINT "glossary_terms_kind" CHECK ("kind" IN ('abbreviation', 'technique', 'equipment', 'other'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_terms_trainer_term_idx" ON "glossary_terms" USING btree ("trainer_id",lower("term")) NULLS NOT DISTINCT;--> statement-breakpoint
-- Global glossary: the abbreviations reproduce the old hard-coded IMPORT_ABBREVIATIONS exactly.
INSERT INTO "glossary_terms" ("trainer_id", "term", "meaning", "kind") VALUES
	(NULL, 'BB', 'barbell', 'abbreviation'),
	(NULL, 'DB', 'dumbbell', 'abbreviation'),
	(NULL, 'KB', 'kettlebell', 'abbreviation'),
	(NULL, 'SA', 'single arm', 'abbreviation'),
	(NULL, 'SL', 'single leg', 'abbreviation'),
	(NULL, 'OVH', 'overhead', 'abbreviation'),
	(NULL, 'OH', 'overhead', 'abbreviation'),
	(NULL, 'RDL', 'romanian deadlift', 'abbreviation'),
	(NULL, 'OHP', 'overhead press', 'abbreviation'),
	(NULL, 'BW', 'bodyweight', 'abbreviation'),
	(NULL, 'Ext', 'extension', 'abbreviation'),
	(NULL, 'CARs', 'controlled articular rotations', 'technique'),
	(NULL, 'PAILs/RAILs', 'progressive/regressive angular isometric loading', 'technique'),
	(NULL, 'AMRAP', 'as many reps as possible', 'technique'),
	(NULL, 'EMOM', 'every minute on the minute', 'technique'),
	(NULL, 'RPE', 'rate of perceived exertion, 1–10', 'technique'),
	(NULL, 'RIR', 'reps in reserve', 'technique')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Global aliases (normalized like normalizeAlias) onto library exercises by exact name; a missing name is skipped.
INSERT INTO "exercise_aliases" ("trainer_id", "alias", "exercise_id", "source")
SELECT NULL, v.alias, e.id, 'seed'
FROM (VALUES
	('squat', 'Barbell Back Squat'),
	('back squat', 'Barbell Back Squat'),
	('front squat', 'Barbell Front Squat'),
	('bench', 'Barbell Bench Press'),
	('bench press', 'Barbell Bench Press'),
	('bb bench', 'Barbell Bench Press'),
	('incline bench', 'Incline Barbell Bench Press'),
	('incline bench press', 'Incline Barbell Bench Press'),
	('db bench', 'Dumbbell Bench Press'),
	('db bench press', 'Dumbbell Bench Press'),
	('deadlift', 'Barbell Deadlift'),
	('conventional deadlift', 'Barbell Deadlift'),
	('rdl', 'Barbell Romanian Deadlift'),
	('sl rdl', 'Dumbbell Single-Leg Romanian Deadlift'),
	('single leg rdl', 'Dumbbell Single-Leg Romanian Deadlift'),
	('ohp', 'Barbell Overhead Press'),
	('overhead press', 'Barbell Overhead Press'),
	('military press', 'Barbell Overhead Press'),
	('bent over row', 'Barbell Bent-Over Row'),
	('bb row', 'Barbell Bent-Over Row'),
	('barbell row', 'Barbell Bent-Over Row'),
	('hip thrust', 'Barbell Hip Thrust'),
	('bss', 'Bulgarian Split Squat'),
	('lat pull down', 'Lat Pulldown'),
	('pullup', 'Pull-Up'),
	('chinup', 'Chin-Up'),
	('pushup', 'Push-Up'),
	('tricep pushdown', 'Rope Triceps Pushdown'),
	('rope pushdown', 'Rope Triceps Pushdown'),
	('triceps rope push down', 'Rope Triceps Pushdown'),
	('skull crusher', 'EZ-Bar Skull Crusher'),
	('trap bar deadlift', 'Trap Bar Deadlift'),
	('hex bar deadlift', 'Trap Bar Deadlift'),
	('invert row', 'Inverted Row'),
	('low row', 'Seated Cable Row'),
	('seated row', 'Seated Cable Row')
) AS v(alias, name)
JOIN LATERAL (
	SELECT "id" FROM "exercises" WHERE "trainer_id" IS NULL AND "name" = v.name ORDER BY "archived_at" IS NOT NULL, "created_at" LIMIT 1
) e ON true
ON CONFLICT DO NOTHING;
