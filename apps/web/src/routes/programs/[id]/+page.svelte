<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { fmtDuration } from "$lib/format";
  import {
    EXERCISE_ROLE_INFO,
    EXERCISE_ROLES,
    formatPatternBalance,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    patternBalance,
  } from "@pt/shared";
  import type { ExerciseRole } from "@pt/shared";
  import type { ExerciseDto, ProgramDto, ProgramSessionDto } from "$lib/api/types";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
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

  const currentWeek = $derived(
    program?.weeks[currentWeekIndex] ?? program?.weeks[0] ?? null
  );

  async function load() {
    program = await api.program(id);
    catalog = await api.exercises();
    if (program?.clientId) {
      const detail = await api.client(program.clientId);
      clientName = detail.client.name;
    }
  }

  async function save() {
    if (!program) return;
    saving = true;
    try {
      program = await api.saveProgram(program.id, program.weeks);
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

  function bumpSet(
    s: ProgramSessionDto,
    ei: number,
    di: number,
    field: "reps" | "targetRpe" | "restSeconds" | "targetWeightKg" | "duration",
    delta: number
  ) {
    const set = s.exercises[ei].prescribedSets[di];
    if (field === "reps") {
      if (set.repsMin != null) set.repsMin = Math.max(1, set.repsMin + delta);
      set.reps = Math.max(1, Math.min(100, set.reps + delta));
    } else if (field === "targetRpe") {
      set.targetRpe = Math.max(1, Math.min(10, (set.targetRpe ?? 5) + delta));
    } else if (field === "restSeconds") {
      set.restSeconds = Math.max(0, Math.min(600, (set.restSeconds ?? 120) + delta * 15));
    } else if (field === "duration") {
      set.durationSeconds = Math.max(5, (set.durationSeconds ?? 30) + delta * 15);
    } else {
      const cur = set.targetWeightKg ?? 20;
      set.targetWeightKg =
        delta > 0 ? Math.round((cur + 2.5) * 2) / 2 : Math.max(0, Math.round((cur - 2.5) * 2) / 2);
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

  function swapExercise(s: ProgramSessionDto, ei: number, exerciseId: string) {
    const e = s.exercises[ei];
    e.exerciseId = exerciseId;
    e.exerciseName = catalog.find((c) => c.id === exerciseId)?.name ?? exerciseId;
  }

  function setRole(s: ProgramSessionDto, ei: number, raw: string) {
    const role = EXERCISE_ROLES.includes(raw as ExerciseRole) ? (raw as ExerciseRole) : undefined;
    s.exercises[ei].role = role;
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
        <button class="btn ghost" onclick={applyDeload} title="Cut working-set loads ~10%, rounded to 2.5kg">Deload −10%</button>
        <button class="btn ghost" onclick={() => (editing = false)}>Done</button>
        <button class="btn primary" onclick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      {:else}
        <button class="btn ghost" onclick={() => (editing = true)}>Edit sets</button>
        {#if program.status === "draft"}
          <button class="btn primary" onclick={activate} disabled={activating}>
            {activating ? "Activating…" : "Activate program"}
          </button>
        {/if}
      {/if}
    </div>
  </div>

  {#if program.status === "draft"}
    <p class="hint">
      Draft — nothing the client sees. Tweak sets, then activate to make it current
      (previous active program archives automatically).
    </p>
  {:else if program.status === "archived"}
    <p class="hint">Archived block — kept for history. Start a new block from the client page.</p>
  {:else if editing}
    <p class="hint">Editing bumps the version on save. Weights stay as prescribed — clients log actuals.</p>
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
            {#each d.sessions as s, si (s.id)}
              <div class="session-block">
                <div class="session-header">
                  <h3>{s.name}</h3>
                  <span class="kind-tag">{s.kind}</span>
                </div>

                {#if s.kind === "cardio"}
                  {#if editing}
                    <div class="cardio-edit-fields">
                      <input
                        class="input"
                        placeholder="Modality (e.g. Bike, Run) *"
                        value={s.cardio?.modality ?? ""}
                        oninput={(ev) => {
                          s.cardio = {
                            ...(s.cardio ?? { modality: "", durationMin: null, hrZone: null, intensity: "", distanceKm: undefined, targetRpe: undefined }),
                            modality: ev.currentTarget.value,
                          };
                        }}
                        maxlength="80"
                        aria-label="Modality"
                      />
                      <div class="cardio-grid">
                        <label class="mini">Duration <input class="input tnum" type="number" min="1" max="300" value={s.cardio?.durationMin ?? ""} oninput={(ev) => { if (s.cardio) s.cardio.durationMin = ev.currentTarget.value ? Number(ev.currentTarget.value) : null; }} placeholder="min" /> min</label>
                        <label class="mini">Zone <input class="input tnum" type="number" min="1" max="5" value={s.cardio?.hrZone ?? ""} oninput={(ev) => { if (s.cardio) s.cardio.hrZone = ev.currentTarget.value ? Number(ev.currentTarget.value) : null; }} placeholder="1-5" /></label>
                        <label class="mini">Intensity <input class="input" value={s.cardio?.intensity ?? ""} oninput={(ev) => { if (s.cardio) s.cardio.intensity = ev.currentTarget.value; }} placeholder="easy…" maxlength="60" /></label>
                        <label class="mini">Distance <input class="input tnum" type="number" min="0" step="0.5" value={s.cardio?.distanceKm ?? ""} oninput={(ev) => { if (s.cardio) s.cardio.distanceKm = ev.currentTarget.value ? Number(ev.currentTarget.value) : undefined; }} placeholder="km" /> km</label>
                        <label class="mini">RPE <input class="input tnum" type="number" min="1" max="10" value={s.cardio?.targetRpe ?? ""} oninput={(ev) => { if (s.cardio) s.cardio.targetRpe = ev.currentTarget.value ? Number(ev.currentTarget.value) : undefined; }} placeholder="1-10" /></label>
                      </div>
                    </div>
                  {:else}
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
                  {/if}
                {:else}
                  {#each s.exercises as e, ei (e.id)}
                    <div class="exblock">
                      {#if editing}
                        <div class="exhead">
                          <strong>{e.exerciseName}</strong>
                          <select
                            class="select role"
                            value={e.role ?? ""}
                            onchange={(ev) => setRole(s, ei, ev.currentTarget.value)}
                            aria-label="Exercise role"
                            title="Session slot for this exercise"
                          >
                            <option value="">Role…</option>
                            {#each EXERCISE_ROLES as r (r)}
                              <option value={r} title={EXERCISE_ROLE_INFO[r].description}>{EXERCISE_ROLE_INFO[r].label}</option>
                            {/each}
                          </select>
                          <select
                            class="select swap"
                            value={e.exerciseId}
                            onchange={(ev) => swapExercise(s, ei, ev.currentTarget.value)}
                            aria-label="Swap exercise"
                            title="Swap exercise"
                          >
                            {#each catalog as ex (ex.id)}
                              <option value={ex.id}>{ex.name}</option>
                            {/each}
                          </select>
                          {#if e.notes}<span class="subtle">{e.notes}</span>{/if}
                        </div>
                      {:else}
                        <div class="exhead">
                          {#if e.role}<RoleChip role={e.role} />{/if}
                          <strong>{e.exerciseName}</strong>
                          {#if catalogById.get(e.exerciseId)?.movementPattern && catalogById.get(e.exerciseId)!.movementPattern! in MOVEMENT_PATTERN_INFO}
                            {@const p = catalogById.get(e.exerciseId)!.movementPattern as MovementPattern}
                            <span class="mp-tag" title={MOVEMENT_PATTERN_INFO[p].description}>{MOVEMENT_PATTERN_INFO[p].label}</span>
                          {/if}
                          {#if e.notes}<span class="subtle">{e.notes}</span>{/if}
                        </div>
                      {/if}

                      {#if editing}
                        <div class="setrows">
                          {#each e.prescribedSets as ps, di (ps.setNumber)}
                            <div class="setrow">
                              <span class="setno num">{ps.setNumber}</span>
                              <span class="setchip">
                                <span class="rep">{ps.reps}{ps.amrap ? "+" : ""}</span>
                              </span>
                              <span class="ctrl kg">
                                <button class="stepper" onclick={() => bumpSet(s, ei, di, "targetWeightKg", -1)} aria-label="lighter">−</button>
                                <span class="num kgv">{ps.targetWeightKg != null ? `${ps.targetWeightKg}kg` : "—"}</span>
                                <button class="stepper" onclick={() => bumpSet(s, ei, di, "targetWeightKg", 1)} aria-label="heavier">+</button>
                              </span>
                              {#if ps.durationSeconds != null}
                                <span class="ctrl">
                                  <button class="stepper" onclick={() => bumpSet(s, ei, di, "duration", -1)} aria-label="shorter">−</button>
                                  <span class="num">{fmtDuration(ps.durationSeconds)}</span>
                                  <button class="stepper" onclick={() => bumpSet(s, ei, di, "duration", 1)} aria-label="longer">+</button>
                                  <span class="subtle">time</span>
                                </span>
                              {:else}
                                <span class="ctrl">
                                  <button class="stepper" onclick={() => bumpSet(s, ei, di, "reps", -1)} aria-label="fewer reps">−</button>
                                  <span class="num">{ps.repsMin != null ? `${ps.repsMin}–${ps.reps}` : `${ps.reps}${ps.amrap ? "+" : ""}`}</span>
                                  <button class="stepper" onclick={() => bumpSet(s, ei, di, "reps", 1)} aria-label="more reps">+</button>
                                  <span class="subtle">reps</span>
                                </span>
                              {/if}
                              <span class="ctrl">
                                <button class="stepper" onclick={() => bumpSet(s, ei, di, "targetRpe", -0.5)} aria-label="lower RPE">−</button>
                                <span class="num">{ps.targetRpe ?? "—"}</span>
                                <button class="stepper" onclick={() => bumpSet(s, ei, di, "targetRpe", 0.5)} aria-label="higher RPE">+</button>
                                <span class="subtle">RPE</span>
                              </span>
                              <span class="ctrl rest">
                                <button class="stepper" onclick={() => bumpSet(s, ei, di, "restSeconds", -1)} aria-label="less rest">−</button>
                                <span class="num">{ps.restSeconds ? `${Math.round(ps.restSeconds / 60)}m` : "—"}</span>
                                <button class="stepper" onclick={() => bumpSet(s, ei, di, "restSeconds", 1)} aria-label="more rest">+</button>
                                <span class="subtle">rest</span>
                              </span>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <SetChips sets={e.prescribedSets} />
                      {/if}
                    </div>
                    {#if ei < s.exercises.length - 1}<hr class="divider" />{/if}
                  {/each}
                {/if}
              </div>
              {#if si < d.sessions.length - 1}<hr class="divider" />{/if}
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
{/if}

<style>
  h1 { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; gap: 10px; align-items: center; }
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
  .cardio-edit-fields { display: flex; flex-direction: column; gap: 8px; margin: 4px 0; }
  .cardio-grid { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .cardio-display { margin: 2px 0 4px; }
  .mini { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
  .mini .input { width: 58px; padding: 3px 6px; text-align: right; font-family: var(--font-mono); font-size: 12px; }

  .exblock .exhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }

  .setrows { display: flex; flex-direction: column; gap: 6px; }
  .setrow {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 8px;
    border-radius: var(--radius);
  }
  .setno { width: 18px; text-align: right; color: var(--faint); }

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
  .ctrl { display: inline-flex; align-items: center; gap: 4px; }
  .ctrl.kg { min-width: 86px; }
  .kgv { font-weight: 600; }
  .select.swap { width: auto; padding: 3px 8px; font-size: 12.5px; max-width: 220px; }
  .select.role { width: auto; padding: 3px 8px; font-size: 12.5px; }
  .select.tiny { width: auto; padding: 2px 6px; font-size: 12px; }
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
  .ctrl.rest { margin-left: auto; }
  .stepper {
    width: 22px;
    height: 22px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    font: 600 13px var(--font-ui);
    cursor: pointer;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .stepper:hover { background: var(--well-2); }
  .divider { border: none; border-top: 1px solid var(--line); margin: 8px 0; }

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: 1fr; }
  }
</style>
