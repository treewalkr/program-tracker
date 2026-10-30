import { ProgramWeeksDocument } from "@pt/shared";
import type { ProgramWeekDto } from "./api/types";

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
  const prefix = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return { ok: false, message: `${prefix}${first.message}` };
}
