<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { RosterPageDto, RosterQuery, RosterRowDto } from "$lib/api/types";
  import { listUrlState } from "$lib/list/urlState.svelte";
  import { daysBetween, localToday, shortDay } from "$lib/adminClients";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Counter from "$lib/ui/Counter.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import ListToolbar from "$lib/ui/ListToolbar.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Pager from "$lib/ui/Pager.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import { ROSTER_SORTS, ROSTER_STATUSES, cardioUnitLabel, type RosterStatus } from "@pt/shared";

  const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const STATUS_LABEL: Record<RosterStatus, string> = { all: "All", active: "Active", paused: "Paused", archived: "Archived" };
  const SORT_LABEL = { name: "Name", last: "Last trained", recent: "Recently added" } as const;
  /** Days without a session before "last trained" turns amber. */
  const STALE_DAYS = 7;
  const today = localToday();

  const list = listUrlState({ status: ROSTER_STATUSES, sort: ROSTER_SORTS });

  let data = $state<RosterPageDto | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  /** Unsearched counts, so the head line describes the whole roster while a search narrows the list. */
  let roster = $state<RosterPageDto["counts"] | null>(null);
  let seq = 0;

  const query = $derived<RosterQuery>({
    q: list.q.trim() || undefined,
    status: list.params.status,
    sort: list.params.sort,
    page: list.page,
    limit: list.limit,
  });

  async function load(q: RosterQuery) {
    const id = ++seq;
    loading = true;
    loadError = null;
    try {
      const res = await api.roster(q);
      if (id !== seq) return;
      data = res;
      if (!q.q) roster = res.counts;
      // A page past the end came back clamped — make the URL say so.
      if (q.page !== undefined && res.page !== q.page) list.setPage(res.page);
    } catch (err) {
      if (id === seq) loadError = (err as Error).message;
    } finally {
      if (id === seq) loading = false;
    }
  }

  // Refetch whenever the URL state changes. The previous page stays on screen, dimmed.
  $effect(() => {
    const q = query;
    untrack(() => load(q));
  });

  const sub = $derived.by(() => {
    if (!roster) return "…";
    if (roster.all === 0) return "No clients yet";
    if (roster.active === roster.all) return `${roster.all} on the roster`;
    return `${roster.active} active · ${roster.all} on the roster`;
  });
  const emptyRoster = $derived(data !== null && !list.filtering && data.counts.all === 0);
  const resultCount = $derived(
    data && list.q.trim() ? `${data.total} ${data.total === 1 ? "match" : "matches"}` : undefined
  );

  function schedule(c: RosterRowDto): { lifts: number | null; days: string; cardio: string | null } {
    return {
      lifts: c.sessionsPerWeek,
      days: [...c.trainingDays].sort((a, b) => a - b).map((d) => DAY[d]).join(" "),
      cardio: c.cardioTarget ? `+ ${c.cardioTarget.value} ${cardioUnitLabel(c.cardioTarget.unit)} cardio` : null,
    };
  }

  function lastTrained(day: string | null): { text: string; title: string; tone: "none" | "stale" | "recent" } {
    if (!day) return { text: "Never", title: "No session logged", tone: "none" };
    const d = daysBetween(day, today);
    const text = d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : shortDay(day, today);
    return { text, title: shortDay(day, today), tone: d > STALE_DAYS ? "stale" : "recent" };
  }

  const openRow = (e: MouseEvent, id: string) => {
    if (!(e.target as HTMLElement).closest("a, button")) goto(`/clients/${id}`);
  };
</script>

