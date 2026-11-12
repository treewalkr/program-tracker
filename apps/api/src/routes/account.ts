import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db, feedbackItems, feedbackMutes, trainers } from "@pt/db";
import { DEFAULT_DELOAD, DeloadSettings, feedbackEmailPrefs, feedbackHandle } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { trainerDeload } from "../lib/deload";
import { feedbackAiMode } from "../lib/feedback-ai";
import { AccountModel } from "../models/account";

const ADMIN_ONLY = { error: "admin only" } as const;

const clip = (s: string, n: number) => {
  const c = s.replace(/\s+/g, " ").trim();
  return c.length > n ? `${c.slice(0, n - 1)}…` : c;
};

/** Master switch, which events, and the muted tickets — what Settings shows. */
async function notificationSettings(trainerId: string, isAdmin: boolean) {
  const [row] = await db
    .select({ feedbackEmails: trainers.feedbackEmails, prefs: trainers.feedbackEmailPrefs })
    .from(trainers)
    .where(eq(trainers.id, trainerId));
  const muted = await db
    .select({ itemId: feedbackItems.id, number: feedbackItems.number, comment: feedbackItems.comment })
    .from(feedbackMutes)
    .innerJoin(feedbackItems, eq(feedbackItems.id, feedbackMutes.itemId))
    .where(eq(feedbackMutes.trainerId, trainerId))
    .orderBy(desc(feedbackItems.number));
  return {
    feedbackEmails: row?.feedbackEmails ?? true,
    prefs: feedbackEmailPrefs(row?.prefs),
    muted: muted.map((m) => ({ ...m, handle: feedbackHandle(m.number), comment: clip(m.comment, 80) })),
    isAdmin,
  };
}

/** The signed-in trainer's own settings: which feedback emails reach them, and their deload rule. */
export const accountRoutes = new Elysia({ prefix: "/v1/account", tags: ["account"] })
  .use(trainerContext)
  .get("/notifications", ({ trainerId, isAdmin }) => notificationSettings(trainerId, isAdmin), {
    detail: { summary: "Your email notification settings" },
  })
  .patch(
    "/notifications",
    async ({ trainerId, isAdmin, body }) => {
      const set: Partial<typeof trainers.$inferInsert> = {};
      if (body.feedbackEmails !== undefined) set.feedbackEmails = body.feedbackEmails;
      if (body.prefs) {
        const [row] = await db
          .select({ prefs: trainers.feedbackEmailPrefs })
          .from(trainers)
          .where(eq(trainers.id, trainerId));
        set.feedbackEmailPrefs = { ...feedbackEmailPrefs(row?.prefs), ...body.prefs };
      }
      if (Object.keys(set).length) await db.update(trainers).set(set).where(eq(trainers.id, trainerId));
      return notificationSettings(trainerId, isAdmin);
    },
    {
      body: t.Object({
        feedbackEmails: AccountModel.feedbackEmails,
        prefs: t.Optional(
          t.Partial(
            t.Object({
              newTickets: t.Boolean(),
              replies: t.Union([t.Literal("all"), t.Literal("mine"), t.Literal("off")]),
              status: t.Boolean(),
            }),
          ),
        ),
      }),
      detail: { summary: "Change feedback email settings (master switch and/or per-event prefs)" },
    },
  )
  /** Admin: whether the feedback auto-reply agent may answer, and how (see lib/feedback-ai). */
  .get(
    "/feedback-ai",
    async ({ isAdmin, status }) => (isAdmin ? { mode: await feedbackAiMode() } : status(403, ADMIN_ONLY)),
    { detail: { summary: "AI answers on feedback: off, drafts only, or auto-send confident ones (admin)" } },
  )
  .put(
    "/feedback-ai",
    async ({ isAdmin, trainerId, body, status }) => {
      if (!isAdmin) return status(403, ADMIN_ONLY);
      await db.update(trainers).set({ feedbackAiMode: body.mode }).where(eq(trainers.id, trainerId));
      return { mode: body.mode };
    },
    {
      body: AccountModel.feedbackAiMode,
      detail: { summary: "Set AI answers on feedback (admin)" },
    },
  )
  .get("/deload", ({ trainerId }) => trainerDeload(trainerId), {
    detail: { summary: "Your deload rule (the default when you haven't set one)" },
  })
  .put(
    "/deload",
    async ({ trainerId, body }) => {
      await db.update(trainers).set({ deloadSettings: body }).where(eq(trainers.id, trainerId));
      return body;
    },
    { body: DeloadSettings, detail: { summary: "Set your deload rule (every client without an override follows it)" } },
  )
  .delete(
    "/deload",
    async ({ trainerId }) => {
      await db.update(trainers).set({ deloadSettings: null }).where(eq(trainers.id, trainerId));
      return { ...DEFAULT_DELOAD };
    },
    { detail: { summary: "Reset your deload rule to the default" } },
  );
