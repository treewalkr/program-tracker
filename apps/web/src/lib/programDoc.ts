import { ProgramWeeksDocument, sessionTag } from "@pt/shared";
import type { ProgramWeekDto } from "./api/types";

const FIELD: Record<string, string> = {
  modality: "cardio modality is empty",
  name: "name is empty",
};

/** Validate the whole weeks doc; the message names the week and session a trainer has to fix. */
export function validateProgramDoc(
  weeks: ProgramWeekDto[]
): { ok: true } | { ok: false; message: string } {
  const res = ProgramWeeksDocument.safeParse(weeks);
  if (res.success) {
    return { ok: true };
  }
  const first = res.error.issues[0];
  if (!first) {
    return { ok: false, message: "Invalid program document" };
  }
  const [wi, key, si, ...rest] = first.path;
  const week = typeof wi === "number" ? weeks[wi] : undefined;
  if (week && key === "sessions" && typeof si === "number" && week.sessions[si]) {
    const s = week.sessions[si];
    const field = rest.filter((p) => typeof p === "string").at(-1);
    const what = (field && FIELD[String(field)]) || first.message;
    return { ok: false, message: `Week ${week.week} · ${sessionTag(s)} (${s.name}): ${what}` };
  }
  if (week) return { ok: false, message: `Week ${week.week}: ${first.message}` };
  const prefix = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return { ok: false, message: `${prefix}${first.message}` };
}
