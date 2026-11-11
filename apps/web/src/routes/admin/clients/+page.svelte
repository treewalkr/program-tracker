<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { CLIENT_STATUSES, pageOf, type ClientStatus } from "@pt/shared";
  import { listUrlState } from "$lib/list/urlState.svelte";
  import ListToolbar from "$lib/ui/ListToolbar.svelte";
  import Pager from "$lib/ui/Pager.svelte";
  import { apiMode } from "$lib/api";
  import { adminApi, type AdminClient } from "$lib/api/admin";
  import { filterClients, lastSessionLabel, localToday, programmeLabel, sampleAdminClients, shortDay, trainersOf } from "$lib/adminClients";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Button from "$lib/ui/Button.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const STATUS_LABEL: Record<ClientStatus, string> = { active: "Active", paused: "Paused", archived: "Archived" };

  /** Real data comes from the live API; mock mode and `?demo` show a sample platform. */
  const demo = $derived(page.url.searchParams.has("demo"));
  const useSample = $derived(apiMode === "mock" || demo);
  const today = localToday();
  /** Detail link for a client, keeping `?demo` so sample data stays sample. */
  const hrefOf = (id: string) => `/admin/clients/${encodeURIComponent(id)}${demo ? "?demo" : ""}`;

  let rows = $state<AdminClient[] | null>(null);
  let loadError = $state<string | null>(null);

  async function load(sample: boolean) {
    rows = null;
    loadError = null;
    if (sample) {
      rows = sampleAdminClients(today);
      return;
    }
    try {
      rows = await adminApi.clients();
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  // (Re)load when the source flips between sample and real data — and only then.
  $effect(() => {
    const sample = useSample;
    untrack(() => load(sample));
  });

  // Filters live in the URL so a trainer's client count can link straight here.
  const view = listUrlState({ trainer: null, status: ["", ...CLIENT_STATUSES] });
  const q = $derived(view.q);
  const trainerId = $derived(view.params.trainer);
  const status = $derived(view.params.status as ClientStatus | "");

  const trainers = $derived(trainersOf(rows ?? []));
  const shown = $derived(filterClients(rows ?? [], { q, trainerId, status }));
  // Paged in the browser: the directory is one read, and `?demo` swaps in sample rows.
  const paged = $derived(pageOf(shown, view.page, view.limit));
  const summary = $derived.by(() => {
    if (rows == null) return "Every trainer's clients, read-only";
    const n = rows.length;
    const t = trainers.length;
    return `Every trainer's clients, read-only · ${n} ${n === 1 ? "client" : "clients"} across ${t} ${t === 1 ? "trainer" : "trainers"}`;
  });
</script>

<svelte:head><title>All clients · Program Tracker</title></svelte:head>

{#if demo && apiMode === "live"}
  <Note tone="warn" class="sample-note">
    Sample data — none of these clients are real.
    <Button small variant="ghost" href={page.url.pathname}>Back to real data</Button>
  </Note>
{/if}

<PageHead title="All clients" sub={summary} />

{#if loadError}
  <Note tone="bad">
    Couldn't load clients — {loadError}.
    <Button small onclick={() => load(useSample)}>Try again</Button>
  </Note>
{:else if rows === null}
  <SkeletonPanel rows={6} label="Loading clients…" />
{:else if rows.length === 0}
  <section class="panel"><EmptyState>No clients yet — trainers' clients show up here once they add them.</EmptyState></section>
{:else}
  {#snippet toolbarFilters()}
    <select class="select" aria-label="Trainer" value={trainerId} onchange={(e) => view.set({ trainer: e.currentTarget.value })}>
      <option value="">All trainers</option>
      {#each trainers as t (t.id)}
        <option value={t.id}>{t.name}{t.access === "disabled" ? " (disabled)" : ""}</option>
      {/each}
    </select>
    <select class="select" aria-label="Status" value={status} onchange={(e) => view.set({ status: e.currentTarget.value as ClientStatus | "" })}>
      <option value="">Any status</option>
      {#each CLIENT_STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
    </select>
  {/snippet}
  <ListToolbar
    bind:value={view.search}
    label="Search client or trainer"
    count={view.filtering ? `${shown.length} of ${rows.length}` : undefined}
    filters={toolbarFilters}
  />

  {#if shown.length === 0}
    <section class="panel">
      <EmptyState>
        No clients match these filters.
        {#snippet actions()}<Button onclick={() => view.clear()}>Clear filters</Button>{/snippet}
      </EmptyState>
    </section>
  {:else}
    <section class="panel">
      <table class="sheet roster">
        <thead>
          <tr><th>Client</th><th>Trainer</th><th>Status</th><th>Programme</th><th>Client since</th><th>Last session</th></tr>
        </thead>
        <tbody>
          {#each paged.items as c (c.id)}
            {@const last = lastSessionLabel(c.lastSessionAt, today)}
            <tr class:dim={c.status !== "active"}>
              <td>
                <div class="who"><Avatar name={c.name} /><a class="name" href={hrefOf(c.id)}>{c.name}</a></div>
              </td>
              <td class="trainer" class:off={c.trainer.access === "disabled"}>
                <span class="m-label">Trainer</span>
                <span class="trainer-val">
                  <span>{c.trainer.name}</span>
                  {#if c.trainer.access === "disabled"}<Pill tone="bad">Disabled</Pill>{/if}
                </span>
              </td>
              <td><span class="m-label">Status</span><StatusPill status={c.status} /></td>
              <td class="prog">
                <span class="m-label">Programme</span>
                {#if c.programme}
                  <span class="prog-val">
                    <span class="prog-name" title={c.programme.name}>{c.programme.name}</span>
                    <span class="prog-week tnum" class:over={c.programme.over}>{programmeLabel(c.programme)}</span>
                  </span>
                {:else}<span class="subtle">—</span>{/if}
              </td>
              <td class="tnum"><span class="m-label">Client since</span>{shortDay(c.clientSince, today)}</td>
              <td class="tnum last {last.tone}">
                <span class="m-label">Last session</span>
                <span title={c.lastSessionAt ?? "No session logged"}>{last.text}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <Pager
        page={paged.page}
        limit={paged.limit}
        total={paged.total}
        noun="Clients"
        onpage={(p) => view.setPage(p)}
        onlimit={(l) => view.setLimit(l)}
      />
    </section>
  {/if}
{/if}

<style>
  :global(.note.sample-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
  :global(.list-toolbar) .select { width: auto; }
  .who { display: flex; align-items: center; gap: 10px; }
  .who :global(.avatar) { width: 24px; height: 24px; font-size: 10px; flex: none; }
  .name { font-weight: 600; color: var(--ink); white-space: nowrap; }
  .name:hover { color: var(--blue); text-decoration: underline; }
  .roster tr.dim td, .roster tr.dim .name { color: var(--muted); }
  .prog { min-width: 160px; }
  .prog-val { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 260px; }
  /* Long programme names stop at two lines; the full name is on hover. */
  .prog-name { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .prog-week { color: var(--muted); font-size: 12px; }
  .prog-week.over { color: var(--warn); }
  .trainer-val { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .trainer.off { color: var(--muted); }
  .tnum { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .last.none { color: var(--muted); }
  .last.dormant { color: var(--warn); }
  .m-label { display: none; }
  /* Sized to the room beside the sidebar, not the window: the six columns
     need ~700px, which the sidebar takes away long before a phone width. */
  @container main (max-width: 760px) {
    :global(.list-toolbar) .select { flex: 1; }
    .roster thead { display: none; }
    .roster, .roster tbody, .roster tr, .roster td { display: block; width: 100%; }
    .roster tr { padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .roster tr:last-child { border-bottom: none; }
    .roster td { padding: 2px 0; border: none; white-space: normal; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .roster td:first-child { margin-bottom: 4px; align-items: center; }
    .roster td > :not(.m-label) { min-width: 0; }
    .prog-val { max-width: none; }
    .m-label { display: inline; flex: none; width: 96px; color: var(--muted); font-size: 12px; }
  }
</style>
