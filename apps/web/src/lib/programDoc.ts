import { ProgramWeeksWrite, sessionTag } from "@pt/shared";
import type { ProgramWeekDto } from "./api/types";
import { isUniform, restIssue } from "./programEdit";

const FIELD: Record<string, string> = {
  modality: "cardio modality is empty",
  name: "name is empty",
};

/** Validate the whole weeks doc; the message names the week and session a trainer has to fix. */
export function validateProgramDoc(
  weeks: ProgramWeekDto[]
): { ok: true } | { ok: false; message: string } {
  const res = ProgramWeeksWrite.safeParse(weeks);
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
    const what = setIssue(s, rest) ?? ((field && FIELD[String(field)]) || first.message);
    return { ok: false, message: `Week ${week.week} · ${sessionTag(s)} (${s.name}): ${what}` };
  }
  if (week) return { ok: false, message: `Week ${week.week}: ${first.message}` };
  const prefix = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return { ok: false, message: `${prefix}${first.message}` };
}

/** A bad set field, in plain words with its exercise: "Back Squat — rest can't be negative". */
function setIssue(s: ProgramWeekDto["sessions"][number], path: PropertyKey[]): string | null {
  const [ex, ei, sets, k, field] = path;
  if (ex !== "exercises" || sets !== "prescribedSets" || typeof ei !== "number" || typeof k !== "number") return null;
  const exercise = s.exercises[ei];
  const set = exercise?.prescribedSets[k];
  if (!set) return null;
  let what: string | null = null;
  if (field === "restSeconds") what = restIssue(set.restSeconds);
  else if (field === "targetRpe" || field === "targetRpeMin" || field === "stopRpe") {
    const v = set[field];
    if (v != null && (v < 1 || v > 10)) what = "RPE must be 1–10";
  }
  if (!what) return null;
  const many = !isUniform(exercise.prescribedSets);
  return exerciseIssue(exercise.exerciseName ?? "Exercise", many ? `set ${set.setNumber}: ${what}` : what);
}

/** "Back Squat — rest can't be negative": a field message after what it's on (acronyms like RPE keep their case). */
export function exerciseIssue(what: string, message: string): string {
  const m = /^[A-Z][a-z]/.test(message) ? message.charAt(0).toLowerCase() + message.slice(1) : message;
  return `${what} — ${m}`;
}
