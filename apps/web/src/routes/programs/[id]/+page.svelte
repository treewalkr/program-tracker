<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { beforeNavigate } from "$app/navigation";
  import { api } from "$lib/api";
  import {
    addExercise,
    addSet,
    addSession,
    applyPlacementToAllWeeks,
    DEFAULT_DELOAD,
    deloadRulesText,
    type DeloadSettings,
    dissolveGroup,
    exerciseUnits,
    groupTag,
    linkWithNext,
    moveUnit,
    normalizeGroups,
    setGroupRounds,
    unlink,
    formatPatternBalance,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    nextSeq,
    sessionsPatternBalance,
    placeSession,
    placeSessions,
    removeSession,
    sessionFocus,
    sessionKey,
    sessionTag,
    sessionsByWeekday,
    oneRepMaxKg,
    type OneRepMaxes,
    type ProgramWeek,
    type SessionKind,
    type SignalProgram,
  } from "@pt/shared";
  import { EXAMPLE_LEVELS } from "@pt/shared";
  import type { ExerciseDto, ExerciseInput, ProgramDto, ProgramExampleDto, ProgramSessionDto, SessionLogDto, SessionTypeDto, SessionTypeInput } from "$lib/api/types";
  import { cardioLogLabel, extraSets, logDateLabel, loggedSetLabel, programLogView, setsForExercise, timedIdsOfWeek } from "$lib/programLogs";
  import { validateProgramDoc } from "$lib/programDoc";
  import { programSubline, snapshot } from "$lib/programEdit";
  import { isDeloaded, toggleDeload, type DeloadUndo } from "$lib/deloadUndo";
  import { clientDeload } from "$lib/draftReview";
  import ExerciseEditor from "$lib/components/ExerciseEditor.svelte";
  import ExerciseGroup from "$lib/components/ExerciseGroup.svelte";
  import GroupTag from "$lib/components/GroupTag.svelte";
  import SessionHeadEditor from "$lib/components/SessionHeadEditor.svelte";
  import WeekCalendar from "$lib/components/WeekCalendar.svelte";
  import PhasingEditor from "$lib/components/PhasingEditor.svelte";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Field from "$lib/ui/Field.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonHead from "$lib/ui/SkeletonHead.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const id = $derived(page.params.id ?? "");

  let program = $state<ProgramDto | null>(null);
  let clientName = $state<string | null>(null);
  /** This program's logs — shown under each session next to what was planned. */
  let logs = $state<SessionLogDto[]>([]);
  let trainingDays = $state<number[]>([]);
  /** The client's run days and long-run day, for Auto-place (placement.ts). */
  let cardioDays = $state<number[] | null>(null);
  let longRunDay = $state<number | null>(null);
  /** The client's 1RMs: %1RM sets show (and plan) their kg. */
  let oneRepMaxes = $state<OneRepMaxes | null>(null);
  /** The client's deload rule in force — the Deload button applies it. */
  let deload = $state<DeloadSettings>(DEFAULT_DELOAD);
  /** Placement edits apply to every week (the block's template) unless narrowed to this week. */
  let placeAllWeeks = $state(true);
  let selected = $state<string | null>(null);
  let catalog = $state<ExerciseDto[]>([]);
  /** New exercise from the picker: save to the library, keep the catalog in sync. */
  async function addToLibrary(input: ExerciseInput) {
    const created = await api.createExercise(input);
    catalog.push(created);
    return created;
  }
  const catalogById = $derived(new Map(catalog.map((e) => [e.id, e])));
  let types = $state<SessionTypeDto[]>([]);
  async function addType(input: SessionTypeInput) {
    const created = await api.createSessionType(input);
    types.push(created);
    return created;
  }
  /** A type labels the session for the whole block: copy it to the same session (kind + seq) in every week. */
  function labelAllWeeks(key: string, t: SessionTypeDto) {
    if (!program) return;
    for (const w of program.weeks) {
      for (const x of w.sessions) {
        if (sessionKey(x) === key && x.kind === t.format) {
          x.typeId = t.id;
          x.typeName = t.name;
        }
      }
    }
  }
  /** Saved state of the program; edits are live on `program` and compared against this. */
  let baseline = $state("");
  let openExercise = $state<string | null>(null);
  let openSession = $state<string | null>(null);
  let showPhasing = $state(false);
  /** Bumped by Discard: the phasing editor keeps its own rows, so it must remount to show the restored plan. */
  let phasingResets = $state(0);
  let saveError = $state<string | null>(null);
  const editable = $derived(program != null && program.status !== "archived");
  /** Replace a session's exercises in the open week; groups are tidied on every edit. */
  function setExercises(si: number, list: ProgramSessionDto["exercises"]) {
    if (!currentWeek) return;
    currentWeek.sessions[si] = { ...currentWeek.sessions[si], exercises: normalizeGroups(list).map((e, i) => ({ ...e, order: i })) };
  }
  const dirty = $derived(program != null && baseline !== "" && snapshot(program) !== baseline);
  let saving = $state(false);
  let savedAt = $state<string | null>(null);
  let activating = $state(false);
  let currentWeekIndex = $state(0);

  let existingExample = $state<ProgramExampleDto | null>(null);
  let marking = $state(false);
  let markGoal = $state("");
  let markLevel = $state<ProgramExampleDto["level"]>("intermediate");
  let markNote = $state("");
  let savingMark = $state(false);
  let markError = $state<string | null>(null);

  const weekIndex = $derived(program?.weeks[currentWeekIndex] ? currentWeekIndex : 0);
  const currentWeek = $derived(program?.weeks[weekIndex] ?? null);
  const patternOf = (exerciseId: string) => catalogById.get(exerciseId)?.movementPattern ?? null;
  const focusOf = (s: ProgramSessionDto) => sessionFocus(s, patternOf);
  /** Sessions in calendar order: Mon → Sun, then unscheduled. */
  const ordered = $derived.by(() => {
    if (!currentWeek) return [];
    const by = sessionsByWeekday(currentWeek.sessions);
    return [1, 2, 3, 4, 5, 6, 7, 0].flatMap((d) => by.get(d)!.map((s) => ({ s, day: d })));
  });
  const logView = $derived(program ? programLogView(program as SignalProgram, logs) : null);
  const timedIds = $derived(timedIdsOfWeek(currentWeek));
  const isTimed = (e: { id: string; exerciseId: string }) => timedIds.has(e.id) || timedIds.has(e.exerciseId);
  const logsOf = (sid: string) => logView?.bySession.get(sid) ?? [];
  const weekLogCount = (w: ProgramWeek, wi: number) =>
    w.sessions.reduce((n, s) => n + logsOf(s.id).length, 0) + (logView?.otherByWeek.get(wi)?.length ?? 0);
  const nameOf = (exerciseId: string) => catalogById.get(exerciseId)?.name ?? "Exercise";
  const liftingCount = (w: ProgramWeek) => w.sessions.filter((s) => s.kind === "lifting").length;
  const indexOf = (sid: string) => currentWeek?.sessions.findIndex((x) => x.id === sid) ?? -1;

  function setWeek(next: ProgramWeek) {
    if (!program) return;
    program.weeks[weekIndex] = next;
  }

  function place(sid: string, weekday: number | null, index: number) {
    if (!program || !currentWeek) return;
    setWeek(placeSession($state.snapshot(currentWeek) as ProgramWeek, sid, weekday, index));
    if (placeAllWeeks) program.weeks = applyPlacementToAllWeeks($state.snapshot(program.weeks) as ProgramWeek[], currentWeek.week);
  }

  function autoPlace() {
    if (!program) return;
    // Each week on its own: the rules are deterministic, so identical weeks land identically.
    program.weeks = ($state.snapshot(program.weeks) as ProgramWeek[]).map((w) => ({
      ...w,
      sessions: placeSessions(w.sessions, { trainingDays, cardioDays, longRunDay }, patternOf),
    }));
  }

  function addNewSession(kind: SessionKind) {
    if (!currentWeek) return;
    const next = addSession($state.snapshot(currentWeek) as ProgramWeek, kind, null);
    setWeek(next);
    const added = next.sessions.at(-1)!;
    openSession = added.id;
    openExercise = null;
    selected = added.id;
  }

  function select(sid: string) {
    selected = sid;
    document.getElementById(`sess-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const validation = $derived(
    program ? validateProgramDoc(program.weeks) : { ok: true as const }
  );

  async function load() {
    program = await api.program(id);
    baseline = snapshot(program);
    deloadUndo = new Map();
    [catalog, types] = await Promise.all([api.exercises(), api.sessionTypes()]);
    const mine = await api.examples(id);
    existingExample = mine[0] ?? null;
    if (!existingExample) marking = false;
    if (program?.clientId) {
      const detail = await api.client(program.clientId);
      clientName = detail.client.name;
      trainingDays = detail.client.trainingDays ?? [];
      cardioDays = detail.client.cardioDays ?? null;
      longRunDay = detail.client.longRunDay ?? null;
      oneRepMaxes = detail.client.oneRepMaxes ?? null;
      deload = clientDeload(detail.client);
      logs = await api.sessionLogs(program.clientId, program.id).catch(() => []);
    }
  }

  async function markAsExample() {
    if (!program || !markGoal.trim()) return;
    savingMark = true;
    markError = null;
    try {
      existingExample = await api.createExample({
        programId: program.id,
        goal: markGoal.trim(),
        level: markLevel,
        note: markNote.trim() || undefined,
      });
      marking = false;
      markGoal = "";
      markNote = "";
    } catch (e) {
      markError = (e as Error).message;
    } finally {
      savingMark = false;
    }
  }

  async function removeFromLibrary() {
    if (!existingExample) return;
    await api.deleteExample(existingExample.id);
    existingExample = null;
  }

  async function save() {
    if (!program || !validation.ok) return;
    saving = true;
    saveError = null;
    try {
      program = await api.saveProgram(program.id, program.weeks, program.phasing ?? null);
      baseline = snapshot(program);
      savedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      openExercise = null;
      openSession = null;
    } catch (e) {
      saveError = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  function discard() {
    if (!program || !baseline) return;
    const saved = JSON.parse(baseline);
    program.weeks = saved.weeks;
    program.phasing = saved.phasing;
    phasingResets++;
    openExercise = null;
    openSession = null;
    saveError = null;
  }

  beforeNavigate((nav) => {
    if (!dirty) return;
    // Closing or reloading the tab: cancel() raises the browser's own prompt; confirm() is blocked there.
    if (nav.type === "leave") nav.cancel();
    else if (!confirm("Leave without saving your program changes?")) nav.cancel();
  });

  async function activate() {
    if (!program) return;
    activating = true;
    try {
      program = await api.setProgramStatus(program.id, "active");
    } finally {
      activating = false;
    }
  }

  /** Deload the viewed week by the client's rule (deloadWeek); the week-1 basis reads week 1's loads. */
  /** Pre-deload copies per week, so a second press undoes instead of deloading twice. */
  let deloadUndo = $state.raw<DeloadUndo>(new Map());
  const weekDeloaded = $derived(currentWeek ? isDeloaded(deloadUndo, $state.snapshot(currentWeek) as ProgramWeek) : false);

  function applyDeload() {
    if (!currentWeek) return;
    const undo = new Map(deloadUndo);
    const week1 = deload.loadBasis === "week1" ? ($state.snapshot(program?.weeks.find((w) => w.week === 1) ?? program?.weeks[0]) as ProgramWeek | undefined) : undefined;
    setWeek(toggleDeload(undo, $state.snapshot(currentWeek) as ProgramWeek, $state.snapshot(deload), week1));
    deloadUndo = undo;
  }

  onMount(load);

  const DAY_NAMES = ["Any day", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
</script>

<svelte:head><title>{program?.name ?? "Program"} · Program Tracker</title></svelte:head>

{#if program === null}
  <SkeletonHead actions={2} label="Loading program…" />
  <div class="sessions-grid">
    {#each { length: 4 }, i (i)}<SkeletonPanel head rows={i % 2 ? 3 : 4} dense />{/each}
  </div>
{:else}
  <div class="page-head">
    <div>
      <Crumbs items={[{ href: `/clients/${program.clientId}`, label: clientName ?? "Client" }, { label: "Program" }]} />
      <h1>{program.name} <StatusPill status={program.status} /></h1>
      <p class="sub">{programSubline(program, savedAt)}</p>
    </div>
    <div class="actions">
      {#if program.status === "archived"}
        <span class="subtle readonly-note">archived — read only</span>
      {:else}
        {#if existingExample}
          <span class="subtle lib-state">In the example library</span>
          <a class="lib-link" href="/examples">View in library →</a>
          <ConfirmButton label="Remove" confirmLabel="Really remove?" onconfirm={removeFromLibrary} small />
        {:else if marking}
          <button class="btn ghost" onclick={() => (marking = false)}>Cancel mark</button>
        {:else}
          <button class="btn ghost" onclick={() => { marking = true; markError = null; }}>Mark as example</button>
        {/if}
        {#if program.status === "draft"}
          <button class="btn primary" onclick={activate} disabled={activating}>
            {activating ? "Activating…" : "Activate program"}
          </button>
        {/if}
      {/if}
    </div>
  </div>

  {#if marking && !existingExample}
    <form
      class="mark-form"
      onsubmit={(e) => {
        e.preventDefault();
        markAsExample();
      }}
    >
      <Field label="Goal" htmlFor="ex-goal">
        <input
          class="input"
          id="ex-goal"
          placeholder="e.g. first pull-up, 5k time, lean bulk"
          bind:value={markGoal}
          maxlength="120"
        />
      </Field>
      <Field label="Level" htmlFor="ex-level">
        <select class="input" id="ex-level" bind:value={markLevel}>
          {#each EXAMPLE_LEVELS as l (l)}
            <option value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
          {/each}
        </select>
      </Field>
      <Field label="Note" htmlFor="ex-note">
        <textarea
          class="textarea"
          id="ex-note"
          rows="2"
          maxlength="500"
          placeholder="optional — when to reuse this block"
          bind:value={markNote}
        ></textarea>
      </Field>
      <div class="mark-actions">
        <p class="hint">Days/week defaults to the program's lifting sessions per week ({liftingCount(program.weeks[0])}).</p>
        <button class="btn primary" type="submit" disabled={savingMark || !markGoal.trim()}>
          {savingMark ? "Adding…" : "Add to example library"}
        </button>
      </div>
      {#if markError}<p class="hint gate-error">{markError}</p>{/if}
    </form>
  {/if}

  {#if program.status === "draft"}
    <p class="hint">
      Draft — the client doesn't see it yet. Drag sessions to place them on the week, click any exercise to tweak it, then activate
      (the previous active program archives automatically).
    </p>
  {:else if program.status === "archived"}
    <p class="hint">Archived block — kept for history. Start a new block from the client page.</p>
  {/if}

  {#if program.weeks.length > 1}
    <div class="week-tabs">
      {#each program.weeks as w, wi (w.week)}
        <button
          type="button"
          class="tab-btn"
          class:active={wi === currentWeekIndex}
          onclick={() => (currentWeekIndex = wi)}
        >
          W{w.week}
          {#if weekLogCount(w, wi) > 0}<span class="tab-logs" title="{weekLogCount(w, wi)} logged">{weekLogCount(w, wi)}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if currentWeek}
    <div class="week-bar">
      <p class="balance">Week {currentWeek.week} balance — {formatPatternBalance(sessionsPatternBalance(currentWeek.sessions, patternOf))}</p>
      {#if editable}
        <button class="btn ghost small" onclick={applyDeload} title={weekDeloaded ? `Restore week ${currentWeek.week} as it was before the deload` : `Deload week ${currentWeek.week}: ${deloadRulesText(deload)}`}>{weekDeloaded ? "Undo deload" : "Deload this week"}</button>
        <button class="btn ghost small" aria-expanded={showPhasing} onclick={() => (showPhasing = !showPhasing)}>Block phasing {showPhasing ? "▴" : "▾"}</button>
      {/if}
    </div>

    {#if editable && showPhasing}
      {#key phasingResets}
        <PhasingEditor
          bind:phasing={program.phasing}
          weeksCount={program.weeks.length}
          weeks={program.weeks}
          {oneRepMaxes}
          onapply={(next) => { if (program) program.weeks = $state.snapshot(next) as ProgramWeek[]; }}
        />
      {/key}
    {/if}

    {#if editable}
      <div class="cal-bar">
        {#if program.weeks.length > 1}
          <div class="scope" role="radiogroup" aria-label="Placement changes apply to">
            <span class="subtle">Moves apply to</span>
            <button type="button" role="radio" aria-checked={placeAllWeeks} class:on={placeAllWeeks} onclick={() => (placeAllWeeks = true)}>every week</button>
            <button type="button" role="radio" aria-checked={!placeAllWeeks} class:on={!placeAllWeeks} onclick={() => (placeAllWeeks = false)}>week {currentWeek.week} only</button>
          </div>
        {/if}
        <span class="grow"></span>
        {#if trainingDays.length > 0}
          <button class="btn ghost small" onclick={autoPlace} title="Spread sessions over the client's lifting and run days (heavy lower days away from key runs, long run on its day), for every week">Auto-place</button>
        {/if}
        {#if currentWeek.sessions.length < 14}
          <button class="btn ghost small" onclick={() => addNewSession("lifting")}>+ Lifting session</button>
          <button class="btn ghost small" onclick={() => addNewSession("cardio")}>+ Cardio session</button>
        {/if}
      </div>
    {/if}

    <WeekCalendar sessions={currentWeek.sessions} {editable} {focusOf} {selected} onplace={place} onselect={select} />

    <div class="sessions-grid">
      {#each ordered as { s, day } (s.id)}
        {@const si = indexOf(s.id)}
        <section class="panel" class:sel={selected === s.id} id="sess-{s.id}">
          <div class="panel-head">
            <span class="eyebrow">{DAY_NAMES[day]} · {sessionTag(s)}{#if s.typeName}{" · "}<span class="stype">{s.typeName}</span>{/if}</span>
            {#if s.kind === "lifting"}<span class="subtle">{formatPatternBalance(sessionsPatternBalance([s], patternOf))}</span>{/if}
          </div>

          <div class="panel-body exlist">
            <div class="session-block">
              {#if openSession === s.id}
                <SessionHeadEditor
                  bind:session={currentWeek.sessions[si]}
                  {types}
                  oncreatetype={addType}
                  ontype={(t) => labelAllWeeks(sessionKey(currentWeek.sessions[si]), t)}
                  nextSeqFor={(kind) => nextSeq(currentWeek.sessions.filter((x) => x.id !== s.id), kind)}
                  onday={(wd) => place(s.id, wd, 99)}
                  onremove={() => { if (currentWeek) setWeek(removeSession($state.snapshot(currentWeek) as ProgramWeek, s.id)); openSession = null; }}
                  onclose={() => (openSession = null)}
                />
              {:else}
                <div class="session-header">
                  <h3>{s.name}</h3>
                  {#if editable}
                    <button class="edit-link" onclick={() => { openSession = s.id; openExercise = null; }}>Edit session</button>
                  {/if}
                </div>
                {#if s.notes}<p class="subtle sess-notes">{s.notes}</p>{/if}
              {/if}
              {#if logsOf(s.id).length > 0}
                <div class="logged">
                  <span class="logged-tag"><Icon name="check" size={12} /> Logged {logsOf(s.id).map((l) => logDateLabel(l.date)).join(", ")}</span>
                  {#each logsOf(s.id) as l (l.id)}
                    {#if s.kind === "cardio" && l.cardio}<span class="log-chip">{cardioLogLabel(l.cardio)}</span>{/if}
                    {#if l.notes}<p class="subtle log-notes">{l.notes}</p>{/if}
                    {@const extras = s.kind === "lifting" ? extraSets(l, s.exercises) : []}
                    {#if extras.length > 0}
                      <p class="subtle log-notes">
                        Also logged ({logDateLabel(l.date)}): {extras.map((x) => `${nameOf(x.exerciseId)} ${loggedSetLabel(x, false)}`).join(" · ")}
                      </p>
                    {/if}
                  {/each}
                </div>
              {/if}

              {#if s.kind === "cardio"}
                {#if s.cardio && openSession !== s.id}
                  <div class="cardio-display">
                    <span class="cond-chip">
                      <Icon name="pulse" />
                      {[
                        s.cardio.modality,
                        s.cardio.durationMin ? `${s.cardio.durationMin} min` : null,
                        s.cardio.hrZone ? `Z${s.cardio.hrZone}` : null,
                        s.cardio.intensity || null,
                        s.cardio.distanceKm ? `${s.cardio.distanceKm} km` : null,
                        s.cardio.targetRpe ? `RPE ${s.cardio.targetRpe}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                {/if}
              {:else}
                {#snippet exitem(e: (typeof s.exercises)[number], ei: number, first: boolean, last: boolean)}
                  {#if openExercise === e.id}
                    <ExerciseEditor
                      bind:exercise={currentWeek.sessions[si].exercises[ei]}
                      session={s.exercises}
                      {catalog}
                      oneRepMaxKg={oneRepMaxKg(oneRepMaxes, e.exerciseId)}
                      oncreate={addToLibrary}
                      tag={groupTag(s.exercises, ei)}
                      canMoveUp={!first}
                      canMoveDown={!last}
                      onmoveup={() => setExercises(si, moveUnit(s.exercises, ei, -1))}
                      onmovedown={() => setExercises(si, moveUnit(s.exercises, ei, 1))}
                      onremove={() => { setExercises(si, s.exercises.filter((_, j) => j !== ei)); openExercise = null; }}
                      onlink={ei < s.exercises.length - 1 ? () => setExercises(si, linkWithNext(s.exercises, ei)) : undefined}
                      onunlink={() => setExercises(si, unlink(s.exercises, ei))}
                      onclose={() => (openExercise = null)}
                    />
                  {:else}
                    {@const pattern = patternOf(e.exerciseId)}
                    <div class="exblock" class:editable>
                      <div class="exhead">
                        {#if e.group}<GroupTag tag={groupTag(s.exercises, ei) ?? e.group} />{/if}
                        {#if e.role}<RoleChip role={e.role} />{/if}
                        {#if editable}
                          <button class="exname" onclick={() => { openExercise = e.id; openSession = null; }} title="Edit {e.exerciseName}">{e.exerciseName}</button>
                        {:else}
                          <strong>{e.exerciseName}</strong>
                        {/if}
                        {#if pattern && pattern in MOVEMENT_PATTERN_INFO}
                          {@const p = pattern as MovementPattern}
                          <span class="mp-tag" title={MOVEMENT_PATTERN_INFO[p].description}>{MOVEMENT_PATTERN_INFO[p].label}</span>
                        {/if}
                      </div>
                      {#if e.notes}<p class="subtle exnotes">{e.notes}</p>{/if}
                      <SetChips sets={e.prescribedSets} oneRepMaxKg={oneRepMaxKg(oneRepMaxes, e.exerciseId)} />
                      {#each logsOf(s.id) as l (l.id)}
                        {@const done = setsForExercise(l, e)}
                        {#if done.length > 0}
                          <div class="logline">
                            <span class="log-date">{logDateLabel(l.date)}</span>
                            {#each done as d, di (di)}<span class="log-chip">{loggedSetLabel(d, isTimed(e))}</span>{/each}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                {/snippet}
                {#each exerciseUnits(s.exercises) as u, ui (u.items[0].id)}
                  {@const lastUnit = u.start + u.items.length === s.exercises.length}
                  {#if u.group}
                    {@const g = u.group}
                    <ExerciseGroup
                      group={g}
                      count={u.items.length}
                      rounds={u.items[0].prescribedSets.length}
                      onrounds={editable ? (n) => setExercises(si, setGroupRounds(s.exercises, g, n)) : undefined}
                      canMoveUp={ui > 0}
                      canMoveDown={!lastUnit}
                      onmoveup={editable ? () => setExercises(si, moveUnit(s.exercises, u.start, -1, "unit")) : undefined}
                      onmovedown={editable ? () => setExercises(si, moveUnit(s.exercises, u.start, 1, "unit")) : undefined}
                      onungroup={editable ? () => setExercises(si, dissolveGroup(s.exercises, g)) : undefined}
                    >
                      {#each u.items as e, k (e.id)}
                        {@render exitem(e, u.start + k, k === 0, k === u.items.length - 1)}
                      {/each}
                    </ExerciseGroup>
                  {:else}
                    {@render exitem(u.items[0], u.start, ui === 0, lastUnit)}
                  {/if}
                  {#if !lastUnit}<hr class="divider" />{/if}
                {/each}
                {#if editable && s.exercises.length < 20}
                  <button
                    class="add-link"
                    onclick={() => {
                      const first = catalog[0];
                      if (!currentWeek || !first) return;
                      const sess = addExercise(currentWeek.sessions[si], first.id, first.name);
                      const last = sess.exercises.length - 1;
                      sess.exercises[last] = addSet(sess.exercises[last]);
                      currentWeek.sessions[si] = sess;
                      openExercise = sess.exercises[last].id;
                      openSession = null;
                    }}>+ Exercise</button
                  >
                {/if}
              {/if}
            </div>
          </div>
        </section>
      {/each}
    </div>

    {#if (logView?.otherByWeek.get(weekIndex)?.length ?? 0) > 0}
      <section class="panel other-logs">
        <div class="panel-head"><span class="eyebrow">Also logged in week {currentWeek.week}</span></div>
        <div class="panel-body exlist">
          {#each logView?.otherByWeek.get(weekIndex) ?? [] as l (l.id)}
            <div class="logline">
              <span class="log-date">{logDateLabel(l.date)}</span>
              {#if l.kind === "cardio"}
                <span class="log-chip">{cardioLogLabel(l.cardio)}</span>
              {:else}
                {#each l.sets as d, di (di)}<span class="log-chip">{nameOf(d.exerciseId)} {loggedSetLabel(d, false)}</span>{/each}
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  {#if dirty}
    <div class="savebar" role="region" aria-label="Unsaved changes">
      <span class="savemsg">
        {#if !validation.ok}
          <span class="gate-error">{validation.message}</span>
        {:else if saveError}
          <span class="gate-error">Save failed: {saveError}</span>
        {:else}
          Unsaved changes · saving makes v{program.version + 1}. Clients log their own actual weights.
        {/if}
      </span>
      <button class="btn ghost small" onclick={discard} disabled={saving}>Discard</button>
      <button class="btn primary small" onclick={save} disabled={saving || !validation.ok}>{saving ? "Saving…" : "Save changes"}</button>
    </div>
  {/if}
{/if}

<style>
  h1 { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .lib-state { font-size: 13px; }
  .lib-link { font-size: 13px; color: var(--muted); text-decoration: none; }
  .lib-link:hover { text-decoration: underline; }

  .mark-form {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr;
    gap: 14px;
    align-items: start;
    padding: 14px 18px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    margin-bottom: 14px;
    background: var(--panel, transparent);
  }
  .mark-actions { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .mark-actions .hint { margin: 0; }
  @media (max-width: 980px) { .mark-form { grid-template-columns: 1fr; } }
  .readonly-note { margin: 0; }
  .hint { color: var(--muted); margin: -8px 0 16px; max-width: 640px; }

  .week-tabs { display: flex; gap: 6px; overflow-x: auto; margin: 0 0 16px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .tab-btn {
    border: none;
    background: none;
    padding: 6px 14px;
    font: 600 13px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
    border-radius: var(--radius);
  }
  .tab-btn.active {
    background: var(--well);
    color: var(--ink);
  }
  .tab-btn:hover:not(.active) {
    background: var(--well-2);
  }

  .sessions-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }

  .exlist { display: flex; flex-direction: column; gap: 12px; }
  .gate-error { color: var(--bad); }
  .session-block { display: flex; flex-direction: column; gap: 8px; }
  .session-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .session-header h3 { margin: 0; font: 600 13px var(--font-ui); color: var(--ink); }
  .cardio-display { margin: 2px 0 4px; }

  .exblock .exhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }

  .mp-tag {
    display: inline-flex;
    align-items: center;
    font: 500 11px/1 var(--font-ui);
    padding: 1px 6px;
    border-radius: 99px;
    border: 1px solid var(--line);
    background: var(--well);
    color: var(--muted);
    white-space: nowrap;
    margin-left: 6px;
  }
  .cond-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 500 12px var(--font-ui);
    color: var(--muted);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 2px 10px;
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cond-chip :global(svg) { width: 10px; height: 10px; fill: currentColor; flex: none; }
  .divider { border: none; border-top: 1px solid var(--line); margin: 8px 0; }
  .week-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -6px 0 14px; }
  .balance { margin: 0 auto 0 0; color: var(--muted); }
  .cal-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; }
  .grow { flex: 1; }
  .scope { display: inline-flex; align-items: center; gap: 0; font-size: 12.5px; }
  .scope .subtle { margin-right: 8px; }
  .scope button {
    border: 1px solid var(--line);
    background: none;
    font: 500 12px var(--font-ui);
    color: var(--muted);
    padding: 3px 10px;
    cursor: pointer;
  }
  .scope button:first-of-type { border-radius: var(--radius) 0 0 var(--radius); }
  .scope button + button { border-left: none; border-radius: 0 var(--radius) var(--radius) 0; }
  .scope button.on { background: var(--well-2); color: var(--ink); font-weight: 600; }
  .eyebrow { font: 500 11.5px var(--font-mono); color: var(--muted); text-transform: uppercase; letter-spacing: 0.02em; margin-right: auto; }
  .stype { color: var(--ink); }
  .panel.sel { border-color: var(--focus); }
  .panel { scroll-margin-top: 16px; }
  .session-header .edit-link { margin-left: auto; }
  .edit-link, .add-link {
    border: none;
    background: none;
    padding: 2px 0;
    font: 500 12px var(--font-ui);
    color: var(--blue);
    cursor: pointer;
  }
  .edit-link:hover, .add-link:hover { text-decoration: underline; }
  .add-link { align-self: flex-start; }
  .sess-notes, .exnotes { margin: 0; font-size: 12.5px; }

  /* What was done, under what was planned */
  .tab-logs {
    margin-left: 6px;
    font: 600 10.5px/1 var(--font-mono, ui-monospace, monospace);
    padding: 2px 5px;
    border-radius: 99px;
    background: var(--good-bg, var(--well-2));
    color: var(--good, var(--ink));
  }
  .logged { display: flex; flex-direction: column; gap: 4px; }
  .logged-tag { display: inline-flex; align-items: center; gap: 5px; font: 600 11.5px var(--font-ui); color: var(--good, var(--muted)); }
  .log-notes { margin: 0; font-size: 12px; white-space: pre-line; }
  .logline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; margin-top: 6px; }
  .log-date { font: 500 11px var(--font-ui); color: var(--muted); min-width: 72px; }
  .log-chip {
    font: 500 11.5px/1.5 var(--font-mono, ui-monospace, monospace);
    padding: 0 6px;
    border-radius: 4px;
    background: var(--well);
    color: var(--ink);
  }
  .other-logs { margin-top: 18px; }
  .exnotes { margin: -4px 0 8px; }
  .exname {
    border: none;
    background: none;
    padding: 0;
    font: 600 14px var(--font-ui);
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }
  .exblock.editable { border-radius: var(--radius); margin: 0 -8px; padding: 4px 8px; }
  .exblock.editable:hover { background: var(--well); }
  .exname:hover { text-decoration: underline; text-decoration-color: var(--faint); }

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
