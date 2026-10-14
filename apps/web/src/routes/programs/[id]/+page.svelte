<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { fmtDuration } from "$lib/format";
  import type { ExerciseDto, ProgramDto } from "$lib/api/types";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");

  let program = $state<ProgramDto | null>(null);
  let clientName = $state<string | null>(null);
  let catalog = $state<ExerciseDto[]>([]);
  let editing = $state(false);
  let saving = $state(false);
  let savedAt = $state<string | null>(null);
  let activating = $state(false);

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
      program = await api.saveProgram(program.id, program.sessions);
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
    si: number,
    ei: number,
    di: number,
    field: "reps" | "targetRpe" | "restSeconds" | "targetWeightKg" | "duration",
    delta: number
  ) {
    if (!program) return;
    const set = program.sessions[si].exercises[ei].prescribedSets[di];
    if (field === "reps") {
      if (set.repsMin != null) set.repsMin = Math.max(1, set.repsMin + delta);
      set.reps = Math.max(1, Math.min(100, set.reps + delta));
    } else if (field === "targetRpe") set.targetRpe = Math.max(1, Math.min(10, (set.targetRpe ?? 5) + delta));
    else if (field === "restSeconds") set.restSeconds = Math.max(0, Math.min(600, set.restSeconds ?? 120 + delta * 15));
    else if (field === "duration") {
      set.durationSeconds = Math.max(5, (set.durationSeconds ?? 30) + delta * 15);
    } else {
      const cur = set.targetWeightKg ?? 20;
      set.targetWeightKg = delta > 0 ? Math.round((cur + 2.5) * 2) / 2 : Math.max(0, Math.round((cur - 2.5) * 2) / 2);
    }
  }

  /** Deload: cut every working-set load target by ~10%, rounded to the 2.5kg grid. */
  function applyDeload() {
    if (!program) return;
    for (const s of program.sessions) {
      for (const e of s.exercises) {
        for (const ps of e.prescribedSets) {
          if (ps.type === "working" && ps.targetWeightKg != null) {
            ps.targetWeightKg = Math.max(0, Math.round((ps.targetWeightKg * 0.9) / 2.5) * 2.5);
          }
        }
      }
    }
  }

  function swapExercise(si: number, ei: number, exerciseId: string) {
    if (!program) return;
    const e = program.sessions[si].exercises[ei];
    e.exerciseId = exerciseId;
    e.exerciseName = catalog.find((c) => c.id === exerciseId)?.name ?? exerciseId;
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

  <div class="sessions-grid" class:editing>
    {#each program.sessions as s, si (s.id)}
      <section class="panel">
        <div class="panel-head">
          <h2>{s.name}</h2>
          {#if !editing && s.conditioning}<span class="cond-chip" title={`${s.conditioning.label} — ${s.conditioning.detail}`}><Icon name="pulse" />{s.conditioning.label} · {s.conditioning.detail}</span>{/if}
          <span class="subtle">{s.exercises.length} exercises</span>
        </div>
        {#if editing}
          <div class="cardio-edit">
            {#if s.conditioning}
              <input
                class="input cardio-label"
                value={s.conditioning.label}
                oninput={(ev) => (s.conditioning = { label: ev.currentTarget.value, detail: s.conditioning!.detail })}
                placeholder="Cardio — e.g. Zone 2–3"
                maxlength="60"
                aria-label="Cardio label"
              />
              <input
                class="input"
                value={s.conditioning.detail}
                oninput={(ev) => (s.conditioning = { label: s.conditioning!.label, detail: ev.currentTarget.value })}
                placeholder="Detail — e.g. 40–60 min steady"
                maxlength="80"
                aria-label="Cardio detail"
              />
              <button type="button" class="btn danger small" onclick={() => (s.conditioning = null)} title="Remove cardio block">Remove</button>
            {:else}
              <button type="button" class="btn ghost small" onclick={() => (s.conditioning = { label: "Cardio", detail: "" })}>+ Cardio</button>
            {/if}
          </div>
        {/if}
        <div class="panel-body exlist">
          {#each s.exercises as e, ei (e.id)}
            <div class="exblock">
              {#if editing}
                <div class="exhead">
                  <strong>{e.exerciseName}</strong>
                  <select
                    class="select swap"
                    value={e.exerciseId}
                    onchange={(ev) => swapExercise(si, ei, ev.currentTarget.value)}
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
                  <strong>{e.exerciseName}</strong>
                  {#if e.notes}<span class="subtle">{e.notes}</span>{/if}
                </div>
              {/if}

              {#if editing}
                <div class="setrows">
                  {#each e.prescribedSets as ps, di (ps.setNumber)}
                    <div class="setrow" class:warm={ps.type === "warm_up"}>
                      <span class="setno num">{ps.setNumber}</span>
                      <span class="setchip" class:warm={ps.type === "warm_up"}>
                        <span class="rep">{ps.reps}{ps.amrap ? "+" : ""}</span>
                      </span>
                      <span class="ctrl kg">
                        <button class="stepper" onclick={() => bumpSet(si, ei, di, "targetWeightKg", -1)} aria-label="lighter">−</button>
                        <span class="num kgv">{ps.targetWeightKg != null ? `${ps.targetWeightKg}kg` : "—"}</span>
                        <button class="stepper" onclick={() => bumpSet(si, ei, di, "targetWeightKg", 1)} aria-label="heavier">+</button>
                      </span>
                      {#if ps.durationSeconds != null}
                        <span class="ctrl">
                          <button class="stepper" onclick={() => bumpSet(si, ei, di, "duration", -1)} aria-label="shorter">−</button>
                          <span class="num">{fmtDuration(ps.durationSeconds)}</span>
                          <button class="stepper" onclick={() => bumpSet(si, ei, di, "duration", 1)} aria-label="longer">+</button>
                          <span class="subtle">time</span>
                        </span>
                      {:else}
                        <span class="ctrl">
                          <button class="stepper" onclick={() => bumpSet(si, ei, di, "reps", -1)} aria-label="fewer reps">−</button>
                          <span class="num">{ps.repsMin != null ? `${ps.repsMin}–${ps.reps}` : `${ps.reps}${ps.amrap ? "+" : ""}`}</span>
                          <button class="stepper" onclick={() => bumpSet(si, ei, di, "reps", 1)} aria-label="more reps">+</button>
                          <span class="subtle">reps</span>
                        </span>
                      {/if}
                      <span class="ctrl">
                        <button class="stepper" onclick={() => bumpSet(si, ei, di, "targetRpe", -0.5)} aria-label="lower RPE">−</button>
                        <span class="num">{ps.targetRpe ?? "—"}</span>
                        <button class="stepper" onclick={() => bumpSet(si, ei, di, "targetRpe", 0.5)} aria-label="higher RPE">+</button>
                        <span class="subtle">RPE</span>
                      </span>
                      <span class="ctrl rest">
                        <button class="stepper" onclick={() => bumpSet(si, ei, di, "restSeconds", -1)} aria-label="less rest">−</button>
                        <span class="num">{ps.restSeconds ? `${Math.round(ps.restSeconds / 60)}m` : "—"}</span>
                        <button class="stepper" onclick={() => bumpSet(si, ei, di, "restSeconds", 1)} aria-label="more rest">+</button>
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
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  h1 { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; gap: 10px; align-items: center; }
  .readonly-note { margin: 0; }
  .hint { color: var(--muted); margin: -8px 0 16px; max-width: 640px; }

  .sessions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }

  .exlist { display: flex; flex-direction: column; }
  .exblock .exhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }

  .setrows { display: flex; flex-direction: column; gap: 6px; }
  .setrow {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 8px;
    border-radius: var(--radius);
  }
  .setrow.warm { opacity: 0.65; }
  .setno { width: 18px; text-align: right; color: var(--faint); }

  .ctrl { display: inline-flex; align-items: center; gap: 4px; }
  .ctrl.kg { min-width: 86px; }
  .kgv { font-weight: 600; }
  .select.swap { width: auto; padding: 3px 8px; font-size: 12.5px; max-width: 220px; }
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
  .cardio-edit { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 2px; }
  .cardio-edit .cardio-label { max-width: 200px; }
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

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: 1fr; }
  }
</style>
