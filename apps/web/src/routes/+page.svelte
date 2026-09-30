<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ClientDto, ProviderDto, SignalDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import { goto } from "$app/navigation";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[] | null>(null);
  let loadFailed = $state(false);
  let currentNames = $state<Record<string, string>>({});
  let signals = $state<SignalDto[]>([]);

  interface WeekEntry {
    day: number; // 1=Mon … 7=Sun
    clientId: string;
    clientName: string;
    sessionName: string;
    status: "logged" | "due" | "today" | "upcoming";
  }
  let week = $state<WeekEntry[]>([]);

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1; // 1=Mon … 7=Sun
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);

  onMount(async () => {
    try {
      const [cs, ps, sigs] = await Promise.all([api.clients(), api.providers(), api.notifications()]);
      clients = cs;
      providers = ps;
      signals = sigs.filter((s) => s.clientId);
      const monday = new Date();
      monday.setDate(monday.getDate() - (isoDay(monday) - 1));
      const today = isoDay(new Date());
      const todayStr = dateStr(new Date());
      const entries: WeekEntry[] = [];
      for (const c of cs) {
        const detail = await api.client(c.id);
        currentNames[c.id] = detail.currentProgram?.name ?? "—";
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
            entries.push({
              day: d,
              clientId: c.id,
              clientName: c.name,
              sessionName: session?.name ?? "Session",
              status: loggedDates.has(ds) ? "logged" : ds === todayStr ? "today" : d < today ? "due" : "upcoming",
            });
          }
        }
      }
      week = entries.sort((a, b) => a.day - b.day || a.clientName.localeCompare(b.clientName));
    } catch (err) {
      console.error(err);
      loadFailed = true;
    }
  });
</script>

<svelte:head><title>Overview · Program Tracker</title></svelte:head>

<div class="page-head">
  <div>
    <h1>Overview</h1>
    <p class="sub">{new Date().toLocaleDateString(undefined, { weekday: "long" })} · {(clients?.length ?? 0)} clients{#if signals.length > 0} · {signals.length} need{/if}</p>
  </div>
  <a class="btn" href="/clients">All clients</a>
</div>

{#if clients === null}
  <div class="panel"><div class="panel-body"><div class="skeleton" style="height:80px"></div></div></div>
{:else}
  {#if week.length > 0}
    <section class="panel week-panel">
      <div class="panel-head">
        <h2>This week</h2>
        <span class="subtle">planned sessions — logged on the day they happened</span>
      </div>
      <div class="week-grid">
        {#each DAY_LABELS as label, i (label)}
          {@const dayEntries = week.filter((w) => w.day === i + 1)}
          <div class="week-day" class:today={isoDay(new Date()) === i + 1} class:empty={dayEntries.length === 0}>
            <div class="week-day-label">{label}</div>
            {#each dayEntries as w (w.clientId + w.day)}
              <a
                class="week-entry {w.status}"
                href={w.status === "logged" ? `/clients/${w.clientId}` : `/clients/${w.clientId}/log`}
                title={`${w.clientName} — ${w.sessionName}`}
              >
                <span class="week-client">{w.clientName.split(" ")[0]}</span>
                <span class="week-session">{w.sessionName}</span>
                <span class="week-mark" aria-hidden="true">{w.status === "logged" ? "✓" : w.status === "due" ? "·" : ""}</span>
              </a>
            {/each}
          </div>
        {/each}
      </div>
    </section>
  {/if}
  {#if signals.length > 0}
    <section class="panel needs-review">
      <div class="panel-head">
        <h2>Needs review</h2>
        <span class="subtle">periodization signals — computed from logs, you decide</span>
      </div>
      <div class="sig-list">
        {#each signals as signal (signal.id)}
          {@const client = clients?.find((c) => c.id === signal.clientId)}
          {#if client}
            <div class="sig" class:urgent={signal.severity === "urgent"} class:attention={signal.severity === "attention"}>
              <div class="sig-body">
                <div class="sig-top">
                  <span class="sev-dot"></span>
                  <strong>{signal.title}</strong>
                  <a class="client-link" href={`/clients/${client.id}`}>{client.name}</a>
                </div>
                <p class="evidence">{signal.evidence}</p>
              </div>
              <div class="sig-actions">
                {#if signal.prefillNote}
                  <a
                    class="btn small"
                    href={`/clients/${client.id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
                  >
                    ✦ Draft next block
                  </a>
                {:else if signal.altHref}
                  <a class="btn ghost small" href={signal.altHref}>{signal.altLabel}</a>
                {/if}
                <a class="btn ghost small" href={`/clients/${client.id}`}>Open client</a>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}

  <section class="panel" style="margin-top:{signals.length ? 18 : 0}px">
    <div class="panel-head">
      <h2>Clients</h2>
      {#if loadFailed}<span class="subtle err-inline">couldn't load — refresh to retry</span>{/if}
      <span class="subtle">{clients.filter((c) => c.status === "active").length} active</span>
    </div>
    <table class="sheet">
      <thead>
        <tr>
          <th>Client</th>
          <th>Status</th>
          <th>Days</th>
          <th>Current program</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each clients as c (c.id)}
          <tr class="rowlink">
            <td>
              <a class="rowlink-name" href={`/clients/${c.id}`}><strong>{c.name}</strong></a>
              {#if c.limitations}<span class="pill bad" style="margin-left:8px">limitations</span>{/if}
            </td>
            <td><StatusPill status={c.status} /></td>
            <td class="num">{c.daysPerWeek ?? "—"}/wk</td>
            <td>{currentNames[c.id] ?? "…"}</td>
            <td class="subtle">→</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="panel" style="margin-top:18px">
    <div class="panel-head">
      <h2>AI providers</h2>
      <span class="subtle">{apiMode === "mock" ? "demo registry" : "live registry"}</span>
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
{/if}

<style>
  .sig-list { display: flex; flex-direction: column; }
  .sig {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .sig:last-child { border-bottom: none; }
  .sig.urgent .sev-dot { background: var(--bad); }
  .sig.attention .sev-dot { background: var(--warn); }
  .sev-dot { width: 9px; height: 9px; border-radius: 99px; background: var(--good); flex-shrink: 0; }
  .sig-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .client-link { font-size: 12.5px; color: var(--faint); }
  .client-link:hover { color: var(--ink); }
  .evidence { margin: 3px 0 0 18px; font-size: 13px; color: var(--muted); }
  .sig-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn.small { padding: 4px 10px; font-size: 13px; }

  .week-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }
  .week-day {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 8px;
    min-height: 92px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .week-day.today { border-color: var(--ink); border-width: 2px; }
  .week-day.empty { opacity: 0.55; }
  .week-day-label {
    font: 700 11.5px var(--font-cond);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .week-entry {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 7px;
    text-decoration: none;
    color: var(--ink);
    position: relative;
  }
  .week-entry:hover { border-color: var(--ink); }
  .week-entry.due { border-color: #e5c99a; background: var(--warn-bg); }
  .week-client { font-weight: 700; font-size: 13px; }
  .week-session { font-size: 11.5px; color: var(--muted); }
  .week-mark { position: absolute; top: 4px; right: 7px; color: var(--good); font-weight: 700; }
  .week-entry.due .week-mark { color: var(--warn); }

  @media (max-width: 980px) {
    .week-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .provs-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .prov-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 13.5px;
  }
  .err-inline { color: var(--bad); font-weight: 600; margin-left: auto; }
</style>
