import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mockApi, mockState, mockUseBigRoster } from "$lib/api/mock/api";
import { BIG_ROSTER_SIZE } from "$lib/api/mock/bigRoster";
import type { TrainerApi } from "$lib/api/types";
import { localIso } from "$lib/overview";
import { loadLogPage, loadMember, loadOverview, loadWhosNext } from "./pageLoads";

/**
 * No N+1 from the web (AGENTS.md): each page's opening reads run against the demo roster and the
 * 25-member one through a counting wrapper, and no call may repeat more often on the big roster
 * than on the small one. A page whose requests grow with the roster fails here, by name:
 * "Overview: api.client called 25× for 25 members".
 *
 * The pages call the loaders in pageLoads.ts (a .svelte page can't run its onMount under bun test),
 * so the guard covers what those hold; scripts/guards flags a per-member `api.x()` written in the
 * page itself.
 */

type Counts = Record<string, number>;

/** The mock API, counting every call by method name. */
function counting(): { api: TrainerApi; counts: Counts } {
  const counts: Counts = {};
  const api = new Proxy(mockApi as TrainerApi, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function" || typeof key !== "string") return value;
      return (...args: unknown[]) => {
        counts[key] = (counts[key] ?? 0) + 1;
        return value.apply(target, args);
      };
    },
  });
  return { api, counts };
}

const today = localIso(new Date());

interface Page {
  name: string;
  /** Opens the page for one member `id` against `api`. */
  open: (api: TrainerApi, id: string) => Promise<unknown>;
}

const pages: Page[] = [
  { name: "Overview", open: (api) => loadOverview(api) },
  // The Members list asks for one page of the roster (`api.roster`), however long the roster is.
  { name: "Members list", open: (api) => api.roster({}) },
  // The member page's Programs tab and the member's current program come back with `api.client`.
  { name: "Member page", open: (api, id) => loadMember(api, id) },
  { name: "Log a session", open: (api, id) => loadLogPage(api, id) },
  // After a save the page re-reads the member's logs, then finds who's next from the whole roster.
  { name: "Log a session, after a save", open: async (api, id) => { await api.sessionLogs(id); await loadWhosNext(api, id, today); } },
];

async function countsFor(page: Page, id: string): Promise<{ counts: Counts; members: number }> {
  const { api: counted, counts } = counting();
  const members = mockState.clients.length;
  await page.open(counted, id);
  return { counts, members };
}

describe("a page's API calls don't grow with the number of members", () => {
  let restore: () => void;
  const small = new Map<string, Counts>();
  const smallMembers = { n: 0 };

  beforeAll(async () => {
    smallMembers.n = mockState.clients.length;
    const id = (await mockApi.clients())[0].id;
    for (const page of pages) small.set(page.name, (await countsFor(page, id)).counts);
    restore = mockUseBigRoster();
  });
  afterAll(() => restore());

  test("the big roster really has 25 members, more than the demo", async () => {
    expect(mockState.clients.length).toBe(BIG_ROSTER_SIZE);
    expect(smallMembers.n).toBeLessThan(BIG_ROSTER_SIZE);
  });

  for (const page of pages) {
    test(`${page.name}`, async () => {
      const id = (await mockApi.clients()).find((c) => c.status === "active")!.id;
      const { counts, members } = await countsFor(page, id);
      const before = small.get(page.name)!;
      const grew = Object.entries(counts)
        .filter(([call, n]) => n > (before[call] ?? 0))
        .map(([call, n]) => `${page.name}: api.${call} called ${n}× for ${members} members (was ${before[call] ?? 0}× for ${smallMembers.n})`);
      expect(grew, `a page's requests must not grow with the roster — add or use a list endpoint instead of a call per member:\n${grew.join("\n")}`).toEqual([]);
    });
  }
});
