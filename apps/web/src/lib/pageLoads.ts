import type { HrProfileDto, TrainerApi } from "$lib/api/types";
import { buildClientStrip, stripWeeks } from "$lib/overview";
import { nextToLog } from "$lib/logRecap";

/**
 * What a trainer page reads from the API when it opens, kept out of the .svelte file so
 * pageLoads.test.ts can run the very same reads against the 3-member demo and the 25-member roster
 * and fail if a page's request count grows with the number of members (AGENTS.md › No N+1 from
 * the web). A page that needs another read adds it here, never beside the markup; never call the
 * API once per member, log or program inside these (one list endpoint for the whole set).
 */

/** Overview (`/`): every member's program, logs and portal link in one call. */
export function loadOverview(api: TrainerApi) {
  return Promise.all([api.clientsOverview(), api.providers(), api.notifications()]);
}

/** Member page (`/clients/[id]`): the member, their program list and the reads its tabs open on. */
export async function loadMember(api: TrainerApi, id: string) {
  const [detail, exercises, chainWeek, hrProfiles] = await Promise.all([
    api.client(id),
    api.exercises(),
    api.chainWeek(id).catch(() => null),
    api.hrProfiles(id).catch(() => [] as HrProfileDto[]),
  ]);
  const logs = await api.sessionLogs(id);
  const notifications = await api.notifications();
  const generations = await api.generations(id);
  return { detail, exercises, chainWeek, hrProfiles, logs, notifications, generations };
}

/** Log a session (`/clients/[id]/log`): the member, the catalogue, the modality picker and their past logs. */
export async function loadLogPage(api: TrainerApi, id: string) {
  const [detail, exercises] = await Promise.all([api.client(id), api.exercises()]);
  // The picker is a side read: a failure leaves it empty, nothing else.
  const modalities = api.modalities().catch(() => null);
  const pastLogs = await api.sessionLogs(id);
  return { detail, exercises, modalities, pastLogs };
}

/** After a log save: who to log next, read like Overview reads it, from one call for the whole roster. */
export async function loadWhosNext(api: TrainerApi, id: string, today: string) {
  const weeks = stripWeeks(new Date(), 1);
  const roster = await api.clientsOverview();
  const strips = roster.map(({ client: c, currentProgram, logs }) =>
    // This client was just logged, others that aren't training can't be next.
    c.id === id || c.status !== "active" ? buildClientStrip(c, null, [], weeks, today) : buildClientStrip(c, currentProgram, logs, weeks, today)
  );
  return nextToLog(strips, id, today);
}
