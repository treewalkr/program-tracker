import type { ParamMatcher } from "@sveltejs/kit";

/** `/templates/new` opens the composer; any other segment is a 404. */
export const match = ((p: string): p is "new" => p === "new") satisfies ParamMatcher;
