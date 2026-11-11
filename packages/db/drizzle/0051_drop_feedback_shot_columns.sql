-- The old screenshot columns go. First re-run 0047's copy (idempotent: WHERE NOT EXISTS), so a ticket an older API wrote into them during a deploy window keeps its images.
-- Copy: the element shot is position 0, the page shot 1. Type from the magic number; PNG size from its IHDR (JPEG and WebP are left null).
INSERT INTO "feedback_attachments" ("item_id", "comment_id", "kind", "mime", "bytes", "width", "height", "position", "created_at")
SELECT s."item_id", NULL, s."kind",
	CASE
		WHEN get_byte(s."shot", 0) = 137 AND get_byte(s."shot", 1) = 80 THEN 'image/png'
		WHEN get_byte(s."shot", 0) = 255 AND get_byte(s."shot", 1) = 216 THEN 'image/jpeg'
		WHEN substring(s."shot" from 1 for 4) = '\x52494646'::bytea THEN 'image/webp'
		ELSE 'application/octet-stream'
	END,
	s."shot",
	CASE WHEN get_byte(s."shot", 0) = 137 AND length(s."shot") >= 24
		THEN (get_byte(s."shot", 16) << 24) | (get_byte(s."shot", 17) << 16) | (get_byte(s."shot", 18) << 8) | get_byte(s."shot", 19) END,
	CASE WHEN get_byte(s."shot", 0) = 137 AND length(s."shot") >= 24
		THEN (get_byte(s."shot", 20) << 24) | (get_byte(s."shot", 21) << 16) | (get_byte(s."shot", 22) << 8) | get_byte(s."shot", 23) END,
	s."position", s."created_at"
FROM (
	SELECT "id" AS "item_id", 'element' AS "kind", "element_shot" AS "shot", 0 AS "position", "created_at" FROM "feedback_items" WHERE "element_shot" IS NOT NULL AND length("element_shot") > 1
	UNION ALL
	SELECT "id", 'page', "page_shot", 1, "created_at" FROM "feedback_items" WHERE "page_shot" IS NOT NULL AND length("page_shot") > 1
) s
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_attachments" a
	WHERE a."item_id" = s."item_id" AND a."comment_id" IS NULL AND a."kind" = s."kind"
);--> statement-breakpoint
ALTER TABLE "feedback_items" DROP COLUMN IF EXISTS "element_shot";--> statement-breakpoint
ALTER TABLE "feedback_items" DROP COLUMN IF EXISTS "page_shot";
