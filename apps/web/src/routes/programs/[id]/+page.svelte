<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { beforeNavigate } from "$app/navigation";
  import { api } from "$lib/api";
  import {
    addExercise,
    addSet,
    addSession,
    moveExercise,
    removeExercise,
    formatPatternBalance,
    moveSession,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    patternBalance,
    removeSession,
  } from "@pt/shared";
  import { EXAMPLE_LEVELS } from "@pt/shared";
  import type { ExerciseDto, ProgramDto, ProgramExampleDto, ProgramSessionDto } from "$lib/api/types";
  import { validateProgramDoc } from "$lib/programDoc";
  import { programSubline, snapshot } from "$lib/programEdit";
  import ExerciseEditor from "$lib/components/ExerciseEditor.svelte";
  import SessionHeadEditor from "$lib/components/SessionHeadEditor.svelte";
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
  /** Saved state of the program; edits are live on `program` and compared against this. */
  let baseline = $state("");
  let openExercise = $state<string | null>(null);
  let openSession = $state<string | null>(null);
  let showPhasing = $state(false);
  let saveError = $state<string | null>(null);
  const editable = $derived(program != null && program.status !== "archived");
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

  const currentWeek = $derived(
    program?.weeks[currentWeekIndex] ?? program?.weeks[0] ?? null
  );

  const validation = $derived(
    program ? validateProgramDoc(program.weeks) : { ok: true as const }
  );

  async function load() {
    program = await api.program(id);
    baseline = snapshot(program);
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
    openExercise = null;
    openSession = null;
    saveError = null;
  }

  beforeNavigate((nav) => {
    if (dirty && !confirm("Leave without saving your program changes?")) nav.cancel();
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

  const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
</script>

<svelte:head><title>{program?.name ?? "Program"} · Program Tracker</title></svelte:head>

{#if program === null}
  <Skeleton h="140px" />
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
      Draft — the client doesn't see it yet. Click any exercise to tweak it, then activate
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
    <div class="week-bar">
      <p class="balance">Week {currentWeek.week} balance — {formatPatternBalance(patternBalance(weekExercises))}</p>
      {#if editable}
        <button class="btn ghost small" onclick={applyDeload} title="Cut this week's working-set loads ~10%, rounded to 2.5kg">Deload week −10%</button>
        <button class="btn ghost small" aria-expanded={showPhasing} onclick={() => (showPhasing = !showPhasing)}>Block phasing {showPhasing ? "▴" : "▾"}</button>
      {/if}
    </div>

    {#if editable && showPhasing}
      <PhasingEditor bind:phasing={program.phasing} weeksCount={program.weeks.length} />
    {/if}

    <div class="sessions-grid">
      {#each currentWeek.days as d, di (d.id)}
        {@const dayExercises = d.sessions.flatMap((s) =>
          s.exercises.map((e) => ({ movementPattern: catalogById.get(e.exerciseId)?.movementPattern ?? null }))
        )}
        <section class="panel">
          <div class="panel-head">
            <h2>Day {d.day}</h2>
            {#if editable}
              <select class="select weekday" bind:value={d.weekday} aria-label="Day {d.day} weekday">
                <option value={null}>Any day</option>
                {#each [1, 2, 3, 4, 5, 6, 7] as wd (wd)}<option value={wd}>{DAY_NAMES[wd]}</option>{/each}
              </select>
            {:else if d.weekday}
              <span class="subtle">{DAY_NAMES[d.weekday]}</span>
            {/if}
            <span class="subtle">{formatPatternBalance(patternBalance(dayExercises))}</span>
          </div>

          <div class="panel-body exlist">
            {#each d.sessions as s, si (s.id)}
              <div class="session-block">
                {#if openSession === s.id}
                  <SessionHeadEditor
                    bind:session={currentWeek.days[di].sessions[si]}
                    canMoveUp={si > 0}
                    canMoveDown={si < d.sessions.length - 1}
                    onmoveup={() => { if (currentWeek) currentWeek.days[di] = moveSession(currentWeek.days[di], si, si - 1); }}
                    onmovedown={() => { if (currentWeek) currentWeek.days[di] = moveSession(currentWeek.days[di], si, si + 1); }}
                    onremove={() => { if (currentWeek) currentWeek.days[di] = removeSession(currentWeek.days[di], si); openSession = null; }}
                    onclose={() => (openSession = null)}
                  />
                {:else}
                  <div class="session-header">
                    <h3>{s.name}</h3>
                    <span class="kind-tag">{s.kind}</span>
                    {#if editable}
                      <button class="edit-link" onclick={() => { openSession = s.id; openExercise = null; }}>Edit session</button>
                    {/if}
                  </div>
                  {#if s.notes}<p class="subtle sess-notes">{s.notes}</p>{/if}
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
                  {#each s.exercises as e, ei (e.id)}
                    {#if openExercise === e.id}
                      <ExerciseEditor
                        bind:exercise={currentWeek.days[di].sessions[si].exercises[ei]}
                        {catalog}
                        canMoveUp={ei > 0}
                        canMoveDown={ei < s.exercises.length - 1}
                        onmoveup={() => { if (currentWeek) currentWeek.days[di].sessions[si] = moveExercise(currentWeek.days[di].sessions[si], ei, ei - 1); }}
                        onmovedown={() => { if (currentWeek) currentWeek.days[di].sessions[si] = moveExercise(currentWeek.days[di].sessions[si], ei, ei + 1); }}
                        onremove={() => { if (currentWeek) currentWeek.days[di].sessions[si] = removeExercise(currentWeek.days[di].sessions[si], ei); openExercise = null; }}
                        onclose={() => (openExercise = null)}
                      />
                    {:else}
                      {@const pattern = catalogById.get(e.exerciseId)?.movementPattern}
                      <div class="exblock" class:editable>
                        <div class="exhead">
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
                        <SetChips sets={e.prescribedSets} />
                      </div>
                    {/if}
                    {#if ei < s.exercises.length - 1}<hr class="divider" />{/if}
                  {/each}
                  {#if editable && s.exercises.length < 20}
                    <button
                      class="add-link"
                      onclick={() => {
                        const first = catalog[0];
                        if (!currentWeek || !first) return;
                        const sess = addExercise(currentWeek.days[di].sessions[si], first.id, first.name);
                        const last = sess.exercises.length - 1;
                        sess.exercises[last] = addSet(sess.exercises[last]);
                        currentWeek.days[di].sessions[si] = sess;
                        openExercise = sess.exercises[last].id;
                        openSession = null;
                      }}>+ Exercise</button
                    >
                  {/if}
                {/if}
              </div>
              {#if si < d.sessions.length - 1}<hr class="divider" />{/if}
            {/each}
            {#if editable && d.sessions.length < 4}
              <button
                class="add-link"
                onclick={() => {
                  if (!currentWeek) return;
                  currentWeek.days[di] = addSession(currentWeek.days[di]);
                  openSession = currentWeek.days[di].sessions.at(-1)?.id ?? null;
                  openExercise = null;
                }}>+ Session</button
              >
            {/if}
          </div>
        </section>
      {/each}
    </div>
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
    border-radius: 10px;
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
  .week-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -6px 0 14px; }
  .balance { margin: 0 auto 0 0; color: var(--muted); }
  .weekday { width: auto; padding: 2px 6px; font-size: 12.5px; }
  .session-header .edit-link { margin-left: auto; }
  .session-header .kind-tag { margin-left: 0; }
  .edit-link, .add-link {
    border: none;
    background: none;
    padding: 2px 0;
    font: 500 12px var(--font-ui);
    color: var(--accent, #0969da);
    cursor: pointer;
  }
  .edit-link:hover, .add-link:hover { text-decoration: underline; }
  .add-link { align-self: flex-start; }
  .sess-notes, .exnotes { margin: 0; font-size: 12.5px; }
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
  .savebar {
    position: sticky;
    bottom: 12px;
    z-index: 5;
    margin-top: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  }
  .savemsg { flex: 1; font-size: 12.5px; color: var(--muted); }

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
