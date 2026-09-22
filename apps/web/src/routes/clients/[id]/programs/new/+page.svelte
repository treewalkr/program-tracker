<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ClientDto, ExerciseDto, ProgramSessionDto } from "$lib/api/types";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let catalog = $state<ExerciseDto[]>([]);

  let name = $state("");
  let description = $state("");
  let plannedWeeks = $state(4);
  let phase = $state("accumulation");
  let nextPhase = $state("deload");
  let endsWithDeload = $state(true);
  let usePhasing = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  interface SetRow {
    setNumber: number;
    type: "warm_up" | "working" | "backoff";
    reps: number;
    targetRpe: number | null;
    restSeconds: number;
  }
  interface ExRow {
    key: string;
    exerciseId: string;
    sets: SetRow[];
  }
  interface SessionRow {
    key: string;
    name: string;
    exercises: ExRow[];
  }

  let sessions = $state<SessionRow[]>([
    { key: crypto.randomUUID(), name: "Day 1", exercises: [] },
  ]);

  const totalSets = $derived(
    sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
  );
  const canSave = $derived(name.trim() !== "" && totalSets > 0);

  function addSession() {
    sessions.push({
      key: crypto.randomUUID(),
      name: `Day ${sessions.length + 1}`,
      exercises: [],
    });
    sessions = [...sessions];
  }
  function removeSession(key: string) {
    sessions = sessions.filter((s) => s.key !== key);
    sessions = [...sessions];
  }

  function addExercise(s: SessionRow) {
    s.exercises.push({ key: crypto.randomUUID(), exerciseId: catalog[0]?.id ?? "", sets: [] });
    sessions = [...sessions];
  }

  function addSet(e: ExRow, type: SetRow["type"] = "working") {
    e.sets.push({
      setNumber: e.sets.length + 1,
      type,
      reps: type === "warm_up" ? 5 : 8,
      targetRpe: type === "warm_up" ? null : 8,
      restSeconds: type === "warm_up" ? 90 : 150,
    });
    sessions = [...sessions];
  }
  function removeSet(e: ExRow, i: number) {
    e.sets.splice(i, 1);
    e.sets.forEach((s2, j) => (s2.setNumber = j + 1));
    sessions = [...sessions];
  }

  function toDto(): ProgramSessionDto[] {
    return sessions.map((s, si) => ({
      id: `ps-new-${si}`,
      name: s.name.trim() || `Session ${si + 1}`,
      order: si,
      exercises: s.exercises.map((e, ei) => ({
        id: `pe-new-${si}-${ei}`,
        exerciseId: e.exerciseId,
        order: ei,
        prescribedSets: e.sets.map((ps, pi) => ({
          setNumber: pi + 1,
          type: ps.type,
          reps: Number(ps.reps),
          amrap: false,
          targetRpe: ps.targetRpe ?? undefined,
          restSeconds: ps.restSeconds,
        })),
      })),
    }));
  }

  async function save() {
    saving = true;
    error = null;
    try {
      const program = await api.createProgram({
        clientId: id,
        name: name.trim(),
        description: description.trim() || null,
        sessions: toDto(),
        phasing: usePhasing
          ? {
              plannedWeeks: Number(plannedWeeks),
              phase: phase.trim() || "block",
              nextPhase: nextPhase.trim() || null,
              deloadWeeks: endsWithDeload ? [Number(plannedWeeks)] : [],
            }
          : null,
      });
      await goto(`/programs/${program.id}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    const detail = await api.client(id);
    client = detail.client;
    catalog = await api.exercises();
  });
</script>

<svelte:head><title>New program · Program Tracker</title></svelte:head>

{#if client === null}
  <div class="skeleton" style="height:140px"></div>
{:else}
  <div class="page-head">
    <div>
      <p class="crumb"><a href={`/clients/${id}`}>{client.name}</a> / New program</p>
      <h1>Write a program by hand</h1>
      <p class="sub">Saved as draft — nothing goes live until you activate it.</p>
    </div>
    <button class="btn" onclick={save} disabled={saving || !canSave}>
      {saving ? "Saving…" : "Save as draft"}
    </button>
  </div>

  <div class="cols">
    <section class="panel">
      <div class="panel-head"><h2>Basics</h2></div>
      <div class="panel-body stack">
        <div>
          <label class="label" for="np-name">Name</label>
          <input class="input" id="np-name" placeholder="e.g. Strength Base B" bind:value={name} maxlength="120" />
        </div>
        <div>
          <label class="label" for="np-desc">Description <span class="subtle">— optional</span></label>
          <input class="input" id="np-desc" placeholder="Focus, notes to self…" bind:value={description} maxlength="300" />
        </div>
        <div class="phasing">
          <label class="label">
            <input type="checkbox" bind:checked={usePhasing} />
            Periodization plan <span class="subtle">— powers phase-change reminders</span>
          </label>
          {#if usePhasing}
            <div class="phasing-grid">
              <div>
                <label class="label" for="np-weeks">Block length</label>
                <select class="select" id="np-weeks" bind:value={plannedWeeks}>
                  {#each [3, 4, 5, 6, 8] as w}<option value={w}>{w} weeks</option>{/each}
                </select>
              </div>
              <div>
                <label class="label" for="np-phase">This phase</label>
                <input class="input" id="np-phase" bind:value={phase} maxlength="40" />
              </div>
              <div>
                <label class="label" for="np-next">Next phase</label>
                <input class="input" id="np-next" bind:value={nextPhase} maxlength="40" />
              </div>
              <label class="label chk">
                <input type="checkbox" bind:checked={endsWithDeload} />
                Ends with a deload week
              </label>
            </div>
          {/if}
        </div>
      </div>
    </section>

    <div class="builder-col">
      {#each sessions as s, si (s.key)}
        <section class="panel">
          <div class="panel-head">
            <input class="sess-name" value={s.name} oninput={(e) => (s.name = e.currentTarget.value)} maxlength="60" aria-label="Session name" />
            <div class="head-actions">
              <button type="button" class="btn ghost small" onclick={() => addExercise(s)}>+ Exercise</button>
              {#if sessions.length > 1}
                <button type="button" class="btn danger small" onclick={() => removeSession(s.key)}>Remove day</button>
              {/if}
            </div>
          </div>
          <div class="panel-body exlist">
            {#each s.exercises as e (e.key)}
              <div class="exblock">
                <div class="exhead">
                  <select class="select exsel" bind:value={e.exerciseId} aria-label="Exercise">
                    {#each catalog as ex (ex.id)}
                      <option value={ex.id}>{ex.name}</option>
                    {/each}
                  </select>
                  <div class="head-actions">
                    <button type="button" class="btn ghost small" onclick={() => addSet(e, "warm_up")}>+ warm-up</button>
                    <button type="button" class="btn ghost small" onclick={() => addSet(e, "working")}>+ set</button>
                    <button
                      type="button"
                      class="btn danger small"
                      onclick={() => {
                        s.exercises = s.exercises.filter((x) => x.key !== e.key);
                        sessions = [...sessions];
                      }}
                    >Remove</button>
                  </div>
                </div>
                {#if e.sets.length === 0}
                  <p class="subtle nosets">No sets yet — add a warm-up or working set.</p>
                {:else}
                  <div class="setrows">
                    {#each e.sets as ps, pi (pi)}
                      <div class="setrow" class:warm={ps.type === "warm_up"}>
                        <span class="setno">{ps.setNumber}</span>
                        <select class="select tiny" bind:value={ps.type} aria-label="Set type">
                          <option value="warm_up">warm-up</option>
                          <option value="working">working</option>
                          <option value="backoff">backoff</option>
                        </select>
                        <label class="mini"><input class="input tnum" type="number" min="1" max="100" bind:value={ps.reps} /> reps</label>
                        <label class="mini"><input class="input tnum" type="number" min="1" max="10" step="0.5" bind:value={ps.targetRpe} /> RPE</label>
                        <label class="mini"><input class="input tnum" type="number" min="0" step="15" bind:value={ps.restSeconds} /> s rest</label>
                        <button type="button" class="setx" onclick={() => removeSet(e, pi)} aria-label="Remove set">×</button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
            {#if s.exercises.length === 0}
              <p class="subtle">Empty day — add an exercise.</p>
            {/if}
          </div>
        </section>
      {/each}
      <button type="button" class="btn ghost addday" onclick={addSession}>+ Add training day</button>
      {#if error}<p class="err">{error}</p>{/if}
      <p class="subtle hint">
        {totalSets} sets across {sessions.length} {sessions.length === 1 ? "day" : "days"}.
        Prefer help? <a href={`/clients/${id}/generate`}>✦ Generate with AI</a> instead.
      </p>
    </div>
  </div>
{/if}

<style>
  .crumb { margin: 0 0 4px; font-size: 13px; color: var(--faint); }
  .crumb a:hover { text-decoration: underline; }

  .cols { display: grid; grid-template-columns: 4fr 8fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 12px; }

  .phasing { border-top: 1px solid var(--line); padding-top: 12px; }
  .phasing > .label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .phasing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .phasing-grid .chk { display: flex; align-items: center; gap: 8px; cursor: pointer; }

  .builder-col { display: flex; flex-direction: column; gap: 18px; }
  .sess-name {
    font: 700 16px var(--font-ui);
    border: none; background: none; color: var(--ink);
    padding: 0; width: 220px;
  }
  .sess-name:focus { outline: 2px solid var(--ink); outline-offset: 4px; border-radius: 2px; }
  .head-actions { display: flex; gap: 6px; }
  .btn.small { padding: 4px 10px; font-size: 13px; }

  .exlist { display: flex; flex-direction: column; gap: 12px; }
  .exblock { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; }
  .exhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .exsel { width: auto; min-width: 200px; font-weight: 600; }
  .nosets { margin: 0; }

  .setrows { display: flex; flex-direction: column; gap: 6px; }
  .setrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .setrow.warm { opacity: 0.7; }
  .setno { width: 16px; text-align: right; color: var(--faint); font-family: var(--font-mono); font-size: 12px; }
  .select.tiny { width: auto; padding: 3px 6px; font-size: 12.5px; }
  .mini { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
  .mini .input { width: 58px; padding: 3px 6px; text-align: right; font-family: var(--font-mono); font-size: 12.5px; }
  .setx { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 15px; padding: 0 4px; }
  .setx:hover { color: var(--bad); }

  .addday { align-self: flex-start; }
  .err { color: var(--bad); font-weight: 600; }
  .hint { margin: 0; }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
