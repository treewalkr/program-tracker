import type { Reroute } from "@sveltejs/kit";
import { splitLang } from "$lib/portal/lang";

/** `/th/me` and `/en/me` both match `routes/me`: the language prefix is invisible to the routes tree. */
export const reroute: Reroute = ({ url }) => {
  const { lang, path } = splitLang(url.pathname);
  return lang ? path : undefined;
};
