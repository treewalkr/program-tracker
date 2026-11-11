import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  clients,
  db,
  feedbackComments,
  feedbackItems,
  feedbackMutes,
  feedbackReads,
  programs,
  trainers,
  type FeedbackItemRow,
} from "@pt/db";
import {
  FEEDBACK_STATUSES,
  ownedRouteRef,
  type FeedbackAuthor,
  type FeedbackComment,
  type FeedbackItem,
  type FeedbackStatus,
} from "@pt/shared";
import { attachmentsByItem } from "./feedback-attachments";

/** The trainer who last edited a ticket (a second join on trainers). */
const editors = alias(trainers, "editors");

/** Every column except the image blobs, plus the author and the last editor. */
const listColumns = {
  id: feedbackItems.id,
  number: feedbackItems.number,
  author: { id: trainers.id, name: trainers.name, avatarUrl: trainers.avatarUrl },
  status: feedbackItems.status,
  comment: feedbackItems.comment,
  triageNote: feedbackItems.triageNote,
  trainerId: feedbackItems.trainerId,
  route: feedbackItems.route,
  source: feedbackItems.source,
  context: feedbackItems.context,
  shippedIn: feedbackItems.shippedIn,
  editedAt: feedbackItems.editedAt,
  editorId: feedbackItems.editedBy,
  editedBy: { id: editors.id, name: editors.name, avatarUrl: editors.avatarUrl },
  createdAt: feedbackItems.createdAt,
  updatedAt: feedbackItems.updatedAt,
};

type ListRow = Omit<FeedbackItemRow, "elementShot" | "pageShot" | "editedBy"> & {
  author: FeedbackItem["author"];
  editorId: string | null;
  editedBy: FeedbackAuthor | null;
};

const authorColumns = { id: trainers.id, name: trainers.name, avatarUrl: trainers.avatarUrl };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids of the items whose page the viewer can open: pages about a client or
 * program answer 404 unless the viewer owns it — the admin included. Two
 * queries at most, whatever the number of rows.
 */
async function reachableItems(rows: ListRow[], viewerId: string): Promise<Set<string>> {
  const refs = rows.map((r) => ({ itemId: r.id, ref: ownedRouteRef(r.context) }));
  const wanted = { client: new Set<string>(), program: new Set<string>() };
  for (const { ref } of refs) if (ref && UUID.test(ref.id)) wanted[ref.kind].add(ref.id);
  const owned = new Set<string>();
  for (const [kind, table] of [["client", clients], ["program", programs]] as const) {
    const ids = [...wanted[kind]];
    if (ids.length === 0) continue;
    const found = await db
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, ids), eq(table.trainerId, viewerId)));
    for (const f of found) owned.add(`${kind}:${f.id}`);
  }
  return new Set(refs.filter(({ ref }) => !ref || owned.has(`${ref.kind}:${ref.id}`)).map((r) => r.itemId));
}

/**
 * Rows → API items: attaches each thread and the image metadata (two
 * queries) and, for a viewer, the unread and muted flags (two more). Unread = someone other than the viewer filed it,
 * edited it, replied or changed its status after the viewer last looked. Only the admin
 * gets AI drafts, private notes and the triage note (which then count as news for them too).
 */
