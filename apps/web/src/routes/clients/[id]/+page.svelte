<script lang="ts">
  import ClientProfileFields from "$lib/components/ClientProfileFields.svelte";
  import { basicsInvalid, basicsSummary, emailError, emptyProfile, nameError, phonePayload, profileFromClient, profileKey, profilePayload, type ProfileForm } from "$lib/clientProfile";
  import ClientIdentityFields from "$lib/components/ClientIdentityFields.svelte";
  import ProfileSection from "$lib/components/ProfileSection.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ChainWeekDto, ClientDto, ExerciseDto, GenerationDto, ProgramDto, SessionLogDto, SignalDto } from "$lib/api/types";
  import { isLivePending } from "$lib/generation";
  import { blockPulse, weekOf, type WeekMetrics } from "$lib/metrics";
  import { oneRepMaxKg, plannedVolume, pulseCellSets, type PulseCell } from "@pt/shared";
  import PulseDrill from "$lib/components/PulseDrill.svelte";
  import { cardioDone, cardioUnitLabel, cardioWeekTotals, isoWeekStart, placedWeekdays, sessionTag, sessionsByWeekday } from "@pt/shared";
  import { weekOptions } from "$lib/format";
  import { localIso } from "$lib/overview";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import SessionCard from "$lib/components/SessionCard.svelte";
  import SignalRow from "$lib/components/SignalRow.svelte";
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
  import { logDateLabel } from "$lib/programLogs";
  import { slotSwaps } from "$lib/logSheet";
  import { ALL_LIMIT, HISTORY_RANGES, liftProgress, rangeInfo, rangeStart, sessionsByWeek, type HistoryRange } from "$lib/historyTab";
  import Sparkline from "$lib/components/Sparkline.svelte";
  import LiftChart from "$lib/components/LiftChart.svelte";
  import { SvelteSet } from "svelte/reactivity";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let programs = $state<ProgramDto[] | null>(null);
  let latestGen = $state<GenerationDto | null>(null);
  let chainWeekData = $state<ChainWeekDto | null>(null);
  let sessionLogRows = $state<SessionLogDto[]>([]);
  let saving = $state(false);
  let savedForm = $state("");
  let profileSaved = $state(false);
  let saveProfileError = $state<string | null>(null);
  let form = $state<ProfileForm>(emptyProfile());
  let idName = $state("");
  let idEmail = $state("");
  let idPhone = $state("");
  let idAttempted = $state(false);
  const idKey = () => JSON.stringify([idName.trim(), idEmail.trim(), idPhone.trim()]);
  let savedId = $state("");
  const profileDirty = $derived(savedForm !== "" && (profileKey(form) !== savedForm || idKey() !== savedId));
  let catalogById = $state(new Map<string, ExerciseDto>());
  let signals = $state<SignalDto[]>([]);
  let pulse = $state<WeekMetrics[]>([]);
  let pulseWeek = $state(0);
  /** The Pulse cell whose sets are open below the table. */
  let drill = $state<{ week: number; cell: PulseCell } | null>(null);
  const drillRows = $derived(drill && current ? pulseCellSets(current, sessionLogRows, drill.week, drill.cell) : []);
  const liftName = (exerciseId: string) => catalogById.get(exerciseId)?.name ?? "Unknown exercise";
  const openDrill = (week: number, cell: PulseCell) => {
    drill = drill?.week === week && drill.cell === cell ? null : { week, cell };
  };
  const isOpen = (week: number, cell: PulseCell) => drill?.week === week && drill.cell === cell;
  let loggedDates = $state<Set<string>>(new Set());
  let dismissedNow = $state<string[]>([]);
  let snoozing = $state<string | null>(null);
  let snoozeErrors = $state<Record<string, string>>({});
  let tab = $state<"program" | "pulse" | "history" | "settings">("program");

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1;
  const todayStr = localIso(new Date());
  const todayNum = isoDay(new Date());
  const basics = $derived(client ? basicsSummary(client) : []);
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

  /* History tab: its own fetch per range (the page's logs stop at the newest 200). */
  let range = $state<HistoryRange>("8w");
  let historyLogs = $state<SessionLogDto[] | null>(null);
  let historyLoading = $state(false);
  let historyError = $state<string | null>(null);
  /** Lift whose chart is open under the Progress table. */
  let chartLift = $state<string | null>(null);
  const openSessions = new SvelteSet<string>();
  let historyReq = 0;
  const rangeLimit = (r: HistoryRange) => (r === "all" ? ALL_LIMIT : 200);

  async function loadHistory(clientId: string, r: HistoryRange) {
    const req = ++historyReq;
    historyLoading = true;
    historyError = null;
    try {
      const from = rangeStart(r, todayStr) ?? undefined;
      const logs = await api.sessionLogs(clientId, undefined, { from, limit: r === "all" ? ALL_LIMIT : undefined });
      if (req === historyReq) historyLogs = logs;
    } catch (err) {
      if (req === historyReq) historyError = (err as Error).message || "Couldn't load the history.";
    } finally {
      if (req === historyReq) historyLoading = false;
    }
  }

  $effect(() => {
    if (tab === "history" && id) loadHistory(id, range);
  });

  const lifts = $derived(historyLogs ? liftProgress(historyLogs, programs ?? [], liftName) : []);
  const historyWeeks = $derived(historyLogs ? sessionsByWeek(historyLogs, programs ?? [], liftName) : []);
  const historySessions = $derived(historyWeeks.reduce((n, w) => n + w.sessions.length, 0));
  const historyCapped = $derived(historyLogs !== null && historyLogs.length >= rangeLimit(range));
  const chartRow = $derived(lifts.find((l) => l.exerciseId === chartLift && l.series.length > 0) ?? null);
  const toggleChart = (exerciseId: string) => (chartLift = chartLift === exerciseId ? null : exerciseId);
  const toggleSession = (logId: string) => (openSessions.has(logId) ? openSessions.delete(logId) : openSessions.add(logId));

  const visibleSignals = $derived(signals.filter((s) => !dismissedNow.includes(s.id)));

  const fmtVolume = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}t` : `${Math.round(t)}kg`);
  const doneWeeks = $derived(pulse.filter((w) => !w.plannedOnly && w.overallVolume > 0));
  const maxVolume = $derived(Math.max(...doneWeeks.map((w) => w.overallVolume), 1));
  /** Planned tonnage per program week from resolved loads (%1RM via the client's 1RMs); null = no loads to plan from. */
  const plannedByWeek = $derived(
    new Map((current?.weeks ?? []).map((w) => [w.week, plannedVolume(w.sessions, client?.oneRepMaxes)] as const))
  );
  /** Slots logged under another exercise than the program prescribes (the logger's Swap). */
  const swaps = $derived(current ? slotSwaps(current, sessionLogRows).slice(0, 10) : []);
  const exName = (id: string) => catalogById.get(id)?.name ?? id;
  const catalogList = $derived([...catalogById.values()]);
  const shortDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

  /** Current week grouped Mon→Sun, then unscheduled ("Any day") last; empty days dropped. */
  const weekGroups = $derived.by(() => {
    if (!currentWeek) return [];
    const by = sessionsByWeekday(currentWeek.sessions);
    return [1, 2, 3, 4, 5, 6, 7, 0]
      .map((day) => ({ day, sessions: by.get(day) ?? [] }))
      .filter((g) => g.sessions.length > 0);
  });
  const weekCardio = $derived(currentWeek ? currentWeek.sessions.filter((s) => s.kind === "cardio").length : 0);
  const weekDays = $derived(currentWeek ? placedWeekdays(currentWeek.sessions) : []);

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
    const logs = await api.sessionLogs(id);
    sessionLogRows = logs;
    // Client-level signals (cardio pace) exist with or without a program.
    signals = (await api.notifications()).filter((s) => s.clientId === id);
    drill = null;
    if (cur) {
      pulse = blockPulse(cur, logs);
      pulseWeek = weekOf(cur, logs);
      loggedDates = new Set(logs.filter((l) => l.programId === cur.id).map((l) => l.date.slice(0, 10)));
    } else {
      pulse = [];
      pulseWeek = 0;
    }
    directionText = cur?.direction ?? "";
    selectedWeekNumber = null;
    form = profileFromClient(detail.client);
    savedForm = profileKey(form);
    idName = detail.client.name;
    idEmail = detail.client.email ?? "";
    idPhone = detail.client.phone ?? "";
    savedId = idKey();
    latestGen = (await api.generations(id))[0] ?? null;
  }

  async function save() {
    if (nameError(idName) || emailError(idEmail)) {
      idAttempted = true;
      return;
    }
    if (basicsInvalid(form)) {
      saveProfileError = "fix the basics marked above";
      document.querySelector<HTMLElement>('#panel-settings [aria-invalid="true"]')?.focus();
      return;
    }
    saving = true;
    saveProfileError = null;
    try {
      client = await api.updateClient(id, { name: idName.trim(), email: idEmail.trim() || null, phone: phonePayload(idPhone), ...profilePayload(form) });
      form = profileFromClient(client);
      savedForm = profileKey(form);
      idName = client.name;
      idEmail = client.email ?? "";
      idPhone = client.phone ?? "";
      savedId = idKey();
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

{#snippet cellBtn(week: number, cell: PulseCell, text: string, label: string)}
  <button type="button" class="cell-btn" aria-label={label} aria-expanded={isOpen(week, cell)} aria-controls="pulse-drill" onclick={() => openDrill(week, cell)}>{text}</button>
{/snippet}

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
        {#each basics as part (part)}{part}{" · "}{/each}{client.sessionsPerWeek ?? "?"} lifting sessions / week{#if sortedDays.length > 0}{" · "}{sortedDays.map((d) => DAY_NAMES[d - 1]).join(" ")}{/if}
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
      { id: 'program', label: 'Program', count: `${currentWeek?.sessions.length ?? 0} sessions` },
      { id: 'pulse', label: 'Pulse', count: `${pulse.length} wks`, disabled: pulse.length === 0 },
      { id: 'history', label: 'History', count: rangeInfo(range).badge },
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
              <p class="week-line">
                <span class="num">{currentWeek.sessions.length}</span> {currentWeek.sessions.length === 1 ? "session" : "sessions"} / week{#if weekCardio > 0}{" · "}<span class="num">{currentWeek.sessions.length - weekCardio}</span> lifting, <span class="num">{weekCardio}</span> cardio{/if}{#if weekDays.length > 0}{" · "}{weekDays.map((d) => DAY_NAMES[d - 1]).join(" ")}{/if}
              </p>
              {#each weekGroups as g (g.day)}
                <div class="day-h" class:any={g.day === 0}>
                  <span class="day-name">{g.day === 0 ? "Any day" : DAY_NAMES[g.day - 1]}</span>
                  {#if g.day === todayNum && !loggedDates.has(todayStr)}<span class="due">due today</span>{/if}
                  {#if g.day === 0}<span class="day-note">not placed on the calendar</span>{/if}
                  {#if g.sessions.length > 1}<span class="day-count"><span class="num">{g.sessions.length}</span> sessions</span>{/if}
                </div>
                {#each g.sessions as s (s.id)}
                  <SessionCard
                    name={s.name}
                    tag={sessionTag(s)}
                    kind={s.kind}
                    cardio={s.cardio}
                    exercises={s.exercises.map((e) => ({
                      name: e.exerciseName ?? "",
                      role: e.role,
                      movementPattern: catalogById.get(e.exerciseId)?.movementPattern ?? null,
                      sets: e.prescribedSets,
                      oneRepMaxKg: oneRepMaxKg(client?.oneRepMaxes, e.exerciseId),
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
                    {#if w.plannedOnly}{@const planned = plannedByWeek.get(w.week) ?? null}<span class="subtle" title={planned == null ? "No prescribed loads to plan from" : "Planned: prescribed kg × reps"}>{planned == null ? "—" : `${fmtVolume(planned)} plan`}</span>{:else if w.overallVolume > 0}{@render cellBtn(w.week, "volume", fmtVolume(w.overallVolume), `Week ${w.week} overall volume: show the sets`)}{:else}—{/if}
                    {#if w.overallVolumeDelta != null && w.overallVolume > 0}<span class="delta {w.overallVolumeDelta < 0 ? 'down' : 'up'}">{w.overallVolumeDelta >= 0 ? "+" : ""}{w.overallVolumeDelta}%</span>{/if}
                  </td>
                  <td class="r">{#if w.plannedOnly}<span class="subtle">{w.sets}</span>{:else if w.sets > 0}{@render cellBtn(w.week, "sets", String(w.sets), `Week ${w.week} sets: show the sets`)}{:else}0{/if}</td>
                  <td class="r">{#if !w.plannedOnly && w.avgRpe != null}{@render cellBtn(w.week, "rpe", String(w.avgRpe), `Week ${w.week} average RPE: show the rated sets`)}{:else}—{/if}</td>
                  <td class="r">
                    {#if w.bestE1rm > 0 && w.topE1rmExerciseId}
                      <span class="top-lift">{liftName(w.topE1rmExerciseId)}</span>
                      {@render cellBtn(w.week, "e1rm", `${Math.round(w.bestE1rm)} kg`, `Week ${w.week} best e1RM, ${liftName(w.topE1rmExerciseId)}: show the sets`)}
                    {:else}—{/if}
                    {#if w.e1rmDelta != null && w.bestE1rm > 0}<span class="delta {w.e1rmDelta < 0 ? 'down' : 'up'}">{w.e1rmDelta >= 0 ? "+" : ""}{w.e1rmDelta}%</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if drill}
          <PulseDrill id="pulse-drill" rows={drillRows} cell={drill.cell} week={drill.week} nameOf={liftName} onclose={() => (drill = null)} />
        {/if}
        {#if pulseSummary}<p class="pulse-sub">{pulseSummary}</p>{/if}
      </Panel>

      {#if chainWeekData}
        <Panel title="Sets touching each chain" count={`week of ${chainWeekData.weekStart}`}>
          {#snippet act()}
            <Button small variant="ghost" href="/chains">Edit chains</Button>
          {/snippet}
          <div class="chains-list">
            {#each chainWeekData.chains as c (c.id)}
              {@const isZero = c.sets === 0}
              <div class="chain-row" class:muted={isZero}>
                <div class="chain-info">
                  <span class="chain-name">{c.name}</span>
                  {#if isZero}
                    <span class="chain-status">no sets this week</span>
                  {:else}
                    <span class="chain-count">{c.sets} {c.sets === 1 ? "set touching" : "sets touching"}</span>
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
          <p class="pulse-sub">A set counts toward every chain its muscle groups overlap. Descriptive only — not a balance score.</p>
        </Panel>
      {/if}
    </div>
  {:else if tab === "history"}
    {#snippet rangeSwitch()}
      <div class="seg range" role="radiogroup" aria-label="History range">
        {#each HISTORY_RANGES as r (r.id)}
          <label class="seg-opt" class:on={range === r.id}>
            <input type="radio" name="history-range" value={r.id} bind:group={range} />
            {r.label}
          </label>
        {/each}
      </div>
    {/snippet}
    <div class="history-stack" id="panel-history" role="tabpanel" aria-labelledby="tab-history">
    <Panel title="Progress · {rangeInfo(range).label}" count="est. 1RM · Epley" act={rangeSwitch} aria-busy={historyLoading}>
      <div class="hist-body" class:stale={historyLoading && historyLogs !== null}>
      {#if historyError}
        <div class="panel-body"><Note tone="warn">Couldn't load the history: {historyError}</Note></div>
      {:else if historyLogs === null}
        <div class="panel-body skel"><Skeleton h="14px" w="60%" /><Skeleton h="14px" w="80%" /><Skeleton h="14px" w="45%" /></div>
      {:else if lifts.length > 0}
        {#if historyCapped}
          <p class="cap-note">Showing the newest {historyLogs.length} sessions.</p>
        {/if}
        <div class="table-wrap">
          <table class="sheet">
            <thead><tr><th>Lift</th><th>Trend</th><th class="r">Best e1RM</th><th>Recent sets</th></tr></thead>
            <tbody>
              {#each lifts as l (l.exerciseId)}
                <tr class:chart-on={chartLift === l.exerciseId}>
                  <td class="lift">
                    {#if l.series.length > 0}
                      <button type="button" class="lift-btn" aria-expanded={chartLift === l.exerciseId} aria-controls="lift-chart" onclick={() => toggleChart(l.exerciseId)}>{l.name}</button>
                    {:else}
                      {l.name}
                    {/if}
                    {#if l.main}<span class="main-tag" title="Power or Primary lift in a program">main</span>{/if}
                  </td>
                  <td class="trend">
                    {#if l.series.length > 1}
                      <button type="button" class="spark-btn" tabindex="-1" aria-hidden="true" onclick={() => toggleChart(l.exerciseId)}>
                        <Sparkline series={l.series} unit={l.unit} />
                      </button>
                    {:else}
                      <span class="subtle">—</span>
                    {/if}
                  </td>
                  <td class="r">
                    {#if l.bestE1rm != null}
                      <span class="num big">{Math.round(l.bestE1rm)}</span><span class="unit">kg</span>
                    {:else}
                      <span class="num big" title={l.timed ? "Timed hold — no e1RM" : "No loaded sets"}>—</span>
                    {/if}
                  </td>
                  <td class="sets-cell">
                    <div class="sets">{#each l.recentSets as s, i (i)}<span class="setchip" title={logDateLabel(s.date)}><span class="rep">{s.label}</span></span>{/each}</div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if chartRow}
          <div id="lift-chart">
            <LiftChart name={chartRow.name} series={chartRow.series} unit={chartRow.unit} onclose={() => (chartLift = null)} />
          </div>
        {/if}
      {:else}
        <EmptyState>{range === "all" ? "No logged sets yet." : `No logged sets in ${rangeInfo(range).phrase}.`}</EmptyState>
      {/if}
      </div>
      {#if swaps.length > 0}
        <div class="panel-body swaps">
          <h3 class="swaps-title">Swaps <span class="counter">{swaps.length}</span></h3>
          <ul>
            {#each swaps as sw, i (i)}
              <li>
                <span class="swaps-day tnum">{shortDay(sw.date)}</span>
                <span><s>{exName(sw.fromExerciseId)}</s> → <strong>{exName(sw.toExerciseId)}</strong></span>
                <span class="subtle tnum">{sw.sets} {sw.sets === 1 ? "set" : "sets"}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </Panel>

    {#if historyWeeks.length > 0}
      <Panel title="Sessions" count={historySessions} class={historyLoading ? "stale" : undefined}>
        {#each historyWeeks as w (w.start)}
          <div class="wk-h">
            <span class="wk-name">{w.label}</span>
            <span class="subtle">{w.sessions.length} {w.sessions.length === 1 ? "session" : "sessions"}</span>
          </div>
          <ul class="sess-list">
            {#each w.sessions as s (s.id)}
              {@const open = openSessions.has(s.id)}
              <li class="sess" class:open>
                <div class="sess-row">
                  <button type="button" class="sess-btn" aria-expanded={open} aria-controls="sess-{s.id}" onclick={() => toggleSession(s.id)}>
                    <span class="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>
                    <span class="sess-date tnum">{s.dateLabel}</span>
                    <span class="sess-name">{s.name}</span>
                    <span class="sess-count subtle">{s.kind === "cardio" ? "cardio" : `${s.setCount} ${s.setCount === 1 ? "set" : "sets"}`}</span>
                  </button>
                  <a class="sess-prog" href="/programs/{s.programId}" title="Open {s.programName}">{s.programName}</a>
                </div>
                {#if open}
                  <div class="sess-body" id="sess-{s.id}">
                    {#if s.cardio}<p class="sess-line"><span class="setchip"><span class="rep">{s.cardio}</span></span></p>{/if}
                    {#each s.exercises as e (e.exerciseId)}
                      <div class="sess-ex">
                        <span class="sess-ex-name">{e.name}</span>
                        <span class="sess-sets">{#each e.sets as label, i (i)}<span class="setchip"><span class="rep">{label}</span></span>{/each}</span>
                      </div>
                    {/each}
                    {#if s.notes}<p class="sess-notes subtle">{s.notes}</p>{/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      </Panel>
    {/if}
    </div>
  {:else}
    <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings">
    <form
      class="pf"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <ProfileSection title="Contact" purpose="how you reach them">
        <ClientIdentityFields bind:name={idName} bind:email={idEmail} bind:phone={idPhone} idPrefix="p" showAll={idAttempted} />
      </ProfileSection>

      <ClientProfileFields bind:form idPrefix="p" catalog={catalogList} />

      <div class="pf-foot">
        <Button variant="primary" type="submit" disabled={saving || !profileDirty}>{saving ? "Saving…" : "Save profile"}</Button>
        <span class="subtle" role="status">
          {#if saveProfileError}<span class="err">Save failed: {saveProfileError}</span>
          {:else if profileDirty}Unsaved changes
          {:else if profileSaved}Saved{/if}
        </span>
      </div>
    </form>
    </div>
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
    border: 1px solid var(--warn-line);
    border-radius: 6px;
    padding: 13px 15px;
  }
  .limit-panel .side-h { color: var(--warn); }
  .limit-panel p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--warn-ink); }
  .goals { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink); }

  .heat { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .heat i { width: 13px; height: 13px; border-radius: 4px; display: block; border: 1px solid var(--cell-edge); }
  .heat .h1 { background: var(--done-1); }
  .heat .h2 { background: var(--done-2); }
  .heat .h3 { background: var(--done-3); }
  .heat .h4 { background: var(--done-4); }
  .heat .h0 { background: transparent; border: 1px dashed var(--line); }
  .heat-l { font: 400 11px/1 var(--font-ui); color: var(--faint); margin-right: 6px; }

  .pulse-now td { background: var(--pulse-now-bg); }
  .cell-btn {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline dotted var(--faint);
    text-underline-offset: 3px;
  }
  .cell-btn:hover { color: var(--blue); text-decoration-color: currentColor; }
  .cell-btn[aria-expanded="true"] { color: var(--blue); text-decoration: underline solid; }
  .cell-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 2px; }
  .top-lift { font: 400 11.5px/1 var(--font-ui); color: var(--muted); margin-right: 6px; white-space: nowrap; }
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
  .bar-fill { height: 100%; background: var(--blue); border-radius: 4px; transition: width 0.2s ease; }
  .chain-row.muted .bar-fill { background: transparent; }
  .chart { padding: 14px 16px 0; border-bottom: 1px solid var(--line-soft); margin-bottom: 4px; }

  .table-wrap { overflow-x: auto; }
  .lift { font-weight: 500; }
  .unit { font-size: 12px; color: var(--faint); margin-left: 3px; font-weight: 400; }
  td.sets-cell { min-width: 220px; }
  .swaps { border-top: 1px solid var(--line); }
  .swaps-title { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font: 600 14px/1.3 var(--font-ui); }
  .swaps ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .swaps li { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 13px; }
  .swaps s { color: var(--muted); text-decoration-color: var(--line-strong); }
  .swaps-day { min-width: 52px; color: var(--muted); font-family: var(--font-mono); font-size: 12px; }

  /* History tab */
  .history-stack { display: flex; flex-direction: column; gap: 16px; }
  .hist-body { transition: opacity 0.15s ease; }
  .hist-body.stale, :global(.panel.stale) { opacity: 0.55; }
  .seg { display: inline-flex; margin-left: auto; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .seg-opt { position: relative; padding: 4px 10px; font: 400 12.5px/1.3 var(--font-ui); color: var(--muted); cursor: pointer; background: var(--well); white-space: nowrap; }
  .seg-opt + .seg-opt { border-left: 1px solid var(--line); }
  .seg-opt.on { background: var(--surface); color: var(--ink); font-weight: 600; }
  .seg-opt input { position: absolute; opacity: 0; pointer-events: none; }
  .seg-opt:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: -2px; }
  .skel { display: flex; flex-direction: column; gap: 10px; }
  .cap-note { margin: 0; padding: 8px 16px; font: 400 12.5px/1.4 var(--font-ui); color: var(--muted); border-bottom: 1px solid var(--line-soft); }
  .lift-btn, .spark-btn {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .lift-btn { text-decoration: underline dotted var(--faint); text-underline-offset: 3px; }
  .lift-btn:hover, .lift-btn[aria-expanded="true"] { color: var(--blue); text-decoration-color: currentColor; }
  .lift-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 2px; }
  .spark-btn { display: block; padding: 2px 0; }
  td.trend { width: 88px; }
  .chart-on td { background: var(--pulse-now-bg); }
  .main-tag {
    margin-left: 6px;
    font: 500 10.5px/1 var(--font-ui);
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 1px 6px;
    vertical-align: 1px;
  }
  .wk-h {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 16px 6px;
    border-top: 1px solid var(--line);
    background: var(--well);
    font-size: 12.5px;
  }
  .wk-name { font-weight: 600; color: var(--ink); }
  .sess-list { list-style: none; margin: 0; padding: 0; }
  .sess { border-top: 1px solid var(--line-soft); }
  .sess-row { display: flex; align-items: center; gap: 8px 12px; padding: 0 16px 0 8px; flex-wrap: wrap; }
  .sess-btn {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex: 1 1 260px;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: none;
    border: none;
    padding: 9px 8px;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
  }
  .sess-btn:hover .sess-name { text-decoration: underline; }
  .sess-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .chev { display: inline-flex; color: var(--faint); transform: rotate(-90deg); transition: transform 0.15s ease; align-self: center; }
  .sess.open .chev { transform: none; color: var(--muted); }
  .sess-date { min-width: 76px; color: var(--muted); font-family: var(--font-mono); font-size: 12px; }
  .sess-name { font-weight: 500; overflow-wrap: anywhere; }
  .sess-count { margin-left: auto; font-size: 12px; white-space: nowrap; }
  .sess-prog { font-size: 12px; color: var(--blue); text-decoration: none; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sess-prog:hover { text-decoration: underline; }
  .sess-body { padding: 2px 16px 12px 40px; display: flex; flex-direction: column; gap: 6px; }
  .sess-ex { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .sess-ex-name { font-size: 13px; font-weight: 500; min-width: 140px; }
  .sess-sets { display: flex; flex-wrap: wrap; gap: 4px; }
  .sess-line { margin: 0; }
  .sess-notes { margin: 0; font-size: 12.5px; white-space: pre-line; }
  @media (max-width: 520px) {
    .sess-body { padding-left: 16px; }
    .sess-ex-name { min-width: 0; flex: 1 1 100%; }
    .sess-prog { max-width: 100%; padding: 0 8px 8px 30px; }
  }

  .week-line { margin: 10px 16px 2px; font-size: 13px; color: var(--muted); }
  .day-h {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 12px 14px 0;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--muted);
  }
  .day-h .day-name { font-weight: 600; color: var(--ink); }
  .day-h .due { color: var(--blue); }
  .day-h .day-note { color: var(--faint); }
  .day-h .day-count { margin-left: auto; }

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
    background: var(--blue);
    border-radius: 4px;
    transition: width 0.2s ease;
  }
  .cardio-met { margin: 0; font: 600 12px/1.4 var(--font-ui); color: var(--good); }

  /* One column once the program side would drop under ~440px (sidebar open
     on an iPad, split view). */
  @container main (max-width: 760px) {
    .two-col { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 900px) {
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
