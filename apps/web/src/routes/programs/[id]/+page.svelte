<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { fmtDuration } from "$lib/format";
  import {
    addSession,
    formatPatternBalance,
    moveSession,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    patternBalance,
    removeSession,
  } from "@pt/shared";
  import type { ExerciseRole } from "@pt/shared";
  import { EXAMPLE_LEVELS } from "@pt/shared";
  import type { ExerciseDto, ProgramDto, ProgramExampleDto, ProgramSessionDto } from "$lib/api/types";
  import { validateProgramDoc } from "$lib/programDoc";
  import SessionBlockEditor from "$lib/components/SessionBlockEditor.svelte";
  import PhasingEditor from "$lib/components/PhasingEditor.svelte";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Field from "$lib/ui/Field.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");

  let program = $state<ProgramDto | null>(null);
  let clientName = $state<string | null>(null);
  let catalog = $state<ExerciseDto[]>([]);
  const catalogById = $derived(new Map(catalog.map((e) => [e.id, e])));
  let editing = $state(false);
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

  const currentWeek = $derived(
    program?.weeks[currentWeekIndex] ?? program?.weeks[0] ?? null
  );

  const validation = $derived(
    program ? validateProgramDoc(program.weeks) : { ok: true as const }
  );

  async function load() {
    program = await api.program(id);
    catalog = await api.exercises();
    const mine = await api.examples(id);
    existingExample = mine[0] ?? null;
    if (!existingExample) marking = false;
    if (program?.clientId) {
      const detail = await api.client(program.clientId);
      clientName = detail.client.name;
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
    try {
      program = await api.saveProgram(program.id, program.weeks, program.phasing ?? null);
      savedAt = new Date().toLocaleTimeString();
      editing = false;
    } finally {
      saving = false;
    }
  }

  async function activate() {
    if (!program) return;
    activating = true;
    try {
      program = await api.setProgramStatus(program.id, "active");
    } finally {
      activating = false;
    }
  }

  /** Deload: cut every working-set load target by ~10% on viewed week only, rounded to the 2.5kg grid. */
  function applyDeload() {
    if (!currentWeek) return;
    for (const d of currentWeek.days) {
      for (const s of d.sessions) {
        for (const e of s.exercises) {
          for (const ps of e.prescribedSets) {
            if (ps.type === "working" && ps.targetWeightKg != null) {
              ps.targetWeightKg = Math.max(0, Math.round((ps.targetWeightKg * 0.9) / 2.5) * 2.5);
            }
          }
        }
      }
    }
  }

  onMount(load);
</script>

<svelte:head><title>{program?.name ?? "Program"} · Program Tracker</title></svelte:head>

{#if program === null}
  <Skeleton h="140px" />
{:else}
  <div class="page-head">
    <div>
      <Crumbs items={[{ href: `/clients/${program.clientId}`, label: clientName ?? "Client" }, { label: "Program" }]} />
      <h1>{program.name} <StatusPill status={program.status} /></h1>
      <p class="sub">
        v{program.version}
        {#if program.aiAssisted} · AI-assisted draft{#if program.createdFromProgramId}, built on previous block{/if}{/if}
        {#if savedAt} · saved {savedAt}{/if}
      </p>
    </div>
    <div class="actions">
      {#if program.status === "archived"}
        <span class="subtle readonly-note">archived — read only</span>
      {:else if editing}
        {#if !validation.ok}
          <span class="hint gate-error">{validation.message}</span>
        {/if}
        <button class="btn ghost" onclick={applyDeload} title="Cut working-set loads ~10%, rounded to 2.5kg">Deload −10%</button>
        <button class="btn ghost" onclick={() => (editing = false)}>Done</button>
        <button class="btn primary" onclick={save} disabled={saving || !validation.ok}>{saving ? "Saving…" : "Save changes"}</button>
      {:else}
        <button class="btn ghost" onclick={() => (editing = true)}>Edit sets</button>
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
        <p class="hint">Days/week defaults to the program's day count ({program.weeks[0].days.length}).</p>
        <button class="btn primary" type="submit" disabled={savingMark || !markGoal.trim()}>
          {savingMark ? "Adding…" : "Add to example library"}
        </button>
      </div>
      {#if markError}<p class="hint gate-error">{markError}</p>{/if}
    </form>
  {/if}

  {#if program.status === "draft"}
    <p class="hint">
      Draft — nothing the client sees. Tweak sets, then activate to make it current
      (previous active program archives automatically).
    </p>
  {:else if program.status === "archived"}
    <p class="hint">Archived block — kept for history. Start a new block from the client page.</p>
  {:else if editing}
    <p class="hint">Editing bumps the version on save. Weights stay as prescribed — clients log actuals.</p>
    {#if !validation.ok}
      <p class="hint gate-error">{validation.message}</p>
    {/if}
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
        </button>
      {/each}
    </div>
  {/if}

  {#if currentWeek}
    {@const weekExercises = currentWeek.days.flatMap((d) =>
      d.sessions.flatMap((s) =>
        s.exercises.map((e) => ({ movementPattern: catalogById.get(e.exerciseId)?.movementPattern ?? null }))
      )
    )}
    <p class="hint">Week {currentWeek.week} balance — {formatPatternBalance(patternBalance(weekExercises))}</p>

    <div class="sessions-grid" class:editing>
      {#each currentWeek.days as d, di (d.id)}
        <section class="panel">
          <div class="panel-head">
            <h2>Day {d.day}</h2>
            {#if editing}
              <select class="select tiny" bind:value={d.weekday} aria-label="Day weekday">
                <option value={null}>No weekday</option>
                <option value={1}>Mon</option>
                <option value={2}>Tue</option>
                <option value={3}>Wed</option>
                <option value={4}>Thu</option>
                <option value={5}>Fri</option>
                <option value={6}>Sat</option>
                <option value={7}>Sun</option>
              </select>
            {:else if d.weekday}
              {@const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
              <span class="subtle">{dayNames[d.weekday]}</span>
            {/if}
            {#if !editing}
              {@const dayExercises = d.sessions.flatMap((s) =>
                s.exercises.map((e) => ({
                  movementPattern: catalogById.get(e.exerciseId)?.movementPattern ?? null,
                }))
              )}
              <span class="subtle">{formatPatternBalance(patternBalance(dayExercises))}</span>
            {/if}
            <span class="subtle">{d.sessions.reduce((acc, s) => acc + s.exercises.length, 0)} exercises</span>
          </div>

          <div class="panel-body exlist">
            {#if editing}
              <div class="session-list-edit">
                {#each d.sessions as _, si (d.sessions[si].id)}
                  <SessionBlockEditor
                    bind:session={currentWeek.days[di].sessions[si]}
                    {catalog}
                    canMoveUp={si > 0}
                    canMoveDown={si < d.sessions.length - 1}
                    onmoveup={() => {
                      if (currentWeek) currentWeek.days[di] = moveSession(currentWeek.days[di], si, si - 1);
                    }}
                    onmovedown={() => {
                      if (currentWeek) currentWeek.days[di] = moveSession(currentWeek.days[di], si, si + 1);
                    }}
                    onremove={() => {
                      if (currentWeek) currentWeek.days[di] = removeSession(currentWeek.days[di], si);
                    }}
                  />
                {/each}
                <button
                  type="button"
                  class="btn ghost small add-sess"
                  disabled={d.sessions.length >= 4}
                  onclick={() => {
                    if (currentWeek) currentWeek.days[di] = addSession(currentWeek.days[di]);
                  }}
                >
                  + Session
                </button>
              </div>
            {:else}
              {#each d.sessions as s, si (s.id)}
                <div class="session-block">
                  <div class="session-header">
                    <h3>{s.name}</h3>
                    <span class="kind-tag">{s.kind}</span>
                  </div>
                  {#if s.notes}<p class="subtle sess-notes">{s.notes}</p>{/if}

                  {#if s.kind === "cardio"}
                    <div class="cardio-display">
                      {#if s.cardio}
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
                      {/if}
                    </div>
                  {:else}
                    {#each s.exercises as e, ei (e.id)}
                      <div class="exblock">
                        <div class="exhead">
                          {#if e.role}<RoleChip role={e.role} />{/if}
                          <strong>{e.exerciseName}</strong>
                          {#if catalogById.get(e.exerciseId)?.movementPattern && catalogById.get(e.exerciseId)!.movementPattern! in MOVEMENT_PATTERN_INFO}
                            {@const p = catalogById.get(e.exerciseId)!.movementPattern as MovementPattern}
                            <span class="mp-tag" title={MOVEMENT_PATTERN_INFO[p].description}>{MOVEMENT_PATTERN_INFO[p].label}</span>
                          {/if}
                          {#if e.notes}<span class="subtle">{e.notes}</span>{/if}
                        </div>
                        <SetChips sets={e.prescribedSets} />
                      </div>
                      {#if ei < s.exercises.length - 1}<hr class="divider" />{/if}
                    {/each}
                  {/if}
                </div>
                {#if si < d.sessions.length - 1}<hr class="divider" />{/if}
              {/each}
            {/if}
          </div>
        </section>
      {/each}
    </div>

    {#if editing}
      <PhasingEditor bind:phasing={program.phasing} weeksCount={program.weeks.length} />
    {/if}
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
    border-radius: 10px;
    margin-bottom: 14px;
    background: var(--panel, transparent);
  }
  .mark-actions { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .mark-actions .hint { margin: 0; }
  @media (max-width: 980px) { .mark-form { grid-template-columns: 1fr; } }
  .readonly-note { margin: 0; }
  .hint { color: var(--muted); margin: -8px 0 16px; max-width: 640px; }

  .week-tabs { display: flex; gap: 6px; margin: 0 0 16px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
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

  .sessions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }

  .exlist { display: flex; flex-direction: column; gap: 12px; }
  .session-list-edit { display: flex; flex-direction: column; gap: 16px; }
  .add-sess { align-self: flex-start; }
  .gate-error { color: var(--bad); }
  .session-block { display: flex; flex-direction: column; gap: 8px; }
  .session-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .session-header h3 { margin: 0; font: 600 13px var(--font-ui); color: var(--ink); }
  .kind-tag {
    font: 500 11px/1 var(--font-mono);
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--well);
    color: var(--muted);
  }
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
    color: var(--good);
    background: var(--good-bg);
    border: 1px solid var(--good-line);
    border-radius: 99px;
    padding: 2px 10px;
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cond-chip :global(svg) { width: 10px; height: 10px; fill: var(--good); flex: none; }
  .divider { border: none; border-top: 1px solid var(--line); margin: 8px 0; }

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: 1fr; }
  }
</style>
