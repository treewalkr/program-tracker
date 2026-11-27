<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import { reasonText } from "$lib/api/errors";
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
  import CopyButton from "$lib/components/CopyButton.svelte";
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
  import Segmented from "$lib/ui/Segmented.svelte";
  import {
    clientLogRows,
    filterCounts,
    generateWeekHref,
    reviewRows,
    rowSignalCount,
    rowSignalIds,
    reviewSignals,
    showFilter,
    type ReviewFilter,
  } from "$lib/needsReview";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[]>([]);
  let loadError = $state<string | null>(null);
  let currentNames = $state<Record<string, string>>({});
  /** Each client's portal access link: a string when it's on, null when it's off. */
  let portals = $state<Record<string, string | null>>({});
  let signals = $state<SignalDto[]>([]);
  /** Signal ids hidden on this visit (snoozed; the next load leaves them out). */
  let hidden = $state<string[]>([]);
  /** Row key → why its snooze failed; `hiding` is the row key in flight. */
  let hideErrors = $state<Record<string, string>>({});
  let hiding = $state<string | null>(null);
  let strips = $state<ClientStrip[]>([]);
  let rowsReady = $state(false);

  const now = new Date();
  const weeks = stripWeeks(now);
  const weekDates = weeks[weeks.length - 1];
  const today = localIso(now);

  const openSignals = $derived(signals.filter((s) => !hidden.includes(s.id)));
  /** Needs review: All / Check in / Plan ahead, not remembered. */
  let reviewFilter = $state<ReviewFilter>("all");
  const review = $derived(reviewSignals(openSignals));
  const reviewCounts = $derived(filterCounts(review));
  const rows = $derived(reviewRows(review, reviewFilter));
  /** Sessions clients logged themselves this week, one row per client. */
  const clientLogs = $derived(clientLogRows(openSignals));
  const listedCount = $derived(rowSignalCount(rows));
  const clientName = (id: string | null) => clients?.find((c) => c.id === id)?.name ?? null;
  const tally = $derived(weekTally(strips));
  const trainingClients = $derived(strips.filter((s) => s.program).length);
  /** Says what the head line doesn't: which days need the trainer now, counted like the cells. */
  const weekCount = $derived(weekCounter(strips, today));
  const providersDown = $derived(providers.filter((p) => !p.configured));
  const headLine = $derived(
    [
      weekRangeLabel(weekDates),
      `${plural(trainingClients, "member")} training`,
      `${tally.logged} of ${tally.planned} logged`,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  async function load() {
    loadError = null;
    try {
      // One call for every member's program, logs and portal link; the strips are still built here, on local "today".
      const [overview, ps, sigs] = await Promise.all([api.clientsOverview(), api.providers(), api.notifications()]);
      // Archived members are off Overview (the API leaves them out); Settings and the Members list still reach them.
      const cs = overview.map((r) => r.client);
      const shown = new Set(cs.map((c) => c.id));
      clients = cs;
      providers = ps;
      signals = sigs.filter((s) => s.clientId && shown.has(s.clientId));
      const built = overview.map((row) => {
        currentNames[row.client.id] = row.currentProgram?.name ?? "—";
        portals[row.client.id] = row.portalLink;
        return buildClientStrip(row.client, row.currentProgram, row.logs, weeks, today);
      });
      strips = exceptionOrder(built);
      rowsReady = true;
    } catch (err) {
      console.error(err);
      loadError = reasonText(err);
    }
  }

  /** Snooze every signal behind one row for `days`, then drop the row. */
  async function hide(key: string, ids: string[], days: number) {
    hiding = key;
    hideErrors[key] = "";
    const until = new Date(Date.now() + days * 86400_000).toISOString();
    const results = await Promise.allSettled(ids.map((id) => api.snoozeSignal(id, until)));
    // Keep what did snooze hidden; a merged row stays while any of its signals failed.
    hidden = [...hidden, ...ids.filter((_, i) => results[i].status === "fulfilled")];
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) hideErrors[key] = reasonText(failed.reason);
    hiding = null;
  }

  onMount(load);
</script>

<svelte:head><title>Overview · Program Tracker</title></svelte:head>

<PageHead title="This week" sub={rowsReady && clients?.length ? headLine : weekRangeLabel(weekDates)}>
  {#snippet actions()}
    <Button href="/clients/new">
      {#snippet icon()}<Icon name="plus" />{/snippet}
      Add member
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
    <div class="col">
      <SkeletonPanel title="Needs review" rows={3} />
      <SkeletonPanel title="Member logs" rows={2} />
    </div>
    <div class="col"><SkeletonPanel title="Members" count rows={4} /></div>
  </div>
{:else if clients.length === 0}
  <section class="panel">
    <EmptyState>
      No members yet. Add one and their training week shows up here — sessions, logs and anything that needs review.
      {#snippet actions()}
        <Button variant="primary" href="/clients/new">
          {#snippet icon()}<Icon name="plus" />{/snippet}
          Add your first member
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
      <Panel title="Needs review" count={listedCount ? plural(listedCount, "signal") : undefined}>
        {#snippet act()}
          {#if showFilter(reviewCounts)}
            <Segmented
              label="Show signals"
              value={reviewFilter}
              onchange={(v) => (reviewFilter = v)}
              items={[
                { value: "all", label: `All ${reviewCounts.all}` },
                { value: "check", label: `Check in ${reviewCounts.check}`, title: "Members to check in with: pain, readiness, adherence, fatigue" },
                { value: "plan", label: `Plan ahead ${reviewCounts.plan}`, title: "Weeks and blocks to draft ahead" },
              ]}
            />
          {/if}
        {/snippet}
        {#if rows.length === 0}
          <p class="clear">Nothing needs review right now.</p>
        {:else}
          <div class="signal-list">
            {#each rows as row (row.key)}
              {@const error = hideErrors[row.key] ? `Couldn't hide — ${hideErrors[row.key]}` : undefined}
              {#snippet hideButton()}
                <Button variant="ghost" small disabled={hiding === row.key} onclick={() => hide(row.key, rowSignalIds(row), 7)}>
                  {hiding === row.key ? "Hiding…" : "Hide 1 wk"}
                </Button>
              {/snippet}
              {#if row.type === "weeks"}
                <SignalRow severity="info" title={row.title} {error}>
                  {#snippet body()}
                    <ul class="week-links">
                      {#each row.signals as w (w.id)}
                        <li><a href={generateWeekHref(w)}>{clientName(w.clientId) ?? "Member"} · wk {w.targetWeek}</a></li>
                      {/each}
                    </ul>
                  {/snippet}
                  {#snippet actions()}{@render hideButton()}{/snippet}
                </SignalRow>
              {:else}
                {@const signal = row.signal}
                {@const name = clientName(signal.clientId)}
                {#if name}
                  {@const clientHref = `/clients/${signal.clientId}`}
                  {@const lead = signal.severity === "info" ? "default" : "primary"}
                  <SignalRow severity={signal.severity} evidence={signal.evidence} {error}>
                    {#snippet title()}
                      {signal.title} — <a class="client-link" href={clientHref}>{name}</a>
                    {/snippet}
                    {#snippet actions()}
                      {#if signal.targetWeek}
                        <Button variant={lead} small href={generateWeekHref(signal)}>
                          {#snippet icon()}<Icon name="sparkle" />{/snippet}
                          Generate week {signal.targetWeek}
                        </Button>
                      {:else if signal.prefillNote}
                        <Button
                          variant={lead}
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
                        <Button variant="ghost" small href={clientHref}>Open member</Button>
                      {/if}
                      {@render hideButton()}
                    {/snippet}
                  </SignalRow>
                {/if}
              {/if}
            {/each}
          </div>
        {/if}
      </Panel>

      <Panel title="Member logs" count={clientLogs.length ? plural(clientLogs.length, "member") : undefined}>
        {#if clientLogs.length === 0}
          <p class="clear">No member logs this week.</p>
        {:else}
          <div class="signal-list">
            {#each clientLogs as signal (signal.id)}
              {@const name = clientName(signal.clientId)}
              {#if name}
                <SignalRow
                  severity="info"
                  evidence={signal.evidence}
                  error={hideErrors[signal.id] ? `Couldn't mark seen — ${hideErrors[signal.id]}` : undefined}
                >
                  {#snippet title()}
                    <a class="client-link" href={`/clients/${signal.clientId}`}>{name}</a> {signal.title.replace(/^Logged /, "logged ")}
                  {/snippet}
                  {#snippet actions()}
                    <Button variant="ghost" small disabled={hiding === signal.id} onclick={() => hide(signal.id, [signal.id], 365)}>
                      {hiding === signal.id ? "Saving…" : "Seen"}
                    </Button>
                  {/snippet}
                </SignalRow>
              {/if}
            {/each}
          </div>
        {/if}
      </Panel>
    </div>

    <div class="col">
      <Panel title="Members" count={clients.length}>
        {#snippet act()}
          <a class="act" href="/clients">All members</a>
        {/snippet}
        <div class="panel-body tight">
          <table class="sheet">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th class="r sess-col">Sessions</th>
                <th class="portal-col">Portal</th>
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
                  <td class="r sess-col">{c.sessionsPerWeek ?? "—"} / wk</td>
                  <td class="portal-col">
                    {#if portals[c.id]}
                      <CopyButton text={portals[c.id] ?? ""} label="Copy link" quiet ariaLabel={`Copy link for ${c.name}`} />
                    {:else if portals[c.id] === null}
                      <a class="portal-on" href={`/clients/${c.id}#settings`} aria-label={`Turn on the portal for ${c.name}`}>Turn on…</a>
                    {/if}
                  </td>
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
  .portal-col { text-align: right; white-space: nowrap; }
  td.portal-col { padding-right: 4px; }
  .portal-col :global(.copybtn) { justify-content: flex-end; }
  .portal-on {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    font: 400 13px/1 var(--font-ui);
    color: var(--blue);
    text-decoration: none;
  }
  .portal-on:hover { text-decoration: underline; text-underline-offset: 3px; }
  .portal-on:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
  .week-links { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; }
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
    /* Sessions repeats the week grid above; dropping it lets name + status + Portal fit a phone */
    .sess-col { display: none; }
    .signal-list :global(.signal .act) { justify-content: flex-start; }
  }
</style>
