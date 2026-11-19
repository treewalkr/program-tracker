import { and, eq, inArray } from "drizzle-orm";
import { db, clients, programs, sessionLogs, type ClientRow } from "@pt/db";
import { toProgramDto } from "../routes/programs";
import { clientDto, trainerDeloadSettings } from "./deload";
import { portalLink } from "./client-auth";
import { loadLogsWithSets } from "./log-service";

/** The portal access link while the portal is on, else null. */
export const clientPortalLink = (c: ClientRow) =>
  c.portalEnabledAt != null && c.portalToken ? portalLink(c.portalToken) : null;

/**
 * The home dashboard: every client of `trainerId` with their current program,
 * newest 200 logs (each with its sets) and portal link — four queries whatever
 * the number of clients. Served by REST (GET /v1/clients/overview) and GraphQL.
 */
export async function loadClientsOverview(trainerId: string) {
  const [rows, mine] = await Promise.all([
    db.select().from(clients).where(eq(clients.trainerId, trainerId)),
    trainerDeloadSettings(trainerId),
  ]);
  if (rows.length === 0) return [];
  const ids = rows.map((c) => c.id);
  const [active, logs] = await Promise.all([
    db
      .select()
      .from(programs)
      .where(and(inArray(programs.clientId, ids), eq(programs.status, "active"))),
    // Newest 200 per client, like GET /v1/logs/sessions?clientId= — block anchors read a program's first log.
    loadLogsWithSets({ scope: inArray(sessionLogs.clientId, ids), limit: 200, perClient: true }),
  ]);
  const current = new Map<string, (typeof active)[number]>();
  for (const p of active) if (p.clientId && !current.has(p.clientId)) current.set(p.clientId, p);
  const logsOf = Map.groupBy(logs, (l) => l.clientId);
  return rows.map((c) => {
    const program = current.get(c.id);
    return {
      client: clientDto(c, mine),
      currentProgram: program ? toProgramDto(program) : null,
      logs: logsOf.get(c.id) ?? [],
      portalLink: clientPortalLink(c),
    };
  });
}
