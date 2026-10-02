<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ClientDto, HistoryEntryDto, ProgramDto, SignalDto } from "$lib/api/types";
  import { blockPulse, weekOf, type WeekMetrics } from "$lib/metrics";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import WeekdayPicker from "$lib/components/WeekdayPicker.svelte";

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
  const initials = $derived(
    (client?.name ?? "")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  );

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
  const dirClass = (directive: string) =>
    directive === "+volume" ? "vol" : directive === "+intensity" ? "int" : directive === "transition" ? "tr" : "";

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
  <div class="skeleton" style="height:140px"></div>
{:else}
  <p class="crumbs"><a href="/clients">Clients</a> / <b>{client.name}</b></p>

  <div class="client-top">
    <div class="avatar" aria-hidden="true">{initials}</div>
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
      <a class="btn" href={`/clients/${id}/log`}>Log session</a>
      <a class="btn" href={`/clients/${id}/programs/new`}>Write program</a>
      <a class="btn primary" href={`/clients/${id}/generate`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" /></svg>
        {current ? "Generate next block" : "Generate first program"}
      </a>
    </div>
  </div>

  {#if visibleSignals.length > 0}
    <section class="panel sig-panel" aria-live="polite">
      {#each visibleSignals as signal (signal.id)}
        <div class="signal">
          <span class="lamp {signal.severity === 'urgent' ? 'red' : signal.severity === 'attention' ? 'amber' : 'green'}" aria-hidden="true"></span>
          <div class="body">
            <strong>{signal.title}</strong>
            <p class="evi">{signal.evidence}</p>
            {#if snoozeErrors[signal.id]}
              <p class="evi err" role="alert">Couldn't snooze — {snoozeErrors[signal.id]}</p>
            {/if}
          </div>
          <div class="act">
            {#if signal.prefillNote}
              <a
                class="btn primary small"
                href={`/clients/${id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" /></svg>
                Draft next block
              </a>
            {/if}
            <button class="snooze" disabled={snoozing === signal.id} onclick={() => snooze(signal)}>
              {snoozing === signal.id ? "Snoozing…" : "Snooze 1 wk"}
            </button>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <div class="tabs" role="tablist" aria-label="Client sections">
    <button type="button" id="tab-program" role="tab" class="tab" class:on={tab === "program"} aria-selected={tab === "program"} aria-controls="panel-program" onclick={() => setTab("program")}>
      Program <span class="counter">{current?.sessions.length ?? 0} days</span>
    </button>
    <button type="button" id="tab-pulse" role="tab" class="tab" class:on={tab === "pulse"} aria-selected={tab === "pulse"} aria-controls="panel-pulse" onclick={() => setTab("pulse")} disabled={pulse.length === 0}>
      Pulse <span class="counter">{pulse.length} wks</span>
    </button>
    <button type="button" id="tab-history" role="tab" class="tab" class:on={tab === "history"} aria-selected={tab === "history"} aria-controls="panel-history" onclick={() => setTab("history")}>
      History <span class="counter">8 wks</span>
    </button>
    <button type="button" id="tab-settings" role="tab" class="tab" class:on={tab === "settings"} aria-selected={tab === "settings"} aria-controls="panel-settings" onclick={() => setTab("settings")}>Settings</button>
  </div>

  {#if tab === "program"}
    <div class="two-col" id="panel-program" role="tabpanel" aria-labelledby="tab-program">
      <div>
        {#if current}
          <section class="panel">
            <div class="panel-head">
              <h2>Current program</h2>
              <span class="counter">{current.name} · v{current.version}{#if current.aiAssisted} · AI-assisted{/if}</span>
              <a class="act" href={`/programs/${current.id}`}>Open builder</a>
            </div>
            {#each current.sessions as s, i (s.id)}
              {@const dayNum = sortedDays[i]}
              <div class="session">
                <div class="session-head">
                  <h3>{s.name}</h3>
                  {#if dayNum}
                    <span class="when">{DAY_NAMES[dayNum - 1]}{#if dayNum === todayNum && !loggedDates.has(todayStr)} · due today{/if}</span>
                  {/if}
                </div>
                <div class="session-body">
                  {#each s.exercises as e (e.id)}
                    <div class="exrow">
                      <div class="ex">{e.exerciseName ?? "Unmapped exercise"}</div>
                      <SetChips sets={e.prescribedSets} />
                    </div>
                  {/each}
                </div>
                {#if s.conditioning}
                  <div class="session-head cond-row">
                    <span class="cond"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6l7 12H5z" /></svg>{s.conditioning.label}{#if s.conditioning.detail} · {s.conditioning.detail}{/if}</span>
                  </div>
                {/if}
              </div>
            {/each}
            <p class="legend">Dashed chip = warm-up · RPE colour: ≤6 easy, 7–8 hard, 9–10 max · a bare time = timed set</p>
          </section>
        {:else}
          <section class="panel">
            <div class="empty">
              No active program. Generate one with AI or build it manually.
              <div style="margin-top:12px; display: flex; gap: 8px; justify-content: center">
                <a class="btn primary" href={`/clients/${id}/generate`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" /></svg>
                  Generate first program
                </a>
                <a class="btn" href={`/clients/${id}/programs/new`}>Write program</a>
              </div>
            </div>
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
                <span class="num">v{p.version} · {p.status}</span>
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
    <div class="panel" id="panel-pulse" role="tabpanel" aria-labelledby="tab-pulse">
      <div class="panel-head">
        <h2>Block pulse</h2>
        {#if doneWeeks.length > 1}
          <div class="heat" aria-label={`Weekly tonnage ${fmtTonnage(doneWeeks[0].tonnage)} to ${fmtTonnage(maxTonnage)}`}>
            <span class="heat-l">tonnage</span>
            {#each pulse as w (w.week)}
              {@const l = heatLevel(w)}
              <i class="h{l}" aria-hidden="true"></i>
            {/each}
          </div>
        {/if}
      </div>
      <div class="table-wrap">
        <table class="sheet">
          <thead><tr><th class="r">Wk</th><th>Directive</th><th class="r">Tonnage</th><th class="r">Sets</th><th class="r">Avg RPE</th><th class="r">Best e1RM</th></tr></thead>
          <tbody>
            {#each pulse as w (w.week)}
              <tr class:pulse-now={w.week === pulseWeek} class:pulse-future={w.plannedOnly}>
                <td class="r">{w.week}</td>
                <td>
                  {#if w.directive}<span class="dir {dirClass(w.directive)}">{w.directive}</span>{:else}<span class="subtle">—</span>{/if}
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
    </div>
  {:else if tab === "history"}
    <div class="panel" id="panel-history" role="tabpanel" aria-labelledby="tab-history">
      <div class="panel-head">
        <h2>Progress · 8 weeks</h2>
        <span class="counter">est. 1RM · Epley</span>
      </div>
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
                  <td class="sets">{h.recentSets.join(", ")}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty">No logged sets in the last 8 weeks.</div>
      {/if}
    </div>
  {:else}
    <div class="panel narrow" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings">
      <div class="panel-head">
        <h2>Profile</h2>
        <span class="subtle act">feeds every AI draft</span>
      </div>
      <form
        class="panel-body grid"
        onsubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <label class="label" for="p-days">Training days per week</label>
          <select class="select" id="p-days" bind:value={form.daysPerWeek}>
            {#each [1, 2, 3, 4, 5, 6, 7] as d}<option value={d}>{d}</option>{/each}
          </select>
        </div>
        <div>
          <span class="label">Which days <span class="subtle">— drives the weekly plan grid</span></span>
          <WeekdayPicker bind:days={form.trainingDays} />
        </div>
        <div class="span">
          <label class="label" for="p-goals">Goals</label>
          <textarea class="textarea" id="p-goals" rows="2" bind:value={form.goals}></textarea>
        </div>
        <div class="span">
          <label class="label" for="p-lim">Limitations — hard constraints for the AI</label>
          <textarea class="textarea" id="p-lim" rows="2" bind:value={form.limitations}></textarea>
        </div>
        <div class="span"><button class="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
      </form>
    </div>
  {/if}
{/if}

<style>
  .crumbs b { color: var(--ink); }

  .client-top { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .id-block { flex: 1; min-width: 220px; }
  .name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sub { margin: 4px 0 0; }

  .sig-panel { margin: 18px 0 0; }
  .sig-panel .act { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .snooze:disabled { color: var(--muted); cursor: default; }

  .tab {
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    font: 400 14px/1.3 var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .tab:hover { color: var(--ink); }
  .tab.on { color: var(--ink); font-weight: 600; border-bottom-color: #fd8c73; }
  .tab:disabled { opacity: 0.5; cursor: default; }

  /* minmax(0,·) — a bare 1fr track never shrinks below content min-content,
     which blew the page out sideways on narrow viewports */
  .two-col { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }

  .session .cond-row { border-bottom: none; padding-bottom: 13px; }
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

  .table-wrap { overflow-x: auto; }
  .lift { font-weight: 500; }
  .unit { font-size: 12px; color: var(--faint); margin-left: 3px; font-weight: 400; }
  .sets { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }

  .narrow { max-width: 560px; }
  .grid { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 14px; }
  .span { grid-column: 1 / -1; }

  @media (max-width: 900px) {
    .two-col { grid-template-columns: minmax(0, 1fr); }
    .client-top .head-actions { width: 100%; }
  }
</style>