async function hydrate(rows: ListRow[], viewerId: string | null, admin: boolean): Promise<FeedbackItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const comments = await db
    .select({
      id: feedbackComments.id,
      itemId: feedbackComments.itemId,
      trainerId: feedbackComments.trainerId,
      kind: feedbackComments.kind,
      body: feedbackComments.body,
      status: feedbackComments.status,
      authorKind: feedbackComments.authorKind,
      visibility: feedbackComments.visibility,
      aiMeta: feedbackComments.aiMeta,
      ship: feedbackComments.ship,
      createdAt: feedbackComments.createdAt,
      author: authorColumns,
    })
    .from(feedbackComments)
    .leftJoin(trainers, eq(trainers.id, feedbackComments.trainerId))
    // Security boundary: AI drafts and private notes never leave the server for a non-admin.
    .where(and(inArray(feedbackComments.itemId, ids), admin ? undefined : eq(feedbackComments.visibility, "public")))
    .orderBy(asc(feedbackComments.createdAt));
  const images = await attachmentsByItem(ids);
  const seen = new Map<string, Date>();
  if (viewerId) {
    const reads = await db
      .select({ itemId: feedbackReads.itemId, seenAt: feedbackReads.seenAt })
      .from(feedbackReads)
      .where(and(eq(feedbackReads.trainerId, viewerId), inArray(feedbackReads.itemId, ids)));
    for (const r of reads) seen.set(r.itemId, r.seenAt);
  }
  const muted = new Set<string>();
  if (viewerId) {
    const mutes = await db
      .select({ itemId: feedbackMutes.itemId })
      .from(feedbackMutes)
      .where(and(eq(feedbackMutes.trainerId, viewerId), inArray(feedbackMutes.itemId, ids)));
    for (const m of mutes) muted.add(m.itemId);
  }
  // No viewer (the export): nobody is opening pages, so don't flag any.
  const reachable = viewerId ? await reachableItems(rows, viewerId) : null;

  return rows.map(({ trainerId, editorId, ...r }) => {
    const mine = comments.filter((c) => c.itemId === r.id);
    let last: Date | null = trainerId !== viewerId ? r.createdAt : null;
    if (r.editedAt && editorId !== viewerId && (!last || r.editedAt > last)) last = r.editedAt;
    for (const c of mine) if (c.trainerId !== viewerId && (!last || c.createdAt > last)) last = c.createdAt;
    const seenAt = seen.get(r.id);
    const itemImages = images.get(r.id);
    const thread = mine.map(
      (c): FeedbackComment => ({
        id: c.id,
        kind: c.kind,
        author: c.author,
        authorKind: c.authorKind,
        visibility: c.visibility,
        aiMeta: admin ? c.aiMeta : null,
        ship: c.ship,
        body: c.body,
        status: c.status,
        attachments: itemImages?.get(c.id) ?? [],
        createdAt: c.createdAt.toISOString(),
      }),
    );
    return {
      ...r,
      // Security boundary: the triage note is the admin's private memo to the agent.
      triageNote: admin ? r.triageNote : null,
      attachments: itemImages?.get("") ?? [],
      thread,
      unread: viewerId !== null && last !== null && (!seenAt || last > seenAt),
      muted: muted.has(r.id),
      reachable: reachable ? reachable.has(r.id) : true,
      editedAt: r.editedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export function parseStatuses(raw: string | undefined): FeedbackStatus[] | null {
  if (!raw) return null;
  const wanted = raw.split(",").map((s) => s.trim());
  return FEEDBACK_STATUSES.filter((s) => wanted.includes(s));
}

/**
 * Who is asking. `ownerId` scopes what they may see (null = everything, the
 * admin); `viewerId` is whose unread state to compute (null = none, e.g. export).
 */
export interface FeedbackViewer {
  ownerId: string | null;
  viewerId: string | null;
}
const EVERYTHING: FeedbackViewer = { ownerId: null, viewerId: null };

const visibleTo = (ownerId: string | null): SQL | undefined =>
  ownerId ? eq(feedbackItems.trainerId, ownerId) : undefined;

const selectItems = () =>
  db
    .select(listColumns)
    .from(feedbackItems)
    .leftJoin(trainers, eq(trainers.id, feedbackItems.trainerId))
    .leftJoin(editors, eq(editors.id, feedbackItems.editedBy));

/** Items newest first (review UI) or oldest first (export reads like a queue). */
export async function listFeedback(
  statuses: FeedbackStatus[] | null,
  order: "newest" | "oldest" = "newest",
  who: FeedbackViewer = EVERYTHING,
): Promise<FeedbackItem[]> {
  const rows = await selectItems()
    .where(and(statuses ? inArray(feedbackItems.status, statuses) : undefined, visibleTo(who.ownerId)))
    .orderBy(order === "newest" ? desc(feedbackItems.number) : asc(feedbackItems.number));
  return hydrate(rows, who.viewerId, who.ownerId === null);
}

/** One item, or null when it does not exist or `who` may not see it. */
export async function getFeedback(id: string, who: FeedbackViewer = EVERYTHING): Promise<FeedbackItem | null> {
  const [row] = await selectItems().where(and(eq(feedbackItems.id, id), visibleTo(who.ownerId)));
  return row ? ((await hydrate([row], who.viewerId, who.ownerId === null))[0] ?? null) : null;
}

/** How many visible items are unread for the viewer — the sidebar badge. */
export async function unreadCount(who: FeedbackViewer): Promise<number> {
  return (await listFeedback(null, "newest", who)).filter((i) => i.unread).length;
}

/** Marks an item seen by `trainerId` now. */
export async function markSeen(trainerId: string, itemId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(feedbackReads)
    .values({ trainerId, itemId, seenAt: now })
    .onConflictDoUpdate({ target: [feedbackReads.trainerId, feedbackReads.itemId], set: { seenAt: now } });
}
