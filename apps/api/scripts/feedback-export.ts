/**
 * Write feedback to disk for a coding agent:
 *   <out>/feedback.md      — self-contained items, screenshots linked relatively
 *   <out>/feedback.json    — same items, machine-readable
 *   <out>/shots/FB-001-1.png, FB-001-2.jpg …  — every image, ticket then replies
 *
 * Usage: bun run feedback:export [--status accepted|new,accepted|all] [--out feedback]
 * Defaults: --status accepted (the owner's go-list), --out <repo>/feedback.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { inArray } from "drizzle-orm";
import { db, feedbackAttachments } from "@pt/db";
import { feedbackHandle, feedbackMarkdown, imageExt, type FeedbackItem } from "@pt/shared";
import { listFeedback, parseStatuses } from "../src/lib/feedback";

const { values } = parseArgs({
  options: {
    status: { type: "string", default: "accepted" },
    out: { type: "string", default: resolve(import.meta.dir, "../../../feedback") },
  },
});

const statuses = values.status === "all" ? null : (parseStatuses(values.status) ?? []);
const out = resolve(values.out!);
const items = await listFeedback(statuses, "oldest");

await rm(join(out, "shots"), { recursive: true, force: true });
await mkdir(join(out, "shots"), { recursive: true });

/** The ticket's images, then each reply's, in reading order. */
const allImages = (i: FeedbackItem) => [i.attachments, ...i.thread.map((c) => c.attachments)].flat();

/** Attachment id → its file, relative to <out>. Numbered per ticket in reading order. */
const files = new Map<string, string>();
for (const item of items) {
  const handle = feedbackHandle(item.number);
  const ordered = allImages(item);
  if (!ordered.length) continue;
  const rows = await db
    .select({ id: feedbackAttachments.id, bytes: feedbackAttachments.bytes })
    .from(feedbackAttachments)
    .where(inArray(feedbackAttachments.id, ordered.map((a) => a.id)));
  const bytes = new Map(rows.map((r) => [r.id, r.bytes]));
  for (const [n, a] of ordered.entries()) {
    const data = bytes.get(a.id);
    if (!data) continue;
    const file = `shots/${handle}-${n + 1}.${imageExt(a.mime)}`;
    await writeFile(join(out, file), data);
    files.set(a.id, file);
  }
}

const label = statuses ? statuses.join(", ") : "all";
await writeFile(
  join(out, "feedback.md"),
  feedbackMarkdown(items, {
    title: `Trainer feedback (${label})`,
    imageUrl: (_, a) => files.get(a.id) ?? null,
  }),
);
await writeFile(
  join(out, "feedback.json"),
  `${JSON.stringify(
    items.map((i) => ({
      handle: feedbackHandle(i.number),
      ...i,
      /** Attachment id → file under <out>. */
      images: Object.fromEntries(allImages(i).map((a) => [a.id, files.get(a.id) ?? null])),
    })),
    null,
    2,
  )}\n`,
);

console.log(`✓ ${items.length} item(s) [${label}] → ${out}/feedback.md`);
process.exit(0);
