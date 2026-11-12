import { Elysia, t } from "elysia";
import { and, eq, sql } from "drizzle-orm";
import { db, roleLabels } from "@pt/db";
import {
  EXERCISE_ROLE_INFO,
  customRoleKey,
  isBuiltinRole,
  rankAfter,
  type RoleLabel,
} from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { loadRoleLabels } from "../lib/role-labels";
import { RoleLabelModel } from "../models/role-labels";

/** Single spaces, trimmed. */
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** The label (built-in or the trainer's own, archived included) already called `name`, if any. */
const sameName = (labels: RoleLabel[], name: string, except?: string) =>
  labels.find((l) => l.key !== except && l.name.toLowerCase() === name.toLowerCase());

const taken = (name: string) => ({ error: `"${name}" is already a label` });

/**
 * Role labels (docs/role-labels-plan.md): the six built-ins plus the trainer's
 * own. Built-ins keep their key and name; the trainer may change their chip,
 * meaning and position. Own labels are archived, never deleted — programs
 * still render them.
 */
export const roleLabelRoutes = new Elysia({ prefix: "/v1/vocabulary/role-labels", tags: ["vocabulary"] })
  .use(trainerContext)
  /** Merged list by rank: built-ins with overrides applied + own labels (archived flagged). */
  .get("/", ({ trainerId }) => loadRoleLabels(trainerId))
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const name = clean(body.name);
      const description = clean(body.description);
      if (!name) return status(422, { error: "name is required" });
      if (!description) return status(422, { error: "say what the label means" });
      const labels = await loadRoleLabels(trainerId);
      const clash = sameName(labels, name);
      const rank = rankAfter(labels, body.after);
      const chip = body.chip ? clean(body.chip) || null : null;
      // re-creating an archived label brings it back with the new meaning
      if (clash?.id && clash.archived) {
        const [row] = await db
          .update(roleLabels)
          .set({ name, chip, description, rank, archivedAt: null, updatedAt: new Date() })
          .where(eq(roleLabels.id, clash.id))
          .returning();
        return status(201, (await loadRoleLabels(trainerId)).find((l) => l.id === row.id)!);
      }
      if (clash) return status(409, taken(clash.name));
      const [row] = await db.insert(roleLabels).values({ trainerId, name, chip, description, rank }).returning();
      return status(201, (await loadRoleLabels(trainerId)).find((l) => l.key === customRoleKey(row.id))!);
    },
    {
      body: RoleLabelModel.create,
    }
  )
  /**
   * `:id` is a built-in key (power, primary, …) or an own label's id.
   * Built-ins: chip/description/rank (an override row; empty = back to the
   * default). Own labels: name/chip/description/rank.
   */
  .patch(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const labels = await loadRoleLabels(trainerId);
      const now = new Date();
      if (isBuiltinRole(params.id)) {
        const key = params.id;
        if (body.name !== undefined && clean(body.name) !== EXERCISE_ROLE_INFO[key].name) {
          return status(422, { error: "built-in labels keep their name" });
        }
        const current = labels.find((l) => l.key === key)!;
        const set = {
          ...(body.chip !== undefined ? { chip: clean(body.chip) || null } : {}),
          ...(body.description !== undefined ? { description: clean(body.description) || null } : {}),
          ...(body.rank !== undefined ? { rank: body.rank } : {}),
          updatedAt: now,
        };
        await db
          .insert(roleLabels)
          .values({ trainerId, builtinKey: key, name: EXERCISE_ROLE_INFO[key].name, rank: current.rank, ...set })
          .onConflictDoUpdate({
            target: [roleLabels.trainerId, roleLabels.builtinKey],
            targetWhere: sql`${roleLabels.builtinKey} is not null`,
            set,
          });
        return (await loadRoleLabels(trainerId)).find((l) => l.key === key)!;
      }

      const existing = labels.find((l) => l.id === params.id);
      if (!existing) return status(404, { error: "label not found" });
      const set: Partial<typeof roleLabels.$inferInsert> = { updatedAt: now };
      if (body.name !== undefined) {
        const name = clean(body.name);
        if (!name) return status(422, { error: "name is required" });
        const clash = sameName(labels, name, existing.key);
        if (clash) return status(409, taken(clash.name));
        set.name = name;
      }
      if (body.chip !== undefined) set.chip = clean(body.chip) || null;
      if (body.description !== undefined) {
        const description = clean(body.description);
        if (!description) return status(422, { error: "say what the label means" });
        set.description = description;
      }
      if (body.rank !== undefined) set.rank = body.rank;
      await db.update(roleLabels).set(set).where(and(eq(roleLabels.id, params.id), eq(roleLabels.trainerId, trainerId)));
      return (await loadRoleLabels(trainerId)).find((l) => l.id === params.id)!;
    },
    {
      params: t.Object({ id: t.String({ maxLength: 60 }) }),
      body: RoleLabelModel.update,
    }
  )
  /** Archive an own label: out of the picker and the AI list; programs still show it. */
  .delete(
    "/:id",
    async ({ params, status, trainerId }) => {
      if (isBuiltinRole(params.id)) return status(422, { error: "built-in labels can't be removed" });
      const [row] = await db
        .update(roleLabels)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(roleLabels.id, params.id), eq(roleLabels.trainerId, trainerId)))
        .returning();
      if (!row) return status(404, { error: "label not found" });
      return (await loadRoleLabels(trainerId)).find((l) => l.id === row.id)!;
    },
    { params: t.Object({ id: t.String({ maxLength: 60 }) }) }
  );
