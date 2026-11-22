import { asc, eq, sql } from "drizzle-orm";
import { cardioModalities, db, type CardioModalityRow } from "@pt/db";
import { MODALITY_PRESETS } from "@pt/shared";

/**
 * The trainer's modalities, seeding any preset they don't have yet (same rule as
 * ensureSessionTypes). Names are unique per trainer in code — there's no UNIQUE
 * index — so the seed runs under a per-trainer lock. `write: false` (a GET while
 * the admin views as this trainer) returns the missing presets unsaved.
 */
export async function ensureModalities(trainerId: string, { write = true } = {}): Promise<CardioModalityRow[]> {
  const list = (q: Pick<typeof db, "select"> = db) =>
    q
      .select()
      .from(cardioModalities)
      .where(eq(cardioModalities.trainerId, trainerId))
      .orderBy(asc(cardioModalities.createdAt), asc(cardioModalities.name));
  const missingOf = (rows: CardioModalityRow[]) => {
    const keys = new Set(rows.map((r) => r.presetKey));
    const names = new Set(rows.map((r) => r.name.toLowerCase()));
    return MODALITY_PRESETS.filter((p) => !keys.has(p.key) && !names.has(p.name.toLowerCase()));
  };
  const existing = await list();
  const missing = missingOf(existing);
  if (missing.length === 0) return existing;
  const now = Date.now();
  const toRow = (p: (typeof MODALITY_PRESETS)[number], i: number) => ({
    trainerId,
    name: p.name,
    metric: p.metric,
    presetKey: p.key,
    createdAt: new Date(now + i),
  });
  if (!write) return [...existing, ...missing.map((p, i) => ({ ...toRow(p, i), id: crypto.randomUUID(), archivedAt: null }))];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('modalities:' || ${trainerId}))`);
    const still = missingOf(await list(tx));
    if (still.length) await tx.insert(cardioModalities).values(still.map(toRow));
    return list(tx);
  });
}
