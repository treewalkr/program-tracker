<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ClientDto, ProviderDto, SignalDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[] | null>(null);
  let loadFailed = $state(false);
  let currentNames = $state<Record<string, string>>({});
  let signals = $state<SignalDto[]>([]);

  interface WeekEntry {
    day: number; // 1=Mon … 7=Sun
    clientId: string;
    sessionName: string;
    status: "logged" | "due" | "today" | "upcoming";
  }
  interface ClientRow {
    client: ClientDto;
    program: string | null;
    entries: Map<number, WeekEntry>;
  }
  let rows = $state<ClientRow[]>([]);

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1; // 1=Mon … 7=Sun
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);
  const monday = new Date();
  monday.setDate(monday.getDate() - (isoDay(monday) - 1));
  const dayNumbers = DAY_LABELS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d.getDate();
  });
  const todayNum = isoDay(new Date());

  const loggedCount = $derived(rows.flatMap((r) => [...r.entries.values()]).filter((e) => e.status === "logged").length);
  const plannedCount = $derived(rows.flatMap((r) => [...r.entries.values()]).length);
  const trainingClients = $derived(rows.filter((r) => r.program).length);
  const dueToday = $derived(rows.flatMap((r) => [...r.entries.values()]).filter((e) => e.status === "today").length);

  const shortName = (sessionName: string) => sessionName.split("—")[0].trim() || "Session";

  onMount(async () => {
    try {
      const [cs, ps, sigs] = await Promise.all([api.clients(), api.providers(), api.notifications()]);
      clients = cs;
      providers = ps;
      signals = sigs.filter((s) => s.clientId);
      const today = isoDay(new Date());
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
              status: loggedDates.has(ds) ? "logged" : ds === todayStr ? "today" : d < today ? "due" : "upcoming",
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

<div class="page-head">
  <div>
    <h1>This week</h1>
    <p class="sub">
      Week of Mon {dayNumbers[0]}–Sun {dayNumbers[6]} · {trainingClients} clients training · {loggedCount} of {plannedCount} logged{#if dueToday} · {dueToday} due today{/if}
    </p>
  </div>
  <div class="head-actions">
    <a class="btn" href="/clients">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add client
    </a>
  </div>
</div>

{#if clients === null}
  <div class="panel"><div class="panel-body"><div class="skeleton" style="height:80px"></div></div></div>
{:else}
  <div class="grid-2">
    <div class="col">
      {#if signals.length > 0}
        <section class="panel">
          <div class="panel-head">
            <h2>Needs review</h2>
            <span class="counter">{signals.length} signals</span>
          </div>
          <div class="signal-list">
            {#each signals as signal (signal.id)}
              {@const client = clients?.find((c) => c.id === signal.clientId)}
              {#if client}
                <div class="signal">
                  <span class="lamp {signal.severity === 'urgent' ? 'red' : signal.severity === 'attention' ? 'amber' : 'green'}" aria-hidden="true"></span>
                  <div class="body">
                    <strong>{signal.title} — <a class="client-link" href={`/clients/${client.id}`}>{client.name}</a></strong>
                    <p class="evi">{signal.evidence}</p>
                  </div>
                  <div class="act">
                    {#if signal.prefillNote}
                      <a
                        class="btn primary small"
                        href={`/clients/${client.id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" /></svg>Draft next block
                      </a>
                    {:else if signal.altHref}
                      <a class="btn small" href={signal.altHref}>{signal.altLabel}</a>
                    {/if}
                    <a class="btn ghost small" href={`/clients/${client.id}`}>Open client</a>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </section>
      {/if}

      <section class="panel" style="margin-top:16px">
        <div class="panel-head">
          <h2>Training week</h2>
          <span class="counter">{loggedCount} of {plannedCount} logged</span>
        </div>
        <div class="week-wrap">
          <div class="week-grid">
            <div class="wk-h corner">Client</div>
            {#each DAY_LABELS as label, i (label)}
              <div class="wk-h" class:dim={dayNumbers[i] !== todayNum && dayNumbers[i] < todayNum}>
                {label}<span class="d">{dayNumbers[i]}</span>
              </div>
            {/each}

            {#each rows as row (row.client.id)}
              <div class="wk-row">
                <div class="wk-client">
                  <a href={`/clients/${row.client.id}`}>{row.client.name}</a>
                  <span class="meta">
                    {#if row.program}{row.client.daysPerWeek ?? "—"} d/wk · {currentNames[row.client.id]}{:else}{row.client.status === "active" ? "no program" : row.client.status}{/if}
                  </span>
                </div>
                {#if row.entries.size === 0}
                  <div class="wk-cell span">
                    <span class="pill neutral">{row.client.status === "active" ? "no program" : row.client.status}</span>
                  </div>
                {:else}
                  {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}
                    {@const e = row.entries.get(d)}
                    <div class="wk-cell">
                      {#if e}
                        {@const cls = e.status === "logged" ? "done" : e.status === "today" ? "today" : e.status === "due" ? "missed" : "next"}
                        <a
                          class="cell {cls}"
                          href={e.status === "logged" ? `/clients/${row.client.id}` : `/clients/${row.client.id}/log`}
                          title={`${row.client.name} — ${e.sessionName}`}
                        >
                          <span class="tag">{shortName(e.sessionName)}{#if e.status === "logged"} ✓{:else if e.status === "today"} · due{:else if e.status === "due"} · missed{/if}</span>
                        </a>
                      {:else}
                        <span class="offday">—</span>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </section>
    </div>

    <div class="col">
      <section class="panel">
        <div class="panel-head">
          <h2>Clients</h2>
          <span class="counter">{clients.length}</span>
          {#if loadFailed}<span class="subtle err-inline">couldn't load — refresh to retry</span>{/if}
          <a class="act" href="/clients">All clients</a>
        </div>
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
      </section>

      <section class="panel" style="margin-top:16px">
        <div class="panel-head">
          <h2>AI providers</h2>
          <span class="counter">{(providers ?? []).filter((p) => p.configured).length} ready</span>
          <span class="subtle act">{apiMode === "mock" ? "demo registry" : "live registry"}</span>
        </div>
        <div class="panel-body provs-row">
          {#each providers ?? [] as p (p.id)}
            <span class="prov-chip">
              <strong>{p.label}</strong>
              {#if p.configured}<span class="pill good">ready</span>{:else}<span class="pill neutral">no key</span>{/if}
            </span>
          {/each}
        </div>
      </section>
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
  .signal-list { display: flex; flex-direction: column; }
  .signal .act { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .client-link { color: inherit; }
  .client-link:hover { color: var(--blue); }

  /* training week as a contributions-style grid */
  .week-wrap { overflow-x: auto; padding: 12px 16px; }
  .week-grid {
    display: grid;
    grid-template-columns: 104px repeat(7, minmax(52px, 1fr));
    min-width: 480px;
  }
  .wk-h {
    font: 500 12px/1.4 var(--font-ui);
    color: var(--muted);
    padding: 8px 4px;
    text-align: center;
  }
  .wk-h .d { display: block; font: 400 11px/1.6 var(--font-ui); color: var(--faint); }
  .wk-h.dim { color: var(--faint); }
  .wk-h.corner { text-align: left; padding-left: 12px; }
  .wk-row { display: contents; }
  .wk-client { padding: 8px 4px 8px 12px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .wk-client a { color: var(--ink); font-weight: 600; }
  .wk-client .meta {
    font: 400 11px/1.4 var(--font-ui);
    color: var(--faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wk-cell { padding: 5px 4px; display: flex; justify-content: center; }
  .wk-cell.span { grid-column: 2 / -1; justify-content: flex-start; }
  .cell {
    width: 100%;
    max-width: 70px;
    min-height: 34px;
    border-radius: 4px;
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    text-decoration: none;
  }
  .cell:hover { text-decoration: none; filter: brightness(1.05); }
  .cell .tag {
    font: 500 10px/1.2 var(--font-mono);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-align: center;
  }
  .cell.done { background: var(--done-4); border-color: var(--done-4); }
  .cell.done .tag { color: #fff; }
  .cell.today { border-color: var(--blue); border-width: 2px; background: var(--pulse-now-bg); }
  .cell.today .tag { color: var(--blue); }
  .cell.missed { background: var(--bad-bg); border-color: var(--bad-line); }
  .cell.missed .tag { color: var(--bad); }
  .cell.next { background: var(--well); }
  .cell.next .tag { color: var(--muted); }
  .offday { align-self: center; color: #c1c8d0; font-size: 11px; }

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
    .signal .act { justify-content: flex-start; }
  }
</style>
