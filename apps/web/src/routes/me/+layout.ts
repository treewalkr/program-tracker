import { redirect } from "@sveltejs/kit";
import { apiMode } from "$lib/api";
import { portalApi } from "$lib/api/portal";
import { portalRedirect } from "$lib/portal/gate";
import { appPath } from "$lib/portal/lang";

export const ssr = false;
export const prerender = false;

/** The client portal's gate: the `pt_client` session, never the trainer's. */
export const load = async ({ url }) => {
  const session = await portalApi.session();
  // the demo is always signed in; it still shows its sign-in page when asked for it
  const path = appPath(url);
  const to = apiMode === "mock" && path === "/me/login" ? null : portalRedirect(path, session);
  if (to) redirect(307, to);
  return { portal: session };
};
