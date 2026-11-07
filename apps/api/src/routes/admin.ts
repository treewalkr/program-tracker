import { Elysia, t } from "elysia";
import { and, count, eq, isNull } from "drizzle-orm";
import { clients, db, trainers } from "@pt/db";
import { deleteTrainerSessions, isAdminEmail } from "../lib/auth";
import { trainerContext } from "../lib/trainer-context";
import { datasetStats } from "../lib/llm-dataset";
import { appUrl } from "../lib/email-links";
import { emailPreviews } from "../lib/email-previews";

type TrainerRow = typeof trainers.$inferSelect;

/** invited = added but never signed in; active = signed in at least once. */
const accessOf = (row: TrainerRow) => (row.disabledAt ? "disabled" : row.googleSub ? "active" : "invited");

const toDto = (row: TrainerRow, clientCount: number) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatarUrl: row.avatarUrl,
  access: accessOf(row) as "invited" | "active" | "disabled",
  isAdmin: isAdminEmail(row.email),
  clientCount,
  createdAt: row.createdAt.toISOString(),
  lastSignInAt: row.lastSignInAt?.toISOString() ?? null,
});

async function clientCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ trainerId: clients.trainerId, n: count() }).from(clients).groupBy(clients.trainerId);
  return new Map(rows.map((r) => [r.trainerId, Number(r.n)]));
}

/**
 * Platform admin console. Only the ADMIN_EMAIL account gets past the 403.
 * Adding a trainer is the invite: their Google sign-in with that email
 * links the account. Disabling signs them out everywhere.
 */
export const adminRoutes = new Elysia({ prefix: "/v1/admin", tags: ["admin"] })
  .use(trainerContext)
  .onBeforeHandle(({ isAdmin, status }) => {
    if (!isAdmin) return status(403, { error: "admin only" });
  })
  .get(
    "/trainers",
    async () => {
      const [rows, counts] = await Promise.all([db.select().from(trainers).orderBy(trainers.createdAt), clientCounts()]);
      return { trainers: rows.map((r) => toDto(r, counts.get(r.id) ?? 0)) };
    },
    { detail: { summary: "List trainer accounts" } },
  )
  .post(
    "/trainers",
    async ({ body, status }) => {
      const email = body.email.trim().toLowerCase();
      const [taken] = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.email, email)).limit(1);
      if (taken) return status(409, { error: `${email} already has an account` });
      const [created] = await db.insert(trainers).values({ name: body.name.trim(), email }).returning();
      return status(201, toDto(created, 0));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        email: t.String({ format: "email", maxLength: 254 }),
      }),
      detail: { summary: "Add a trainer (they can then sign in with Google)" },
    },
  )
  .patch(
    "/trainers/:id",
    async ({ params, body, status }) => {
      const [row] = await db.select().from(trainers).where(eq(trainers.id, params.id));
      if (!row) return status(404, { error: "trainer not found" });
      if (body.disabled && isAdminEmail(row.email)) return status(409, { error: "the admin account can't be disabled" });

      const patch: Partial<typeof trainers.$inferInsert> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.disabled !== undefined) patch.disabledAt = body.disabled ? (row.disabledAt ?? new Date()) : null;
      const [updated] = Object.keys(patch).length
        ? await db.update(trainers).set(patch).where(eq(trainers.id, row.id)).returning()
        : [row];
      if (body.disabled) await deleteTrainerSessions(row.id);
      return toDto(updated, (await clientCounts()).get(row.id) ?? 0);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        disabled: t.Optional(t.Boolean()),
      }),
      detail: { summary: "Rename, disable or re-enable a trainer" },
    },
  )
  /** Only invites nobody has used yet — real accounts get disabled, never deleted (that would cascade their data). */
  .delete(
    "/trainers/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(trainers).where(eq(trainers.id, params.id));
      if (!row) return status(404, { error: "trainer not found" });
      if (row.googleSub || isAdminEmail(row.email)) {
        return status(409, { error: "this trainer has signed in — disable them instead" });
      }
      if ((await clientCounts()).get(row.id)) return status(409, { error: "this trainer has clients — disable them instead" });
      await db.delete(trainers).where(and(eq(trainers.id, row.id), isNull(trainers.googleSub)));
      return status(204);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }), detail: { summary: "Remove an unused invite" } },
  )
  .get("/llm-stats", () => datasetStats(), {
    detail: { summary: "LLM dataset counts: final calls by purpose and label, attempts by status, feedback, pairs" },
  })
  /** Every email the app sends, rendered by the live templates from sample data. */
  .get("/emails", () => ({ emails: emailPreviews(appUrl(), process.env.EMAIL_FROM?.trim() || undefined) }), {
    detail: { summary: "Preview each notification email" },
  });
