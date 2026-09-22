<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ProgramDto } from "$lib/api/types";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";

  const id = $derived(page.params.id ?? "");

  let program = $state<ProgramDto | null>(null);
  let saving = $state(false);
  let savedAt = $state<string | null>(null);
  let activating = $state(false);

  async function load() {
    program = await api.program(id);
  }

  async function save() {
    if (!program) return;
    saving = true;
    try {
      program = await api.saveProgram(program.id, program.sessions);
      savedAt = new Date().toLocaleTimeString();
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

  function bumpSet(si: number, ei: number, di: number, field: "reps" | "targetRpe" | "restSeconds", delta: number) {
    if (!program) return;
    const set = program.sessions[si].exercises[ei].prescribedSets[di];
    if (field === "reps") set.reps = Math.max(1, Math.min(100, set.reps + delta));
    else if (field === "targetRpe") set.targetRpe = Math.max(1, Math.min(10, (set.targetRpe ?? 5) + delta));
    else set.restSeconds = Math.max(0, Math.min(600, (set.restSeconds ?? 120) + delta * 15));
  }

  onMount(load);
</script>

<svelte:head><title>{program?.name ?? "Program"} · Program Tracker</title></svelte:head>

{#if program === null}
  <div class="skeleton" style="height:140px"></div>
{:else}
  <div class="page-head">
    <div>
      <p class="crumb"><a href={`/clients/${program.clientId}`}>Client</a> / Program</p>
      <h1>{program.name} <StatusPill status={program.status} /></h1>
      <p class="sub">
        v{program.version}
        {#if program.aiAssisted} · ✦ AI-assisted draft{#if program.createdFromProgramId}, built on previous block{/if}{/if}
        {#if savedAt} · saved {savedAt}{/if}
      </p>
    </div>
    <div class="actions">
      <button class="btn ghost" onclick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      {#if program.status === "draft"}
        <button class="btn" onclick={activate} disabled={activating}>
          {activating ? "Activating…" : "Activate program"}
        </button>
      {/if}
    </div>
  </div>

  {#if program.status === "draft"}
    <p class="hint">
      Draft — nothing the client sees. Tweak sets below, then activate to make it current
      (previous active program archives automatically).
    </p>
  {/if}

  <div class="sessions-grid">
    {#each program.sessions as s, si (s.id)}
      <section class="panel">
        <div class="panel-head">
          <h2>{s.name}</h2>
          <span class="subtle">{s.exercises.length} exercises</span>
        </div>
        <div class="panel-body exlist">
          {#each s.exercises as e, ei (e.id)}
            <div class="exblock">
              <div class="exhead">
                <strong>{e.exerciseName}</strong>
                {#if e.notes}<span class="subtle">{e.notes}</span>{/if}
              </div>
              <div class="setrows">
                {#each e.prescribedSets as ps, di (ps.setNumber)}
                  <div class="setrow" class:warm={ps.type === "warm_up"}>
                    <span class="setno num">{ps.setNumber}</span>
                    <span class="setchip" class:warm={ps.type === "warm_up"}>
                      <span class="rep">{ps.reps}{ps.amrap ? "+" : ""}</span>
                    </span>
                    <span class="ctrl">
                      <button class="stepper" onclick={() => bumpSet(si, ei, di, "reps", -1)} aria-label="fewer reps">−</button>
                      <button class="stepper" onclick={() => bumpSet(si, ei, di, "reps", 1)} aria-label="more reps">+</button>
                      <span class="subtle">reps</span>
                    </span>
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
            </div>
            {#if ei < s.exercises.length - 1}<hr class="divider" />{/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .crumb { margin: 0 0 4px; font-size: 13px; color: var(--faint); }
  .crumb a:hover { text-decoration: underline; }
  h1 { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; gap: 10px; }
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
  .ctrl.rest { margin-left: auto; }
  .stepper {
    width: 22px;
    height: 22px;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    background: var(--surface);
    font: 600 13px var(--font-ui);
    cursor: pointer;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .stepper:hover { background: #eceee9; }

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: 1fr; }
  }
</style>
