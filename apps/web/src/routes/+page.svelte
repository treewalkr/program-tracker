<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ClientDto, ProviderDto, SignalDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import SignalRow from "$lib/components/SignalRow.svelte";
  import WeekGrid, { type ClientRow, type WeekEntry } from "$lib/components/WeekGrid.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[] | null>(null);
  let loadFailed = $state(false);
  let currentNames = $state<Record<string, string>>({});
  let signals = $state<SignalDto[]>([]);

  let rows = $state<ClientRow[]>([]);

  const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1; // 1=Mon … 7=Sun
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);
  const monday = new Date();
  monday.setDate(monday.getDate() - (isoDay(monday) - 1));
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return dateStr(d);
  });
  const dayNumbers = weekDates.map((iso) => Number(iso.slice(8, 10)));
  const today = dateStr(new Date());

  const loggedCount = $derived(rows.flatMap((r) => [...r.entries.values()]).filter((e) => e.status === "logged").length);
  const plannedCount = $derived(rows.flatMap((r) => [...r.entries.values()]).length);
  const trainingClients = $derived(rows.filter((r) => r.program).length);
  const dueToday = $derived(rows.flatMap((r) => [...r.entries.values()]).filter((e) => e.status === "today").length);

  onMount(async () => {
    try {
      const [cs, ps, sigs] = await Promise.all([api.clients(), api.providers(), api.notifications()]);
      clients = cs;
      providers = ps;
      signals = sigs.filter((s) => s.clientId);
      const todayDay = isoDay(new Date());
      const todayStr = dateStr(new Date());
      const built: ClientRow[] = [];
      for (const c of cs) {
        const detail = await api.client(c.id);
        const programName = detail.currentProgram?.name ?? null;
        currentNames[c.id] = programName ?? "—";
        const row: ClientRow = { client: c, program: programName, entries: new Map() };
        if (detail.currentProgram) {
          const logs = await api.sessionLogs(c.id);
          const loggedDates = new Set(logs.filter((l) => l.programId === detail.currentProgram!.id).map((l) => l.date.slice(0, 10)));
          const sessions = detail.currentProgram.sessions;
          let nth = 0;
          for (const d of (c.trainingDays ?? []).slice().sort((a, b) => a - b)) {
            const date = new Date(monday);
            date.setDate(date.getDate() + (d - 1));
            const ds = dateStr(date);
            const session = sessions[nth % Math.max(1, sessions.length)];
            nth++;
            row.entries.set(d, {
              day: d,
              clientId: c.id,
              sessionName: session?.name ?? "Session",
              status: loggedDates.has(ds) ? "logged" : ds === todayStr ? "today" : d < todayDay ? "due" : "upcoming",
            });
          }
        }
        built.push(row);
      }
      rows = built;
    } catch (err) {
      console.error(err);
      loadFailed = true;
    }
  });
</script>

<svelte:head><title>Overview · Program Tracker</title></svelte:head>

<PageHead
  title="This week"
  sub={`Week of Mon ${dayNumbers[0]}–Sun ${dayNumbers[6]} · ${trainingClients} clients training · ${loggedCount} of ${plannedCount} logged${dueToday ? ` · ${dueToday} due today` : ""}`}
>
  {#snippet actions()}
    <Button href="/clients">
      {#snippet icon()}<Icon name="plus" />{/snippet}
      Add client
    </Button>
  {/snippet}
</PageHead>

{#if clients === null}
  <SkeletonPanel height={80} />
{:else}
  <div class="grid-2">
    <div class="col">
      {#if signals.length > 0}
        <Panel title="Needs review" count={`${signals.length} signals`}>
          <div class="signal-list">
            {#each signals as signal (signal.id)}
              {@const client = clients?.find((c) => c.id === signal.clientId)}
              {#if client}
                <SignalRow severity={signal.severity} evidence={signal.evidence}>
                  {#snippet title()}
                    {signal.title} — <a class="client-link" href={`/clients/${client.id}`}>{client.name}</a>
                  {/snippet}
                  {#snippet actions()}
                    {#if signal.prefillNote}
                      <Button
                        variant="primary"
                        small
                        href={`/clients/${client.id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
                      >
                        {#snippet icon()}<Icon name="sparkle" />{/snippet}
                        Draft next block
                      </Button>
                    {:else if signal.altHref}
                      <Button small href={signal.altHref}>{signal.altLabel}</Button>
                    {/if}
                    <Button variant="ghost" small href={`/clients/${client.id}`}>Open client</Button>
                  {/snippet}
                </SignalRow>
              {/if}
            {/each}
          </div>
        </Panel>
      {/if}

      <div class="mt-16">
      <section class="panel">
        <div class="panel-head">
          <h2>Training week</h2>
          <span class="counter">{loggedCount} of {plannedCount} logged</span>
        </div>
        <WeekGrid {rows} {weekDates} {today} {currentNames} />
      </section>
      </div>
    </div>

    <div class="col">
      <Panel title="Clients" count={clients.length}>
        {#snippet act()}
          {#if loadFailed}<span class="subtle err-inline">couldn't load — refresh to retry</span>{/if}
          <a class="act" href="/clients">All clients</a>
        {/snippet}
        <div class="panel-body tight">
          <table class="sheet">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th class="r">Days</th>
              </tr>
            </thead>
            <tbody>
              {#each clients as c (c.id)}
                <tr class="rowlink">
                  <td>
                    <a class="rowlink-name" href={`/clients/${c.id}`}>{c.name}</a>
                    <div class="subtle">{currentNames[c.id] ?? "…"}</div>
                  </td>
                  <td><StatusPill status={c.status} /></td>
                  <td class="r">{c.daysPerWeek ?? "—"} / wk</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Panel>

      <div class="mt-16">
      <Panel
        title="AI providers"
        count={`${(providers ?? []).filter((p) => p.configured).length} ready`}
      >
        {#snippet act()}
          <span class="subtle act">{apiMode === "mock" ? "demo registry" : "live registry"}</span>
        {/snippet}
        <div class="panel-body provs-row">
          {#each providers ?? [] as p (p.id)}
            <span class="prov-chip">
              <strong>{p.label}</strong>
              {#if p.configured}<span class="pill good">ready</span>{:else}<span class="pill neutral">no key</span>{/if}
            </span>
          {/each}
        </div>
      </Panel>
      </div>
    </div>
  </div>
{/if}

<style>
  .grid-2 {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 16px;
    align-items: start;
  }
  .col { display: flex; flex-direction: column; min-width: 0; }
  .mt-16 { margin-top: 16px; }
  .signal-list { display: flex; flex-direction: column; }
  .signal-list :global(.signal .act) { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .client-link { color: inherit; }
  .client-link:hover { color: var(--blue); }

  .provs-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .prov-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 4px 12px;
    font-size: 13px;
  }
  .err-inline { color: var(--bad); font-weight: 500; }

  @media (max-width: 1060px) {
    .grid-2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .signal-list :global(.signal .act) { justify-content: flex-start; }
  }
</style>
