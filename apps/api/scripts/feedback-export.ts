/**
 * Write feedback to disk for a coding agent:
 *   <out>/feedback.md      — self-contained items, screenshots linked relatively
 *   <out>/feedback.json    — same items, machine-readable
 *   <out>/shots/FB-001.png, FB-001-page.jpg
 *
 * Usage: bun run feedback:export [--status accepted|new,accepted|all] [--out feedback]
 * Defaults: --status accepted (the owner's go-list), --out <repo>/feedback.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { inArray } from "drizzle-orm";
import { db, feedbackItems } from "@pt/db";
import { feedbackHandle, feedbackMarkdown } from "@pt/shared";
import { listFeedback, parseStatuses, shotExt } from "../src/lib/feedback";

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

const files = new Map<string, { element?: string; page?: string }>();
if (items.length) {
  const shots = await db
    .select({ id: feedbackItems.id, elementShot: feedbackItems.elementShot, pageShot: feedbackItems.pageShot })
    .from(feedbackItems)
    .where(inArray(feedbackItems.id, items.map((i) => i.id)));
  for (const s of shots) {
    const handle = feedbackHandle(items.find((i) => i.id === s.id)!.number);
    const entry: { element?: string; page?: string } = {};
    if (s.elementShot) {
      entry.element = `shots/${handle}.${shotExt(s.elementShot)}`;
      await writeFile(join(out, entry.element), s.elementShot);
    }
    if (s.pageShot) {
      entry.page = `shots/${handle}-page.${shotExt(s.pageShot)}`;
      await writeFile(join(out, entry.page), s.pageShot);
    }
    files.set(s.id, entry);
  }
}

const label = statuses ? statuses.join(", ") : "all";
await writeFile(
  join(out, "feedback.md"),
  feedbackMarkdown(items, {
    title: `Trainer feedback (${label})`,
    imageUrl: (item, kind) => files.get(item.id)?.[kind] ?? null,
  }),
);
await writeFile(
  join(out, "feedback.json"),
  `${JSON.stringify(
    items.map((i) => ({ handle: feedbackHandle(i.number), ...i, screenshots: files.get(i.id) ?? {} })),
    null,
    2,
  )}\n`,
);

console.log(`✓ ${items.length} item(s) [${label}] → ${out}/feedback.md`);
process.exit(0);
