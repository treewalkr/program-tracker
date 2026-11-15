import { eq } from "drizzle-orm";
import { db, trainers, type ClientRow } from "@pt/db";
import { effectiveDeload, type DeloadSettings } from "@pt/shared";

/** The trainer's stored deload rule (null = the built-in default). */
export async function trainerDeloadSettings(trainerId: string): Promise<DeloadSettings | null> {
  const [row] = await db.select({ s: trainers.deloadSettings }).from(trainers).where(eq(trainers.id, trainerId));
  return row?.s ?? null;
}

/** The trainer's deload rule, filled with defaults. */
export async function trainerDeload(trainerId: string): Promise<DeloadSettings> {
  return effectiveDeload(await trainerDeloadSettings(trainerId));
}

/** A client row as the API sends it: its own override (or null) plus the rule in force. */
export function clientDto<C extends Pick<ClientRow, "deloadSettings">>(client: C, trainerSettings: DeloadSettings | null) {
  // portal secrets and links have their own route (`/v1/clients/:id/portal`), never the client row
  const { portalEnabledAt: _e, portalGoogleSub: _g, portalToken: _t, portalLastSeenAt: _s, ...rest } =
    client as C & Partial<Pick<ClientRow, "portalEnabledAt" | "portalGoogleSub" | "portalToken" | "portalLastSeenAt">>;
  return {
    ...(rest as Omit<C, "portalEnabledAt" | "portalGoogleSub" | "portalToken" | "portalLastSeenAt">),
    deloadSettings: client.deloadSettings ?? null,
    effectiveDeload: effectiveDeload(trainerSettings, client.deloadSettings),
  };
}
