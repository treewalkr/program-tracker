<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ClientDto, ProviderDto, SignalDto } from "$lib/api/types";
  import {
    buildClientStrip,
    exceptionOrder,
    localIso,
    plural,
    stripWeeks,
    weekRangeLabel,
    weekCounter,
    weekTally,
    type ClientStrip,
  } from "$lib/overview";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import SignalRow from "$lib/components/SignalRow.svelte";
  import WeekBoard from "$lib/components/WeekBoard.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import WeekGridSkeleton from "$lib/components/WeekGridSkeleton.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Note from "$lib/ui/Note.svelte";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[]>([]);
  let loadError = $state<string | null>(null);
  let currentNames = $state<Record<string, string>>({});
  let signals = $state<SignalDto[]>([]);
  let strips = $state<ClientStrip[]>([]);
  let rowsReady = $state(false);

  const now = new Date();
  const weeks = stripWeeks(now);
  const weekDates = weeks[weeks.length - 1];
  const today = localIso(now);

  const tally = $derived(weekTally(strips));
  const trainingClients = $derived(strips.filter((s) => s.program).length);
  /** Says what the head line doesn't: which days need the trainer now, counted like the cells. */
  const weekCount = $derived(weekCounter(strips, today));
  const providersDown = $derived(providers.filter((p) => !p.configured));
  const headLine = $derived(
    [
      weekRangeLabel(weekDates),
      `${plural(trainingClients, "client")} training`,
      `${tally.logged} of ${tally.planned} logged`,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  async function load() {
    loadError = null;
    try {
      const [cs, ps, sigs] = await Promise.all([api.clients(), api.providers(), api.notifications()]);
      clients = cs;
      providers = ps;
      signals = sigs.filter((s) => s.clientId);
      // Per-client detail + logs in parallel — sequential calls scaled linearly with the roster.
      const built = await Promise.all(
        cs.map(async (c) => {
          const [detail, logs] = await Promise.all([api.client(c.id), api.sessionLogs(c.id)]);
          currentNames[c.id] = detail.currentProgram?.name ?? "—";
          return buildClientStrip(c, detail.currentProgram, logs, weeks, today);
        })
      );
      strips = exceptionOrder(built);
      rowsReady = true;
    } catch (err) {
      console.error(err);
      loadError = err instanceof Error ? err.message : "the server didn't answer";
    }
  }

  onMount(load);
</script>

<svelte:head><title>Overview · Program Tracker</title></svelte:head>

<PageHead title="This week" sub={rowsReady && clients?.length ? headLine : weekRangeLabel(weekDates)}>
  {#snippet actions()}
    <Button href="/clients/new">
      {#snippet icon()}<Icon name="plus" />{/snippet}
      Add client
    </Button>
  {/snippet}
</PageHead>

{#if clients === null && loadError}
  <Note tone="bad" role="alert" class="load-err">
    Couldn't load this week — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else if clients === null}
  <SkeletonPanel class="week-panel" title="Training week" count label="Loading this week…">
    <WeekGridSkeleton />
  </SkeletonPanel>
  <div class="grid-2">
    <div class="col"><SkeletonPanel title="Needs review" rows={3} /></div>
    <div class="col"><SkeletonPanel title="Clients" count rows={4} /></div>
  </div>
{:else if clients.length === 0}
  <section class="panel">
    <EmptyState>
      No clients yet. Add one and their training week shows up here — sessions, logs and anything that needs review.
      {#snippet actions()}
        <Button variant="primary" href="/clients/new">
          {#snippet icon()}<Icon name="plus" />{/snippet}
          Add your first client
        </Button>
      {/snippet}
    </EmptyState>
  </section>
{:else}
  <Panel class="week-panel" title="Training week" count={rowsReady ? weekCount : undefined}>
    {#if rowsReady}
      <WeekBoard {strips} {today} />
    {:else if loadError}
      <p class="clear err">Couldn't load sessions — {loadError}. <Button small onclick={load}>Try again</Button></p>
    {:else}
      <WeekGridSkeleton rows={Math.min(Math.max(clients.length, 1), 4)} />
    {/if}
  </Panel>
  <div class="grid-2">
    <div class="col">
      <Panel title="Needs review" count={signals.length ? plural(signals.length, "signal") : undefined}>
        {#if signals.length === 0}
          <p class="clear">Nothing needs review right now.</p>
        {:else}
          <div class="signal-list">
            {#each signals as signal (signal.id)}
              {@const client = clients.find((c) => c.id === signal.clientId)}
              {#if client}
                {@const clientHref = `/clients/${client.id}`}
                <SignalRow severity={signal.severity} evidence={signal.evidence}>
                  {#snippet title()}
                    {signal.title} — <a class="client-link" href={clientHref}>{client.name}</a>
                  {/snippet}
                  {#snippet actions()}
                    {#if signal.targetWeek}
                      <Button
                        variant="primary"
                        small
                        href={`${clientHref}/generate?week=${signal.targetWeek}${signal.prefillNote ? `&note=${encodeURIComponent(signal.prefillNote)}` : ""}`}
                      >
                        {#snippet icon()}<Icon name="sparkle" />{/snippet}
                        Generate week {signal.targetWeek}
                      </Button>
                    {:else if signal.prefillNote}
                      <Button
                        variant="primary"
                        small
                        href={`${clientHref}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
                      >
                        {#snippet icon()}<Icon name="sparkle" />{/snippet}
                        Draft next block
                      </Button>
                    {:else if signal.altHref}
                      <Button small href={signal.altHref}>{signal.altLabel}</Button>
                    {/if}
                    {#if signal.altHref !== clientHref || signal.targetWeek || signal.prefillNote}
                      <Button variant="ghost" small href={clientHref}>Open client</Button>
                    {/if}
                  {/snippet}
                </SignalRow>
              {/if}
            {/each}
          </div>
        {/if}
      </Panel>

    </div>

    <div class="col">
      <Panel title="Clients" count={clients.length}>
        {#snippet act()}
          <a class="act" href="/clients/new">All clients</a>
        {/snippet}
        <div class="panel-body tight">
          <table class="sheet">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th class="r">Sessions</th>
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
                  <td class="r">{c.sessionsPerWeek ?? "—"} / wk</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Panel>

      {#if providersDown.length > 0}
        <Panel title="AI providers" count={`${providersDown.length} without a key`}>
          {#snippet act()}
            <span class="subtle act">{apiMode === "mock" ? "demo registry" : "live registry"}</span>
          {/snippet}
          <div class="panel-body provs-row">
            {#each providers as p (p.id)}
              <span class="prov-chip">
                <strong>{p.label}</strong>
                {#if p.configured}<span class="pill good">ready</span>{:else}<span class="pill neutral">no key</span>{/if}
              </span>
            {/each}
          </div>
        </Panel>
      {/if}
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
  :global(.week-panel) { margin-bottom: 16px; }
  .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .clear { margin: 0; padding: 14px 16px; color: var(--muted); }
  .clear.err { color: var(--bad); }
  :global(.load-err) { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
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

  @media (max-width: 1060px) {
    .grid-2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .signal-list :global(.signal .act) { justify-content: flex-start; }
  }
</style>
