<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ClientDto, HistoryEntryDto, ProgramDto, SignalDto } from "$lib/api/types";
  import { blockPulse, weekOf, type WeekMetrics } from "$lib/metrics";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import SessionCard from "$lib/components/SessionCard.svelte";
  import SignalRow from "$lib/components/SignalRow.svelte";
  import WeekdayPicker from "$lib/components/WeekdayPicker.svelte";
  import DirChip from "$lib/components/DirChip.svelte";
  import PulseChart from "$lib/components/PulseChart.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let programs = $state<ProgramDto[] | null>(null);
  let historyEntries = $state<HistoryEntryDto[] | null>(null);
  let saving = $state(false);
  let form = $state({ goals: "", limitations: "", daysPerWeek: 3, trainingDays: [] as number[] });
  let signals = $state<SignalDto[]>([]);
  let pulse = $state<WeekMetrics[]>([]);
  let pulseWeek = $state(0);
  let loggedDates = $state<Set<string>>(new Set());
  let dismissedNow = $state<string[]>([]);
  let snoozing = $state<string | null>(null);
  let snoozeErrors = $state<Record<string, string>>({});
  let tab = $state<"program" | "pulse" | "history" | "settings">("program");

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayNum = isoDay(new Date());
  const sortedDays = $derived([...(client?.trainingDays ?? [])].sort((a, b) => a - b));

  function setTab(t: typeof tab) {
    tab = t;
    history.replaceState(null, "", `#${t}`);
  }

  async function snooze(signal: SignalDto) {
    snoozing = signal.id;
    snoozeErrors[signal.id] = "";
    try {
      await api.snoozeSignal(signal.id, new Date(Date.now() + 7 * 86400_000).toISOString());
      dismissedNow = [...dismissedNow, signal.id];
    } catch (err) {
      snoozeErrors[signal.id] = (err as Error).message || "Snooze failed — try again.";
    } finally {
      snoozing = null;
    }
  }

  const visibleSignals = $derived(signals.filter((s) => !dismissedNow.includes(s.id)));

  const fmtTonnage = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}t` : `${Math.round(t)}kg`);
  const doneWeeks = $derived(pulse.filter((w) => !w.plannedOnly && w.tonnage > 0));
  const maxTonnage = $derived(Math.max(...doneWeeks.map((w) => w.tonnage), 1));
  const heatLevel = (w: WeekMetrics) => (w.plannedOnly ? 0 : Math.max(1, Math.ceil((4 * w.tonnage) / maxTonnage)));
  const pulseSummary = $derived.by(() => {
    if (doneWeeks.length < 2) return "";
    const first = doneWeeks[0];
    const last = doneWeeks[doneWeeks.length - 1];
    const tΔ = Math.round(((last.tonnage - first.tonnage) / first.tonnage) * 100);
    const parts = [
      `weekly tonnage ${fmtTonnage(first.tonnage)} → ${fmtTonnage(last.tonnage)} (${tΔ >= 0 ? "+" : ""}${tΔ}%)`,
    ];
    if (first.bestE1rm > 0 && last.bestE1rm > 0) {
      const eΔ = Math.round(((last.bestE1rm - first.bestE1rm) / first.bestE1rm) * 100);
      parts.push(`best e1RM ${Math.round(first.bestE1rm)} → ${Math.round(last.bestE1rm)} kg (${eΔ >= 0 ? "+" : ""}${eΔ}%)`);
    }
    if (last.avgRpe != null) parts.push(`week ${last.week} avg RPE ${last.avgRpe}`);
    return parts.join(" · ");
  });
  async function load() {
    const detail = await api.client(id);
    const cur = detail.currentProgram;
    client = detail.client;
    current = cur;
    programs = detail.programs;
    historyEntries = await api.history(id);
    if (cur) {
      const [logs, sigs] = await Promise.all([api.sessionLogs(id), api.notifications()]);
      signals = sigs.filter((s) => s.clientId === id);
      pulse = blockPulse(cur, logs);
      pulseWeek = weekOf(cur, logs);
      loggedDates = new Set(logs.filter((l) => l.programId === cur.id).map((l) => l.date.slice(0, 10)));
    } else {
      signals = [];
      pulse = [];
      pulseWeek = 0;
    }
    form = {
      goals: detail.client.goals ?? "",
      limitations: detail.client.limitations ?? "",
      daysPerWeek: detail.client.daysPerWeek ?? 3,
      trainingDays: detail.client.trainingDays ? [...detail.client.trainingDays] : [],
    };
  }

  async function save() {
    saving = true;
    try {
      client = await api.updateClient(id, {
        goals: form.goals || null,
        limitations: form.limitations || null,
        daysPerWeek: Number(form.daysPerWeek),
        trainingDays: form.trainingDays,
      });
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    const h = location.hash.slice(1);
    if (h === "pulse" || h === "history" || h === "settings" || h === "program") tab = h;
    return load();
  });
</script>

<svelte:head><title>{client?.name ?? "Client"} · Program Tracker</title></svelte:head>

{#if client === null}
  <Skeleton h="140px" />
{:else}
  <Crumbs items={[{ href: "/clients", label: "Clients" }, { label: client.name }]} />

  <div class="client-top">
    <Avatar name={client.name} />
    <div class="id-block">
      <div class="name-row">
        <h1>{client.name}</h1>
        <StatusPill status={client.status} />
      </div>
      <p class="sub">
        {client.daysPerWeek ?? "?"} days / week{#if sortedDays.length > 0} · {sortedDays.map((d) => DAY_NAMES[d - 1]).join(" ")}{/if}
        {#if client.goals} · “{client.goals}”{/if}
      </p>
    </div>
    <div class="head-actions">
      <Button href={`/clients/${id}/log`}>Log session</Button>
      <Button href={`/clients/${id}/programs/new`}>Write program</Button>
      <Button variant="primary" href={`/clients/${id}/generate`}>
        {#snippet icon()}<Icon name="sparkle" />{/snippet}
        {current ? "Generate next block" : "Generate first program"}
      </Button>
    </div>
  </div>

  {#if visibleSignals.length > 0}
    <section class="panel sig-panel" aria-live="polite">
      {#each visibleSignals as signal (signal.id)}
        <SignalRow
          severity={signal.severity}
          title={signal.title}
          evidence={signal.evidence}
          error={snoozeErrors[signal.id] ? `Couldn't snooze — ${snoozeErrors[signal.id]}` : undefined}
        >
          {#snippet actions()}
            {#if signal.prefillNote}
              <Button
                variant="primary"
                small
                href={`/clients/${id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
              >
                {#snippet icon()}<Icon name="sparkle" />{/snippet}
                Draft next block
              </Button>
            {/if}
            <button class="snooze" disabled={snoozing === signal.id} onclick={() => snooze(signal)}>
              {snoozing === signal.id ? "Snoozing…" : "Snooze 1 wk"}
            </button>
          {/snippet}
        </SignalRow>
      {/each}
    </section>
  {/if}

  <Tabs
    label="Client sections"
    value={tab}
    onchange={(t) => setTab(t as typeof tab)}
    items={[
      { id: 'program', label: 'Program', count: `${current?.sessions.length ?? 0} days` },
      { id: 'pulse', label: 'Pulse', count: `${pulse.length} wks`, disabled: pulse.length === 0 },
      { id: 'history', label: 'History', count: '8 wks' },
      { id: 'settings', label: 'Settings' },
    ]}
  />

  {#if tab === "program"}
    <div class="two-col" id="panel-program" role="tabpanel" aria-labelledby="tab-program">
      <div>
        {#if current}
          {@const prog = current}
          <Panel
            title="Current program"
            count={`${prog.name} · v${prog.version}${prog.aiAssisted ? " · AI-assisted" : ""}`}
          >
            {#snippet act()}<a class="act" href={`/programs/${prog.id}`}>Open builder</a>{/snippet}
            {#each current.sessions as s, i (s.id)}
              {@const dayNum = sortedDays[i]}
              <SessionCard
                name={s.name}
                when={dayNum ? `${DAY_NAMES[dayNum - 1]}${dayNum === todayNum && !loggedDates.has(todayStr) ? " · due today" : ""}` : undefined}
                conditioning={s.conditioning}
                exercises={s.exercises.map((e) => ({ name: e.exerciseName ?? "", role: e.role, sets: e.prescribedSets }))}
              />
            {/each}
            <p class="legend">RPE colour: ≤6 easy, 7–8 hard, 9–10 max · a bare time = timed set</p>
          </Panel>
        {:else}
          <section class="panel">
            <EmptyState>
              No active program. Generate one with AI or build it manually.
              {#snippet actions()}
                <Button variant="primary" href={`/clients/${id}/generate`}>
                  {#snippet icon()}<Icon name="sparkle" />{/snippet}
                  Generate first program
                </Button>
                <Button href={`/clients/${id}/programs/new`}>Write program</Button>
              {/snippet}
            </EmptyState>
          </section>
        {/if}
      </div>

      <div class="side-stack">
        <div>
          <h3 class="side-h">Programs</h3>
          <div class="panel prog-box">
            {#each programs ?? [] as p, i (p.id)}
              <div class="prog-row">
                <a class="lift" class:dim={p.status !== "active"} href={`/programs/${p.id}`}>{p.name}</a>
                <span class="prog-meta"><span class="num">v{p.version}</span><StatusPill status={p.status} /></span>
              </div>
            {/each}
          </div>
        </div>
        {#if client.limitations}
          <div class="limit-panel">
            <h3 class="side-h">Limitations</h3>
            <p>{client.limitations}</p>
          </div>
        {/if}
        {#if client.goals}
          <div>
            <h3 class="side-h">Goals</h3>
            <p class="goals">“{client.goals}”</p>
          </div>
        {/if}
      </div>
    </div>
  {:else if tab === "pulse"}
    <Panel title="Block pulse" id="panel-pulse" role="tabpanel" aria-labelledby="tab-pulse">
      {#snippet act()}
        {#if doneWeeks.length > 1}
          <div class="heat" aria-label={`Weekly tonnage ${fmtTonnage(doneWeeks[0].tonnage)} to ${fmtTonnage(maxTonnage)}`}>
            <span class="heat-l">tonnage</span>
            {#each pulse as w (w.week)}
              {@const l = heatLevel(w)}
              <i class="h{l}" aria-hidden="true"></i>
            {/each}
          </div>
        {/if}
      {/snippet}
      {#if doneWeeks.length > 0}
        <div class="chart">
          <PulseChart weeks={pulse} pulseWeek={pulseWeek} />
        </div>
      {/if}
      <div class="table-wrap">
        <table class="sheet">
          <thead><tr><th class="r">Wk</th><th>Directive</th><th class="r">Tonnage</th><th class="r">Sets</th><th class="r">Avg RPE</th><th class="r">Best e1RM</th></tr></thead>
          <tbody>
            {#each pulse as w (w.week)}
              <tr class:pulse-now={w.week === pulseWeek} class:pulse-future={w.plannedOnly}>
                <td class="r">{w.week}</td>
                <td>
                  {#if w.directive}<DirChip directive={w.directive}>{w.directive}</DirChip>{:else}<span class="subtle">—</span>{/if}
                </td>
                <td class="r">
                  {#if w.plannedOnly}<span class="subtle">{fmtTonnage(w.tonnage)} plan</span>{:else if w.tonnage > 0}{fmtTonnage(w.tonnage)}{:else}—{/if}
                  {#if w.tonnageDelta != null && w.tonnage > 0}<span class="delta {w.tonnageDelta < 0 ? 'down' : 'up'}">{w.tonnageDelta >= 0 ? "+" : ""}{w.tonnageDelta}%</span>{/if}
                </td>
                <td class="r">{#if w.plannedOnly}<span class="subtle">{w.sets}</span>{:else}{w.sets}{/if}</td>
                <td class="r">{w.avgRpe ?? "—"}</td>
                <td class="r">
                  {w.bestE1rm > 0 ? `${Math.round(w.bestE1rm)} kg` : "—"}
                  {#if w.e1rmDelta != null && w.bestE1rm > 0}<span class="delta {w.e1rmDelta < 0 ? 'down' : 'up'}">{w.e1rmDelta >= 0 ? "+" : ""}{w.e1rmDelta}%</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if pulseSummary}<p class="pulse-sub">{pulseSummary}</p>{/if}
    </Panel>
  {:else if tab === "history"}
    <Panel title="Progress · 8 weeks" count="est. 1RM · Epley" id="panel-history" role="tabpanel" aria-labelledby="tab-history">
      {#if historyEntries !== null && historyEntries.length > 0}
        <div class="table-wrap">
          <table class="sheet">
            <thead><tr><th>Lift</th><th class="r">Best e1RM</th><th>Recent sets</th></tr></thead>
            <tbody>
              {#each historyEntries as h (h.exerciseName)}
                <tr>
                  <td class="lift">{h.exerciseName}</td>
                  <td class="r">
                    <span class="num big">{h.bestE1rm > 0 ? Math.round(h.bestE1rm) : "—"}</span>
                    {#if h.bestE1rm > 0}<span class="unit">kg</span>{/if}
                  </td>
                  <td class="sets">
                    {#each h.recentSets as s, i (i)}<span class="setchip"><span class="rep">{s}</span></span>{/each}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <EmptyState>No logged sets in the last 8 weeks.</EmptyState>
      {/if}
    </Panel>
  {:else}
    <Panel class="narrow" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" title="Profile">
      {#snippet act()}<span class="subtle act">feeds every AI draft</span>{/snippet}
      <form
        class="panel-body grid"
        onsubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Training days per week" htmlFor="p-days">
          <select class="select" id="p-days" bind:value={form.daysPerWeek}>
            {#each [1, 2, 3, 4, 5, 6, 7] as d}<option value={d}>{d}</option>{/each}
          </select>
        </Field>
        <Field label="Which days" hint="drives the weekly plan grid">
          <WeekdayPicker bind:days={form.trainingDays} />
        </Field>
        <div class="span">
          <Field label="Goals" htmlFor="p-goals">
            <textarea class="textarea" id="p-goals" rows="2" bind:value={form.goals}></textarea>
          </Field>
        </div>
        <div class="span">
          <Field label="Limitations — hard constraints for the AI" htmlFor="p-lim">
            <textarea class="textarea" id="p-lim" rows="2" bind:value={form.limitations}></textarea>
          </Field>
        </div>
        <div class="span"><Button variant="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button></div>
      </form>
    </Panel>
  {/if}
{/if}

<style>
  .client-top { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .id-block { flex: 1; min-width: 220px; }
  .name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sub { margin: 4px 0 0; }

  .sig-panel { margin: 18px 0 0; }
  .sig-panel :global(.signal .act) { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .snooze:disabled { color: var(--muted); cursor: default; }

  /* minmax(0,·) — a bare 1fr track never shrinks below content min-content,
     which blew the page out sideways on narrow viewports */
  .two-col { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }

  .legend { margin: 12px 16px; font: 400 13px/1.5 var(--font-ui); color: var(--muted); }

  .side-stack { display: flex; flex-direction: column; gap: 16px; }
  .side-h {
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 8px;
  }
  .prog-box { padding: 4px 14px; }
  .prog-meta { display: inline-flex; align-items: center; gap: 8px; }
  .prog-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .prog-row:last-child { border-bottom: none; }
  .prog-row .lift { color: var(--ink); font-weight: 500; text-decoration: none; }
  .prog-row .lift.dim { color: var(--muted); }
  .prog-row .lift:hover { text-decoration: underline; }
  .prog-row .num { font-size: 11.5px; color: var(--muted); white-space: nowrap; }

  .limit-panel {
    background: var(--warn-bg);
    border: 1px solid #d4a72c66;
    border-radius: 6px;
    padding: 13px 15px;
  }
  .limit-panel .side-h { color: var(--warn); }
  .limit-panel p { margin: 0; font-size: 13px; line-height: 1.5; color: #4d3800; }
  .goals { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink); }

  .heat { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .heat i { width: 13px; height: 13px; border-radius: 2px; display: block; border: 1px solid rgba(31, 35, 40, 0.06); }
  .heat .h1 { background: var(--done-1); }
  .heat .h2 { background: var(--done-2); }
  .heat .h3 { background: var(--done-3); }
  .heat .h4 { background: var(--done-4); }
  .heat .h0 { background: transparent; border: 1px dashed var(--line); }
  .heat-l { font: 400 11px/1 var(--font-ui); color: var(--faint); margin-right: 6px; }

  .pulse-now td { background: var(--pulse-now-bg); }
  .pulse-future td { color: var(--faint); }
  .pulse-sub { font: 400 13px/1.5 var(--font-ui); color: var(--muted); margin: 0; padding: 8px 16px 12px; }
  .chart { padding: 14px 16px 0; border-bottom: 1px solid var(--line-soft); margin-bottom: 4px; }

  .table-wrap { overflow-x: auto; }
  .lift { font-weight: 500; }
  .unit { font-size: 12px; color: var(--faint); margin-left: 3px; font-weight: 400; }
  td.sets { max-width: 340px; }

  .narrow { max-width: 560px; }
  .grid { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 14px; }
  .span { grid-column: 1 / -1; }

  @media (max-width: 900px) {
    .two-col { grid-template-columns: minmax(0, 1fr); }
    .client-top .head-actions { width: 100%; }
  }
</style>
