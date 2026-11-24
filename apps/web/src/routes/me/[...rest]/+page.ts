import { error } from "@sveltejs/kit";

/** A stale or cut `/me/…` link: the portal's own "not found", inside the portal frame. */
export const load = () => {
  error(404, "Not found");
};
