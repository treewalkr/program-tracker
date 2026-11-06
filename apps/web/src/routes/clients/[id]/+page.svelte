<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ChainWeekDto, ClientDto, ExerciseDto, GenerationDto, HistoryEntryDto, ProgramDto, SessionLogDto, SignalDto } from "$lib/api/types";
  import { isLivePending } from "$lib/generation";
  import { blockPulse, weekOf, type WeekMetrics } from "$lib/metrics";
  import { cardioDone, cardioUnitLabel, cardioWeekTotals, isoWeekStart } from "@pt/shared";
  import { weekOptions } from "$lib/format";
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
  import Note from "$lib/ui/Note.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let programs = $state<ProgramDto[] | null>(null);
  let historyEntries = $state<HistoryEntryDto[] | null>(null);
  let latestGen = $state<GenerationDto | null>(null);
  let chainWeekData = $state<ChainWeekDto | null>(null);
  let sessionLogRows = $state<SessionLogDto[]>([]);
  let saving = $state(false);
  let savedForm = $state("");
  let profileSaved = $state(false);
  let saveProfileError = $state<string | null>(null);
  let form = $state({
    goals: "",
    limitations: "",
    daysPerWeek: 3,
    trainingDays: [] as number[],
    cardioUnit: "none" as "none" | "minutes" | "sessions" | "zone_minutes",
    cardioValue: 120,
  });
  /** Picked weekdays set the count; the count select only shows when no days are picked. */
  const formDays = $derived(form.trainingDays.length > 0 ? form.trainingDays.length : Number(form.daysPerWeek));
  const profileDirty = $derived(savedForm !== "" && JSON.stringify({ ...form, daysPerWeek: formDays }) !== savedForm);
  let catalogById = $state(new Map<string, ExerciseDto>());
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

  const fmtVolume = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}t` : `${Math.round(t)}kg`);
  const doneWeeks = $derived(pulse.filter((w) => !w.plannedOnly && w.overallVolume > 0));
  const maxVolume = $derived(Math.max(...doneWeeks.map((w) => w.overallVolume), 1));
  const maxChainSets = $derived(Math.max(...(chainWeekData?.chains.map((c) => c.sets) ?? [0]), 1));
  const heatLevel = (w: WeekMetrics) => (w.plannedOnly ? 0 : Math.max(1, Math.ceil((4 * w.overallVolume) / maxVolume)));
  const pulseSummary = $derived.by(() => {
    if (doneWeeks.length < 2) return "";
    const first = doneWeeks[0];
    const last = doneWeeks[doneWeeks.length - 1];
    const tΔ = Math.round(((last.overallVolume - first.overallVolume) / first.overallVolume) * 100);
    const parts = [
      `weekly overall volume ${fmtVolume(first.overallVolume)} → ${fmtVolume(last.overallVolume)} (${tΔ >= 0 ? "+" : ""}${tΔ}%)`,
    ];
    if (first.bestE1rm > 0 && last.bestE1rm > 0) {
      const eΔ = Math.round(((last.bestE1rm - first.bestE1rm) / first.bestE1rm) * 100);
      parts.push(`best e1RM ${Math.round(first.bestE1rm)} → ${Math.round(last.bestE1rm)} kg (${eΔ >= 0 ? "+" : ""}${eΔ}%)`);
    }
    if (last.avgRpe != null) parts.push(`week ${last.week} avg RPE ${last.avgRpe}`);
    return parts.join(" · ");
  });

  let selectedWeekNumber = $state<number | null>(null);
  let directionText = $state("");
  let savingDirection = $state(false);
  let directionSaved = $state(false);

  const activeWeekNumber = $derived.by(() => {
    if (!current?.weeks || current.weeks.length === 0) return 1;
    if (selectedWeekNumber != null) return selectedWeekNumber;
    const opts = weekOptions(current.weeks, pulseWeek);
    return opts.find((o) => o.isCurrent)?.week ?? 1;
  });

  const currentWeek = $derived.by(() => {
    if (!current?.weeks || current.weeks.length === 0) return null;
    return current.weeks.find((w) => w.week === activeWeekNumber) ?? current.weeks[0];
  });

  const cardioTotals = $derived(cardioWeekTotals(sessionLogRows, isoWeekStart(new Date())));
  const cardioDoneVal = $derived(
    client?.cardioTarget ? cardioDone(client.cardioTarget, cardioTotals) : 0
  );
  const cardioPct = $derived(
    client?.cardioTarget ? Math.round((cardioDoneVal / client.cardioTarget.value) * 100) : 0
  );
  const cardioLabel = $derived(client?.cardioTarget ? cardioUnitLabel(client.cardioTarget.unit) : "");

  async function load() {
    const [detail, exList, cw] = await Promise.all([
      api.client(id),
      api.exercises(),
      api.chainWeek(id).catch(() => null),
    ]);
    catalogById = new Map(exList.map((e) => [e.id, e]));
    chainWeekData = cw;
    const cur = detail.currentProgram;
    client = detail.client;
    current = cur;
    programs = detail.programs;
    historyEntries = await api.history(id);
    const logs = await api.sessionLogs(id);
    sessionLogRows = logs;
    if (cur) {
      const sigs = await api.notifications();
      signals = sigs.filter((s) => s.clientId === id);
      pulse = blockPulse(cur, logs);
      pulseWeek = weekOf(cur, logs);
      loggedDates = new Set(logs.filter((l) => l.programId === cur.id).map((l) => l.date.slice(0, 10)));
    } else {
      signals = [];
      pulse = [];
      pulseWeek = 0;
    }
    directionText = cur?.direction ?? "";
    selectedWeekNumber = null;
    form = {
      goals: detail.client.goals ?? "",
      limitations: detail.client.limitations ?? "",
      daysPerWeek: detail.client.daysPerWeek ?? 3,
      trainingDays: detail.client.trainingDays ? [...detail.client.trainingDays] : [],
      cardioUnit: detail.client.cardioTarget?.unit ?? "none",
      cardioValue: detail.client.cardioTarget?.value ?? 120,
    };
    savedForm = JSON.stringify({ ...form, daysPerWeek: formDays });
    latestGen = (await api.generations(id))[0] ?? null;
  }

  async function save() {
    saving = true;
    saveProfileError = null;
    try {
      form.goals = form.goals.trim();
      form.limitations = form.limitations.trim();
      form.daysPerWeek = formDays;
      client = await api.updateClient(id, {
        goals: form.goals || null,
        limitations: form.limitations || null,
        daysPerWeek: formDays,
        trainingDays: form.trainingDays,
        cardioTarget:
          form.cardioUnit === "none"
            ? null
            : { unit: form.cardioUnit, value: Number(form.cardioValue) },
      });
      savedForm = JSON.stringify({ ...form, daysPerWeek: formDays });
      profileSaved = true;
      setTimeout(() => (profileSaved = false), 2500);
    } catch (e) {
      saveProfileError = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function saveDirection() {
    if (!current) return;
    savingDirection = true;
    directionSaved = false;
    try {
      const updated = await api.saveProgramDirection(current.id, directionText.trim() || null);
      current = updated;
      directionText = updated.direction ?? "";
      directionSaved = true;
      setTimeout(() => {
        directionSaved = false;
      }, 2000);
    } finally {
      savingDirection = false;
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
        {client.daysPerWeek ?? "?"} days / week{#if sortedDays.length > 0}{" · "}{sortedDays.map((d) => DAY_NAMES[d - 1]).join(" ")}{/if}
        {#if client.goals} · “{client.goals}”{/if}
      </p>
    </div>
    <div class="head-actions">
      <Button href={`/clients/${id}/log`}>Log session</Button>
      <Button href={`/clients/${id}/chat`}>Ask AI</Button>
      <Button href={`/clients/${id}/programs/new`}>Write program</Button>
      <Button variant="primary" href={`/clients/${id}/generate`}>
        {#snippet icon()}<Icon name="sparkle" />{/snippet}
        {current ? "Generate next block" : "Generate first program"}
      </Button>
    </div>
  </div>

  {#if isLivePending(latestGen)}
    <Note tone="warn" role="status" class="gen-banner">
      <span>AI draft is generating in the background — it keeps going even with this page closed.</span>
      <Button variant="ghost" href={`/clients/${id}/generate`}>Watch progress</Button>
    </Note>
  {/if}

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
            {#if signal.targetWeek}
              <Button
                variant="primary"
                small
                href={`/clients/${id}/generate?week=${signal.targetWeek}${signal.prefillNote ? `&note=${encodeURIComponent(signal.prefillNote)}` : ""}`}
              >
                {#snippet icon()}<Icon name="sparkle" />{/snippet}
                Generate week {signal.targetWeek}
              </Button>
            {:else if signal.prefillNote}
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
      { id: 'program', label: 'Program', count: `${currentWeek?.days.length ?? 0} days` },
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
            title={prog.name}
            count={`v${prog.version}`}
          >
            {#snippet act()}
              {#if prog.status === "active" && prog.phasing && pulseWeek < Math.min(prog.phasing.plannedWeeks, prog.weeks.length)}
                <Button small href={`/clients/${id}/generate?week=${pulseWeek + 1}`}>Generate week {pulseWeek + 1}</Button>
              {/if}
              <a class="act" href={`/programs/${prog.id}`}>Open program →</a>
            {/snippet}
            <div class="week-chips" role="group" aria-label="Program week">
              {#each weekOptions(prog.weeks, pulseWeek) as opt (opt.week)}
                <button
                  type="button"
                  class="tchip"
                  class:on={activeWeekNumber === opt.week}
                  aria-pressed={activeWeekNumber === opt.week}
                  onclick={() => { selectedWeekNumber = opt.week; }}
                >
                  {opt.label}
                </button>
              {/each}
            </div>
            {#if currentWeek}
              {#each currentWeek.days as d, i (d.id)}
                {@const dayNum = d.weekday ?? sortedDays[i]}
                {@const when = dayNum ? `${DAY_NAMES[dayNum - 1]}${dayNum === todayNum && !loggedDates.has(todayStr) ? " · due today" : ""}` : undefined}
                {#each d.sessions as s (s.id)}
                  <SessionCard
                    name={s.name}
                    when={when}
                    kind={s.kind}
                    cardio={s.cardio}
                    exercises={s.exercises.map((e) => ({
                      name: e.exerciseName ?? "",
                      role: e.role,
                      movementPattern: catalogById.get(e.exerciseId)?.movementPattern ?? null,
                      sets: e.prescribedSets,
                    }))}
                  />
                {/each}
              {/each}
            {/if}
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
        {#if current}
          <div class="panel dir-panel">
            <h3 class="side-h">Direction</h3>
            <p class="side-hint">standing steer — every weekly generation follows it</p>
            <textarea
              class="dir-input"
              maxlength="500"
              rows="3"
              placeholder="e.g. Build squat volume; keep upper body at maintenance."
              bind:value={directionText}
            ></textarea>
            <div class="dir-actions">
              <Button small onclick={saveDirection} disabled={savingDirection}>
                {savingDirection ? "Saving…" : directionSaved ? "Saved" : "Save"}
              </Button>
            </div>
          </div>
        {/if}
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
        {#if client.cardioTarget}
          <div>
            <h3 class="side-h">Cardio this week</h3>
            <div class="panel cardio-box">
              <p class="cardio-line">
                {cardioDoneVal} / {client.cardioTarget.value} {cardioLabel} · {cardioPct}%
              </p>
              <div class="bar"><i style:width={`${Math.min(cardioPct, 100)}%`}></i></div>
              {#if cardioPct >= 100}<p class="cardio-met">target met ✓</p>{/if}
            </div>
          </div>
        {/if}
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
    <div class="pulse-stack">
      <Panel title="Block pulse" id="panel-pulse" role="tabpanel" aria-labelledby="tab-pulse">
        {#snippet act()}
          {#if current}<Button small href={`/clients/${id}/message`}>Message client</Button>{/if}
          {#if doneWeeks.length > 1}
            <div class="heat" aria-label={`Weekly overall volume ${fmtVolume(doneWeeks[0].overallVolume)} to ${fmtVolume(maxVolume)}`}>
              <span class="heat-l">overall volume</span>
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
            <thead><tr><th class="r">Wk</th><th>Directive</th><th>Target</th><th class="r">Overall volume</th><th class="r">Sets</th><th class="r">Avg RPE</th><th class="r">Best e1RM</th></tr></thead>
            <tbody>
              {#each pulse as w (w.week)}
                <tr class:pulse-now={w.week === pulseWeek} class:pulse-future={w.plannedOnly}>
                  <td class="r">{w.week}</td>
                  <td>
                    {#if w.directive}<DirChip directive={w.directive}>{w.directive}</DirChip>{:else}<span class="subtle">—</span>{/if}
                  </td>
                  <td>
                    {#if w.target}
                      {@const short = w.target.metric === "overall_volume" ? "overall vol" : w.target.metric === "rep_volume" ? "rep vol" : "intensity"}
                      {@const sign = w.target.deltaPercent >= 0 ? "+" : ""}
                      {#if w.targetDelta != null}
                        <span>{short} {sign}{w.target.deltaPercent}% → {w.targetDelta >= 0 ? "+" : ""}{w.targetDelta}% {w.targetMet ? "✓" : "✗"}</span>
                      {:else}
                        <span class="subtle">{short} {sign}{w.target.deltaPercent}%</span>
                      {/if}
                    {:else}
                      <span class="subtle">—</span>
                    {/if}
                  </td>
                  <td class="r">
                    {#if w.plannedOnly}<span class="subtle">{fmtVolume(w.overallVolume)} plan</span>{:else if w.overallVolume > 0}{fmtVolume(w.overallVolume)}{:else}—{/if}
                    {#if w.overallVolumeDelta != null && w.overallVolume > 0}<span class="delta {w.overallVolumeDelta < 0 ? 'down' : 'up'}">{w.overallVolumeDelta >= 0 ? "+" : ""}{w.overallVolumeDelta}%</span>{/if}
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

      {#if chainWeekData}
        <Panel title="Chains trained this week" count={`week of ${chainWeekData.weekStart}`}>
          <div class="chains-list">
            {#each chainWeekData.chains as c (c.id)}
              {@const isZero = c.sets === 0}
              <div class="chain-row" class:muted={isZero}>
                <div class="chain-info">
                  <span class="chain-name">{c.name}</span>
                  {#if isZero}
                    <span class="chain-status">not trained this week</span>
                  {:else}
                    <span class="chain-count">{c.sets} {c.sets === 1 ? "working set" : "working sets"}</span>
                  {/if}
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill"
                    style:width={`${isZero ? 0 : Math.round((c.sets / maxChainSets) * 100)}%`}
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        </Panel>
      {/if}
    </div>
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
        class="panel-body pf"
        onsubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section class="pf-sec">
          <h3>Schedule</h3>
          <Field label="Training days" hint="drives the weekly plan grid">
            <div class="days-row">
              <WeekdayPicker bind:days={form.trainingDays} />
              {#if form.trainingDays.length > 0}
                <span class="subtle">{formDays} {formDays === 1 ? "day" : "days"} a week</span>
              {/if}
            </div>
          </Field>
          {#if form.trainingDays.length === 0}
            <div class="count-row">
              <label class="subtle" for="p-days">No fixed days — trains</label>
              <select class="select count" id="p-days" bind:value={form.daysPerWeek}>
                {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{d}</option>{/each}
              </select>
              <span class="subtle">{Number(form.daysPerWeek) === 1 ? "day" : "days"} a week</span>
            </div>
          {/if}
          <Field label="Weekly cardio target" hint="resets every Monday">
            <div class="cardio-fields">
              {#if form.cardioUnit !== "none"}
                <input
                  class="input tnum"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="10000"
                  bind:value={form.cardioValue}
                  aria-label="Cardio target value"
                />
              {/if}
              <select class="select" bind:value={form.cardioUnit} aria-label="Cardio target unit">
                <option value="none">No cardio target</option>
                <option value="minutes">minutes</option>
                <option value="sessions">sessions</option>
                <option value="zone_minutes">zone minutes</option>
              </select>
            </div>
          </Field>
        </section>

        <section class="pf-sec">
          <h3>For the AI</h3>
          <Field label="Goals" htmlFor="p-goals">
            <textarea
              class="textarea"
              id="p-goals"
              rows="2"
              placeholder="e.g. Squat 140kg by spring, run a sub-25 min 5k"
              bind:value={form.goals}
            ></textarea>
          </Field>
          <Field label="Limitations" htmlFor="p-lim" hint="hard constraints every draft must respect">
            <textarea
              class="textarea"
              id="p-lim"
              rows="2"
              placeholder="e.g. Left shoulder impingement — no overhead pressing"
              bind:value={form.limitations}
            ></textarea>
          </Field>
        </section>

        <div class="pf-foot">
          <Button variant="primary" type="submit" disabled={saving || !profileDirty}>{saving ? "Saving…" : "Save profile"}</Button>
          <span class="subtle" role="status">
            {#if saveProfileError}<span class="err">Save failed: {saveProfileError}</span>
            {:else if profileDirty}Unsaved changes
            {:else if profileSaved}Saved{/if}
          </span>
        </div>
      </form>
    </Panel>
  {/if}
{/if}

<style>
  .client-top { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .id-block { flex: 1; min-width: 220px; }
  .name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sub { margin: 4px 0 0; }

  :global(.gen-banner) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 18px 0 0;
  }

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
  .pulse-stack { display: flex; flex-direction: column; gap: 16px; }
  .chains-list { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
  .chain-row { display: flex; flex-direction: column; gap: 6px; }
  .chain-row.muted { opacity: 0.6; }
  .chain-info { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
  .chain-name { font-weight: 500; color: var(--ink); }
  .chain-row.muted .chain-name { color: var(--muted); }
  .chain-count { color: var(--muted); font-size: 12.5px; }
  .chain-status { color: var(--faint); font-style: italic; font-size: 12px; }
  .bar-track { height: 8px; background: var(--line-soft); border-radius: 4px; overflow: hidden; width: 100%; }
  .bar-fill { height: 100%; background: var(--primary, #0969da); border-radius: 4px; transition: width 0.2s ease; }
  .chain-row.muted .bar-fill { background: transparent; }
  .chart { padding: 14px 16px 0; border-bottom: 1px solid var(--line-soft); margin-bottom: 4px; }

  .table-wrap { overflow-x: auto; }
  .lift { font-weight: 500; }
  .unit { font-size: 12px; color: var(--faint); margin-left: 3px; font-weight: 400; }
  td.sets { max-width: 340px; }

  .narrow { max-width: 560px; }
  .pf { display: flex; flex-direction: column; gap: 22px; max-width: 640px; }
  .pf-sec { display: flex; flex-direction: column; gap: 14px; }
  .pf-sec h3 {
    margin: 0;
    font: 600 11.5px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .days-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .count-row { display: flex; align-items: center; gap: 8px; margin-top: -6px; font-size: 13px; }
  .count-row .count { width: auto; }
  .pf-foot { display: flex; align-items: center; gap: 12px; padding-top: 4px; border-top: 1px solid var(--line-soft); padding-top: 16px; }
  .pf-foot .err { color: var(--bad); }

  .cardio-fields { display: flex; gap: 8px; align-items: center; }
  .cardio-fields .select { width: auto; }
  .cardio-fields .input { width: 110px; }
  .cardio-box { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .cardio-line { margin: 0; font: 500 13px/1.4 var(--font-ui); color: var(--ink); }
  .cardio-box .bar {
    height: 8px;
    background: var(--line-soft);
    border-radius: 4px;
    overflow: hidden;
  }
  .cardio-box .bar i {
    display: block;
    height: 100%;
    background: var(--primary, #0969da);
    border-radius: 4px;
    transition: width 0.2s ease;
  }
  .cardio-met { margin: 0; font: 600 12px/1.4 var(--font-ui); color: var(--good); }

  @media (max-width: 900px) {
    .two-col { grid-template-columns: minmax(0, 1fr); }
    .client-top .head-actions { width: 100%; }
  }

  .week-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px 4px; }
  .dir-panel { padding: 12px 14px; }
  .side-hint { margin: 2px 0 8px; font-size: 11.5px; color: var(--faint); line-height: 1.4; }
  .dir-input {
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.4;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm, 6px);
    background: var(--surface);
    color: var(--ink);
    resize: vertical;
  }
  .dir-input:focus { outline: 2px solid var(--focus); outline-offset: 1px; }
  .dir-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
</style>