<svelte:head><title>Clients · Program Tracker</title></svelte:head>
<PageHead title="Clients" {sub}>
  {#snippet actions()}
    <Button href="/clients/new">
      {#snippet icon()}<Icon name="plus" />{/snippet}
      Add client
    </Button>
  {/snippet}
</PageHead>

{#if data === null && loadError}
  <Note tone="bad">
    Couldn't load clients — {loadError}.
    <Button small onclick={() => load(query)}>Try again</Button>
  </Note>
{:else if data === null}
  <SkeletonPanel rows={6} label="Loading clients…" />
{:else if emptyRoster}
  <section class="panel">
    <EmptyState>
      No clients yet — add your first one to start their profile.
      {#snippet actions()}
        <Button variant="primary" href="/clients/new">
          {#snippet icon()}<Icon name="plus" />{/snippet}
          Add your first client
        </Button>
      {/snippet}
    </EmptyState>
  </section>
{:else}
  <ListToolbar bind:value={list.search} label="Search clients" placeholder="Search by name or email" count={resultCount} />

  {#if loadError}
    <Note tone="bad">
      Couldn't load this page — {loadError}.
      <Button small onclick={() => load(query)}>Try again</Button>
    </Note>
  {/if}

  <section class="panel roster-box" aria-label="Clients" aria-busy={loading}>
    <div class="panel-head box-head">
      <div class="states" role="group" aria-label="Status">
        {#each ROSTER_STATUSES as s (s)}
          <button
            type="button"
            class="state"
            class:on={list.params.status === s}
            aria-pressed={list.params.status === s}
            onclick={() => list.set({ status: s })}
          >
            {STATUS_LABEL[s]}<Counter value={data.counts[s]} />
          </button>
        {/each}
      </div>
      <label class="sort">
        <span>Sort</span>
        <select class="select" value={list.params.sort} onchange={(e) => list.set({ sort: e.currentTarget.value as keyof typeof SORT_LABEL })}>
          {#each ROSTER_SORTS as s (s)}<option value={s}>{SORT_LABEL[s]}</option>{/each}
        </select>
      </label>
    </div>

    {#if data.items.length === 0}
      <EmptyState>
        {#if list.q.trim()}
          No {list.params.status === "all" ? "" : `${list.params.status} `}client matches “{list.q.trim()}”.
        {:else}
          No {list.params.status} clients.
        {/if}
        {#snippet actions()}<Button onclick={() => list.clear(["sort"])}>Clear filters</Button>{/snippet}
      </EmptyState>
    {:else}
      <div class="rows" class:stale={loading}>
        <table class="sheet roster">
          <thead>
            <tr>
              <th>Client</th>
              <th>Program</th>
              <th>Last trained</th>
              <th>Schedule</th>
              <th class="att-h"><span class="sr-only">Needs review</span><Icon name="bell" /></th>
            </tr>
          </thead>
          <tbody>
            {#each data.items as c (c.id)}
              {@const last = lastTrained(c.lastSessionAt)}
              {@const s = schedule(c)}
              <tr class="row" class:dim={c.status !== "active"} title={c.goals ?? undefined} onclick={(e) => openRow(e, c.id)}>
                <td class="who-cell">
                  <div class="who">
                    <Avatar name={c.name} />
                    <div class="who-text">
                      <div class="who-line">
                        <a class="name" href={`/clients/${c.id}`}>{c.name}</a>
                        {#if c.status !== "active"}<StatusPill status={c.status} />{/if}
                        {#if c.limitations}
                          <span class="lim" title={`Limitations: ${c.limitations}`}>
                            <Icon name="flag" /><span class="sr-only">Limitations: {c.limitations}</span>
                          </span>
                        {/if}
                      </div>
                      {#if c.goals || c.email}
                        <div class="meta">{[c.email, c.goals].filter(Boolean).join(" · ")}</div>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="prog-cell">
                  {#if c.program}
                    {@const over = c.program.weeks > 0 && c.program.week > c.program.weeks}
                    <div class="prog" class:over>
                      <span class="prog-name" title={c.program.name}>{c.program.name}</span>
                      {#if c.program.weeks > 0}
                        <span class="wk">wk {c.program.week}/{c.program.weeks}{over ? " · over" : ""}</span>
                      {:else}
                        <span class="wk">wk {c.program.week}</span>
                      {/if}
                    </div>
                    {#if c.program.weeks > 0}
                      <div class="track" aria-hidden="true">
                        <span style:width="{Math.min(100, (c.program.week / c.program.weeks) * 100)}%"></span>
                      </div>
                    {/if}
                  {:else}
                    <span class="faint">No program</span>
                    {#if c.status === "active"}<a class="write" href={`/clients/${c.id}/programs/new`}>Write one</a>{/if}
                  {/if}
                </td>
                <td class="last {last.tone}"><span class="m-label">Last trained</span><span title={last.title}>{last.text}</span></td>
                <td class="sched">
                  <span class="m-label">Schedule</span>
                  <div class="sched-val">
                    {#if s.lifts}
                      <div><span class="num">{s.lifts}×</span>{#if s.days}<span class="days">{s.days}</span>{/if}</div>
                    {:else}
                      <div class="faint">Not set</div>
                    {/if}
                    {#if s.cardio}<div class="cardio">{s.cardio}</div>{/if}
                  </div>
                </td>
                <td class="att">
                  {#if c.attention > 0}
                    <a class="pill warn" href={`/clients/${c.id}`} title="{c.attention} {c.attention === 1 ? 'signal needs' : 'signals need'} review">
                      {c.attention}<span class="sr-only"> {c.attention === 1 ? "signal needs" : "signals need"} review</span>
                    </a>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pager
        page={data.page}
        limit={data.limit}
        total={data.total}
        noun="Clients"
        onpage={(p) => list.setPage(p)}
        onlimit={(l) => list.setLimit(l)}
      />
    {/if}
  </section>
{/if}

<style>
  /* Primer Box header: status states left, sort right (GitHub's issue-list head). */
  .box-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding-block: 6px; }
  .states { display: flex; flex-wrap: wrap; gap: 2px; margin-right: auto; }
  .state {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 0; border-radius: 6px;
    background: none; font: 400 14px var(--font-ui); color: var(--muted); cursor: pointer;
  }
  .state:hover { color: var(--ink); background: var(--well-2); }
  .state.on { color: var(--ink); font-weight: 600; }
  .sort { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
  .sort .select { width: auto; padding-block: 2px; min-height: 28px; }

  .rows { overflow-x: auto; transition: opacity 120ms ease-out; }
  .rows.stale { opacity: 0.55; pointer-events: none; }

  .roster th:first-child, .roster td:first-child { padding-left: 16px; }
  .roster th:last-child, .roster td:last-child { padding-right: 16px; }
  .row { cursor: pointer; }
  .row.dim .name, .row.dim .prog-name { color: var(--muted); }

  .who { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
  .who :global(.avatar) { width: 28px; height: 28px; font-size: 11px; flex: none; margin-top: 1px; }
  .who-text { min-width: 0; }
  .who-line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .name { font-weight: 600; color: var(--ink); text-underline-offset: 3px; }
  .name:hover { color: var(--blue); text-decoration: underline; }
  .meta {
    font-size: 12px; color: var(--muted); max-width: 340px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .lim { display: inline-flex; color: var(--warn); }
  .lim :global(svg) { width: 13px; height: 13px; }

  .prog-cell { min-width: 180px; }
  .prog { display: flex; align-items: baseline; gap: 8px; }
  .prog-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
  .wk { font: 500 12px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
  .prog.over .wk { color: var(--warn); }
  .track { height: 4px; margin-top: 6px; max-width: 160px; border-radius: 99px; background: var(--well-2); overflow: hidden; }
  .track span { display: block; height: 100%; border-radius: 99px; background: var(--blue); }
  .prog.over + .track span { background: var(--warn); }
  .write { margin-left: 8px; font-size: 13px; }

  .last { white-space: nowrap; }
  .last.none { color: var(--faint); }
  .last.stale { color: var(--warn); }

  .sched { white-space: nowrap; }
  .num { font: 600 12px var(--font-mono); font-variant-numeric: tabular-nums; margin-right: 6px; }
  .days, .cardio { color: var(--muted); font-size: 13px; }
  .faint { color: var(--faint); font-size: 13px; }

  .att-h, .att { width: 1%; text-align: right; }
  .att-h :global(svg) { width: 14px; height: 14px; vertical-align: -2px; }
  .att .pill { text-decoration: none; }
  .att .pill:hover { text-decoration: underline; }

  .m-label { display: none; }

  /* Stacked cards where the five columns stop fitting beside the sidebar. */
  @container main (max-width: 700px) {
    .roster thead { display: none; }
    .roster, .roster tbody, .roster tr { display: block; width: 100%; }
    .roster tr {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px;
      padding: 12px 16px; border-bottom: 1px solid var(--line-soft);
    }
    .roster tr:last-child { border-bottom: none; }
    .roster td, .roster td:first-child, .roster td:last-child { padding: 0; border: none; min-width: 0; }
    .who-cell { grid-column: 1; grid-row: 1; }
    .att { grid-column: 2; grid-row: 1; }
    .prog-cell { grid-column: 1 / -1; padding-left: 38px !important; }
    .last, .sched { grid-column: 1 / -1; padding-left: 38px !important; display: flex; gap: 8px; align-items: baseline; white-space: normal; }
    .sched-val { display: flex; flex-wrap: wrap; gap: 0 10px; }
    .m-label { display: inline; width: 88px; flex: none; color: var(--muted); font-size: 12px; }
    .meta { max-width: none; }
    .track { max-width: none; }
  }
</style>
