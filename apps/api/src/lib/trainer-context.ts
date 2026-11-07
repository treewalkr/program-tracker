import { Elysia } from "elysia";
import { SESSION_COOKIE, authDisabled, trainerForToken } from "./auth";
import { foreignReference } from "./ownership";
import { getDefaultTrainerId } from "./trainer";

/**
 * Who is calling. Every route module `.use()`s this so handlers get a typed
 * `trainerId`; Elysia dedupes it, so it runs once per request.
 *
 * - no live session → 401
 * - any id in the request owned by another trainer → 404
 *
 * AUTH_DISABLED=true (tests, local hacking) acts as the oldest trainer, as admin.
 */
export const trainerContext = new Elysia({ name: "trainer-context" }).resolve(
  { as: "scoped" },
  async ({ cookie, status, route, params, query, body }) => {
    let trainerId: string;
    let isAdmin: boolean;
    if (authDisabled()) {
      trainerId = await getDefaultTrainerId();
      isAdmin = true;
    } else {
      const trainer = await trainerForToken(cookie[SESSION_COOKIE]?.value as string | undefined);
      if (!trainer) return status(401, { error: "signed out" });
      trainerId = trainer.id;
      isAdmin = trainer.isAdmin;
    }
    const missing = await foreignReference(trainerId, { route, params, query, body });
    if (missing) return status(404, { error: missing });
    return { trainerId, isAdmin };
  },
);
