import { redirect } from "@sveltejs/kit";
import { isAdminSession } from "$lib/settingsNav";

/** Workspace settings are admin-only; trainers land back on their own settings. */
export const load = async ({ parent }) => {
  const { session } = await parent();
  if (!isAdminSession(session)) redirect(307, "/settings");
};
