import { Elysia } from "elysia";
import { CLIENT_COOKIE, clientForToken } from "./client-auth";

/**
 * Who is calling from the client portal: `{ clientId, trainerId }` from the
 * `pt_client` cookie, or 401. Unlike `trainerContext` there is no
 * AUTH_DISABLED bypass — tests mint real client sessions.
 */
export const clientContext = new Elysia({ name: "client-context" }).resolve(
  { as: "scoped" },
  async ({ cookie, status }) => {
    const client = await clientForToken(cookie[CLIENT_COOKIE]?.value as string | undefined);
    if (!client) return status(401, { error: "signed out" });
    return { clientId: client.clientId, trainerId: client.trainerId };
  },
);
