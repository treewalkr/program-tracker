import { eq, inArray } from "drizzle-orm";
import { appSettings, db } from "@pt/db";

/**
 * Feature flags: platform-wide on/off switches the admin flips in
 * Settings → Admin → Features. Each is an `app_settings` row keyed
 * `flag:<name>` holding a boolean; no row means off.
 *
 * An env kill switch beats the stored value: `<NAME>=off` (e.g.
 * `IMPERSONATION=off`) turns a flag off without touching the DB, for an
 * incident. Reads are not cached: callers ask once per request at most.
 */

export const FLAGS = ["impersonation"] as const;
export type FlagName = (typeof FLAGS)[number];

export const isFlagName = (name: string): name is FlagName => (FLAGS as readonly string[]).includes(name);

const keyOf = (name: FlagName) => `flag:${name}`;

/** True when the env kill switch (`<NAME>=off`) forces the flag off. */
export const flagKilled = (name: FlagName, env: Record<string, string | undefined> = process.env) =>
  env[name.toUpperCase()]?.trim().toLowerCase() === "off";

export interface FlagState {
  name: FlagName;
  /** What the app acts on: stored on, and not killed by env. */
  enabled: boolean;
  /** The stored value, whatever the env says. */
  stored: boolean;
  /** The env kill switch is set, so the stored value is ignored. */
  killed: boolean;
  updatedAt: string | null;
}

/** Every known flag's state, in FLAGS order. */
export async function listFlags(): Promise<FlagState[]> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(inArray(appSettings.key, FLAGS.map(keyOf)));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return FLAGS.map((name) => {
    const row = byKey.get(keyOf(name));
    const stored = row?.value === true;
    const killed = flagKilled(name);
    return { name, enabled: stored && !killed, stored, killed, updatedAt: row?.updatedAt.toISOString() ?? null };
  });
}

/** Whether a flag is on right now. Off when unset, killed by env, or the DB is unreachable. */
export async function flagEnabled(name: FlagName): Promise<boolean> {
  if (flagKilled(name)) return false;
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, keyOf(name)));
    return row?.value === true;
  } catch (err) {
    console.warn(`flag ${name}: treating as off`, err);
    return false;
  }
}

/** Store a flag's value; `by` is the admin who flipped it. */
export async function setFlag(name: FlagName, on: boolean, by: string | null): Promise<FlagState> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: keyOf(name), value: on, updatedAt: now, updatedBy: by })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: on, updatedAt: now, updatedBy: by } });
  const killed = flagKilled(name);
  return { name, enabled: on && !killed, stored: on, killed, updatedAt: now.toISOString() };
}
