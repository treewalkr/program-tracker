-- Feedback images move to their own table: on a ticket (comment_id null) or on a reply, kinds element / page (captured screenshots) and upload. Copies the existing element_shot / page_shot over; the old columns stay for one release (the previous API reads them during the deploy) and are dropped later. The copy is idempotent (WHERE NOT EXISTS) so the drop migration can re-run it for tickets filed in that window.
CREATE TABLE "feedback_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"comment_id" uuid,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bytea NOT NULL,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_item_id_feedback_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_comment_id_feedback_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."feedback_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_attachments_item_idx" ON "feedback_attachments" USING btree ("item_id","comment_id","position");--> statement-breakpoint
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
);
