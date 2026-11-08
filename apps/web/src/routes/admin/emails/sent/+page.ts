import { redirect } from "@sveltejs/kit";

/** The outbox used to live at /admin/emails/sent; keep old links (and ?demo) working. */
export const load = ({ url }) => redirect(308, `/admin/emails/outbox${url.search}`);
