<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { CLIENT_STATUSES, type ClientStatus } from "@pt/shared";
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
  const params = $derived(page.url.searchParams);
  const q = $derived(params.get("q") ?? "");
  const trainerId = $derived(params.get("trainer") ?? "");
  const status = $derived((CLIENT_STATUSES as readonly string[]).includes(params.get("status") ?? "") ? (params.get("status") as ClientStatus) : "");
  const filtering = $derived(q.trim() !== "" || trainerId !== "" || status !== "");

  function setParam(key: string, value: string) {
    const url = new URL(page.url);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    goto(url, { replaceState: true, keepFocus: true, noScroll: true });
  }
  function clearFilters() {
    const url = new URL(page.url);
    for (const k of ["q", "trainer", "status"]) url.searchParams.delete(k);
    goto(url, { replaceState: true, keepFocus: true, noScroll: true });
  }

  const trainers = $derived(trainersOf(rows ?? []));
  const shown = $derived(filterClients(rows ?? [], { q, trainerId, status }));
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
  <SkeletonPanel height={60} />
{:else if rows.length === 0}
  <section class="panel"><EmptyState>No clients yet — trainers' clients show up here once they add them.</EmptyState></section>
{:else}
  <div class="filters" role="search">
    <input
      class="input search"
      type="search"
      placeholder="Search client or trainer"
      aria-label="Search client or trainer"
      value={q}
      oninput={(e) => setParam("q", e.currentTarget.value)}
    />
    <select class="select" aria-label="Trainer" value={trainerId} onchange={(e) => setParam("trainer", e.currentTarget.value)}>
      <option value="">All trainers</option>
      {#each trainers as t (t.id)}
        <option value={t.id}>{t.name}{t.access === "disabled" ? " (disabled)" : ""}</option>
      {/each}
    </select>
    <select class="select" aria-label="Status" value={status} onchange={(e) => setParam("status", e.currentTarget.value)}>
      <option value="">Any status</option>
      {#each CLIENT_STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
    </select>
    {#if filtering}
      <span class="subtle count" role="status">{shown.length} of {rows.length}</span>
    {/if}
  </div>

  {#if shown.length === 0}
    <section class="panel">
      <EmptyState>
        No clients match these filters.
        {#snippet actions()}<Button onclick={clearFilters}>Clear filters</Button>{/snippet}
      </EmptyState>
    </section>
  {:else}
    <section class="panel">
      <table class="sheet roster">
        <thead>
          <tr><th>Client</th><th>Trainer</th><th>Status</th><th>Programme</th><th>Client since</th><th>Last session</th></tr>
        </thead>
        <tbody>
          {#each shown as c (c.id)}
            {@const last = lastSessionLabel(c.lastSessionAt, today)}
            <tr class:dim={c.status !== "active"}>
              <td>
                <div class="who"><Avatar name={c.name} /><a class="name" href={hrefOf(c.id)}>{c.name}</a></div>
              </td>
              <td class="trainer" class:off={c.trainer.access === "disabled"}>
                <span class="m-label">Trainer</span>
                {c.trainer.name}
                {#if c.trainer.access === "disabled"}<Pill tone="bad">Disabled</Pill>{/if}
              </td>
              <td><span class="m-label">Status</span><StatusPill status={c.status} /></td>
              <td class="prog">
                <span class="m-label">Programme</span>
                {#if c.programme}
                  <span class="prog-name">{c.programme.name}</span>
                  <span class="prog-week tnum" class:over={c.programme.over}>{programmeLabel(c.programme)}</span>
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
    </section>
  {/if}
{/if}

<style>
  :global(.note.sample-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
  .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .search { width: 260px; max-width: 100%; }
  .filters .select { width: auto; }
  .count { margin-left: 4px; }
  .who { display: flex; align-items: center; gap: 10px; }
  .who :global(.avatar) { width: 24px; height: 24px; font-size: 10px; flex: none; }
  .name { font-weight: 600; color: var(--ink); }
  .name:hover { color: var(--blue); text-decoration: underline; }
  .roster tr.dim td, .roster tr.dim .name { color: var(--muted); }
  .prog-name { margin-right: 6px; }
  .prog-week { color: var(--muted); font-size: 12px; }
  .prog-week.over { color: var(--warn); }
  .trainer { white-space: nowrap; }
  .trainer.off { color: var(--muted); }
  .tnum { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .last.none { color: var(--muted); }
  .last.dormant { color: var(--warn); }
  .m-label { display: none; }
  @media (max-width: 700px) {
    .search { width: 100%; }
    .filters .select { flex: 1; }
    .roster thead { display: none; }
    .roster, .roster tbody, .roster tr, .roster td { display: block; width: 100%; }
    .roster tr { padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .roster tr:last-child { border-bottom: none; }
    .roster td { padding: 2px 0; border: none; white-space: normal; display: flex; align-items: center; gap: 8px; }
    .roster td:first-child { margin-bottom: 4px; }
    .m-label { display: inline; min-width: 96px; color: var(--muted); font-size: 12px; }
  }
</style>
