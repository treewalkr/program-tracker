<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ClientDto, ExerciseDto, PeriodizationSchemeDto, ProgramSessionDto, WeekDirective } from "$lib/api/types";

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
  let schemes = $state<PeriodizationSchemeDto[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);

  interface SetRow {
    setNumber: number;
    type: "warm_up" | "working" | "backoff";
    reps: number;
    repsTo: number | null;
    targetRpe: number | null;
    restSeconds: number;
    targetWeightKg: number | null;
    durationSec: number | null;
    failure: boolean;
  }
  interface ExRow {
    key: string;
    exerciseId: string;
    sets: SetRow[];
  }
  interface SessionRow {
    key: string;
    name: string;
    cardioLabel: string;
    cardioDetail: string;
    exercises: ExRow[];
  }

  let sessions = $state<SessionRow[]>([
    { key: crypto.randomUUID(), name: "Day 1", cardioLabel: "", cardioDetail: "", exercises: [] },
  ]);

  let schemeMode = $state<"saved" | "custom" | "none">("saved");
  let selectedSchemeId = $state<string>("");
  let customWeeks = $state<WeekDirective[]>(["base", "+volume", "+intensity", "transition"]);
  let schemeName = $state("");
  let savingScheme = $state(false);
  let armedDelete = $state(false);
  const DIRECTIVES: WeekDirective[] = ["base", "+volume", "+intensity", "deload", "transition", "test"];

  const activeWeeks = $derived.by(() => {
    if (schemeMode === "custom") return [...customWeeks];
    if (schemeMode === "saved") {
      return schemes.find((s) => s.id === selectedSchemeId)?.weeks.map((w) => w.directive) ?? [];
    }
    return [];
  });

  const selectedScheme = $derived(
    schemeMode === "saved" ? (schemes.find((s) => s.id === selectedSchemeId) ?? null) : null
  );

  $effect(() => {
    if (activeWeeks.length > 0) {
      plannedWeeks = activeWeeks.length;
      endsWithDeload = activeWeeks[activeWeeks.length - 1] === "deload";
    }
  });

  function onSchemeSelect(value: string) {
    armedDelete = false;
    if (value === "custom" || value === "none") {
      schemeMode = value;
    } else {
      schemeMode = "saved";
      selectedSchemeId = value;
    }
  }

  async function saveScheme() {
    if (!schemeName.trim() || customWeeks.length < 2 || savingScheme) return;
    savingScheme = true;
    try {
      const created = await api.createScheme({
        name: schemeName.trim(),
        weeks: customWeeks.map((d, i) => ({ week: i + 1, directive: d })),
      });
      schemes = await api.schemes();
      schemeMode = "saved";
      selectedSchemeId = created.id;
      schemeName = "";
    } finally {
      savingScheme = false;
    }
  }

  async function removeScheme() {
    if (!armedDelete) {
      armedDelete = true;
      return;
    }
    if (!selectedScheme) return;
    const gone = selectedScheme.id;
    await api.deleteScheme(gone);
    schemes = schemes.filter((s) => s.id !== gone);
    armedDelete = false;
    if (schemes.length > 0) selectedSchemeId = schemes[0].id;
    else schemeMode = "none";
  }
  const totalSets = $derived(
    sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
  );
  const canSave = $derived(name.trim() !== "" && totalSets > 0);

  function addSession() {
    sessions.push({
      key: crypto.randomUUID(),
      name: `Day ${sessions.length + 1}`,
      cardioLabel: "",
      cardioDetail: "",
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
      repsTo: null,
      targetRpe: type === "warm_up" ? null : 8,
      restSeconds: type === "warm_up" ? 90 : 150,
      targetWeightKg: null,
      durationSec: null,
      failure: false,
    });
    sessions = [...sessions];
  }
  function removeSet(e: ExRow, i: number) {
    e.sets.splice(i, 1);
    e.sets.forEach((s2, j) => (s2.setNumber = j + 1));
    sessions = [...sessions];
  }

  function toDto(): ProgramSessionDto[] {
    return sessions
      .filter((s) => s.exercises.length > 0) // zod gate requires ≥1 exercise per session
      .map((s, si) => ({
        // ids must be uuids — the API's zod gate rejects anything else
        id: crypto.randomUUID(),
        name: s.name.trim() || `Session ${si + 1}`,
        order: si,
        conditioning: s.cardioLabel.trim() ? { label: s.cardioLabel.trim(), detail: s.cardioDetail.trim() } : null,
        exercises: s.exercises.map((e, ei) => ({
          id: crypto.randomUUID(),
          exerciseId: e.exerciseId,
          order: ei,
          prescribedSets: e.sets.map((ps, pi) => {
            const lo = Math.min(Number(ps.reps), Number(ps.repsTo ?? ps.reps));
            return {
              setNumber: pi + 1,
              type: ps.type,
              reps: ps.failure ? 0 : ps.repsTo != null ? Number(ps.repsTo) : Number(ps.reps),
              repsMin: !ps.failure && ps.repsTo != null ? lo : undefined,
              amrap: ps.failure,
              durationSeconds: ps.durationSec != null && ps.durationSec > 0 ? Number(ps.durationSec) : undefined,
              targetWeightKg: ps.targetWeightKg === null ? undefined : Number(ps.targetWeightKg),
              targetRpe: ps.targetRpe ?? undefined,
              restSeconds: ps.restSeconds,
            };
          }),
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
              weeks: activeWeeks.length > 0 ? activeWeeks.map((d, i) => ({ week: i + 1, directive: d })) : undefined,
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
    schemes = await api.schemes();
    if (schemes.length > 0) {
      schemeMode = "saved";
      selectedSchemeId = schemes[0].id;
    } else {
      schemeMode = "none";
    }
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
              <div style="grid-column: 1 / -1">
                <label class="label" for="np-scheme">Progression scheme</label>
                <select
                  class="select"
                  id="np-scheme"
                  value={schemeMode === "saved" ? selectedSchemeId : schemeMode}
                  onchange={(e) => onSchemeSelect(e.currentTarget.value)}
                >
                  {#each schemes as s (s.id)}
                    <option value={s.id}>{s.name} — {s.weeks.map((w) => w.directive).join(" → ")}</option>
                  {/each}
                  <option value="custom">Custom — define week directives</option>
                  <option value="none">None — no week directives</option>
                </select>
                {#if schemeMode === "saved" && selectedScheme}
                  <div class="scheme-chips">
                    {#each selectedScheme.weeks as w (w.week)}
                      <span class="scheme-chip" class:d-up={w.directive === "+volume"} class:d-hot={w.directive === "+intensity"} class:d-tr={w.directive === "transition"} class:d-de={w.directive === "deload"}>W{w.week} {w.directive}</span>
                    {/each}
                  </div>
                  <div class="scheme-manage">
                    <button type="button" class="btn ghost small danger" onclick={removeScheme}>
                      {armedDelete ? "Really delete scheme?" : "Delete scheme"}
                    </button>
                  </div>
                {:else if schemeMode === "custom"}
                  <div class="week-rows">
                    {#each customWeeks as d, i (i)}
                      <div class="week-row">
                        <span class="wk">W{i + 1}</span>
                        <select class="select" bind:value={customWeeks[i]} onchange={() => (armedDelete = false)}>
                          {#each DIRECTIVES as opt (opt)}
                            <option value={opt}>{opt}</option>
                          {/each}
                        </select>
                        <button
                          type="button"
                          class="btn ghost small"
                          disabled={customWeeks.length <= 2}
                          onclick={() => (customWeeks = customWeeks.filter((_, j) => j !== i))}
                          aria-label="Remove week"
                        >✕</button>
                      </div>
                    {/each}
                    <div class="save-row">
                      <button type="button" class="btn ghost small" onclick={() => (customWeeks = [...customWeeks, "+volume"])}>+ Add week</button>
                      <input class="input" style="flex:1" placeholder="Scheme name — e.g. 5-week peaking wave" bind:value={schemeName} />
                      <button
                        type="button"
                        class="btn small"
                        disabled={savingScheme || !schemeName.trim() || customWeeks.length < 2}
                        onclick={saveScheme}
                      >{savingScheme ? "Saving…" : "Save as scheme"}</button>
                    </div>
                  </div>
                {/if}
              </div>
              {#if activeWeeks.length === 0}
                <div>
                  <label class="label" for="np-weeks">Block length</label>
                  <select class="select" id="np-weeks" bind:value={plannedWeeks}>
                    {#each [3, 4, 5, 6, 8] as w}<option value={w}>{w} weeks</option>{/each}
                  </select>
                </div>
              {:else}
                <div>
                  <p class="label">Block length <span class="subtle">— from scheme</span></p>
                  <p class="derived-val">{activeWeeks.length} weeks</p>
                </div>
              {/if}
              <div>
                <label class="label" for="np-phase">This phase</label>
                <input class="input" id="np-phase" bind:value={phase} maxlength="40" />
              </div>
              <div>
                <label class="label" for="np-next">Next phase</label>
                <input class="input" id="np-next" bind:value={nextPhase} maxlength="40" />
              </div>
              {#if activeWeeks.length === 0}
                <label class="label chk">
                  <input type="checkbox" bind:checked={endsWithDeload} />
                  Ends with a deload week
                </label>
              {:else}
                <label class="label chk">
                  <input type="checkbox" checked disabled />
                  Deload weeks per scheme
                </label>
              {/if}
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
              <button type="button" class="btn ghost small" onclick={() => { s.cardioLabel = s.cardioLabel === "" ? "Cardio" : ""; sessions = [...sessions]; }} title="Add / remove cardio block">{s.cardioLabel === "" ? "+ Cardio" : "− Cardio"}</button>
              {#if sessions.length > 1}
                <button type="button" class="btn danger small" onclick={() => removeSession(s.key)}>Remove day</button>
              {/if}
            </div>
          </div>
          <div class="panel-body exlist">
            {#if s.cardioLabel !== "" || s.exercises.length === 0}
              <div class="cardio-row">
                <input class="input cardio-label" placeholder="Cardio — e.g. Zone 2–3" bind:value={s.cardioLabel} maxlength="60" aria-label="Cardio label" />
                <input class="input" placeholder="Detail — e.g. 40–60 min steady" bind:value={s.cardioDetail} maxlength="80" aria-label="Cardio detail" />
              </div>
            {/if}
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
                        <label class="mini"><input class="input tnum" type="number" min="1" max="100" bind:value={ps.reps} disabled={ps.failure || ps.durationSec != null} /> {ps.durationSec != null ? "reps" : "reps"}</label>
                        <label class="mini" title="Upper bound of a rep range (e.g. 6–10)"><input class="input tnum" type="number" min="1" max="100" bind:value={ps.repsTo} placeholder="to" disabled={ps.failure || ps.durationSec != null} /> –</label>
                        <label class="mini" title="Timed set in seconds (e.g. 60 = 1 min)"><input class="input tnum" type="number" min="5" step="15" bind:value={ps.durationSec} placeholder="sec" disabled={ps.failure} /></label>
                        <label class="mini chk" title="To failure"><input type="checkbox" bind:checked={ps.failure} /> max</label>
                        <label class="mini"><input class="input tnum" type="number" min="0" step="2.5" bind:value={ps.targetWeightKg} placeholder="—" /> kg</label>
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
  .scheme-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .scheme-manage { margin-top: 6px; }
  .week-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .week-row { display: flex; align-items: center; gap: 8px; }
  .week-row .select { flex: 1; }
  .wk { font: 700 12px var(--font-mono); width: 28px; color: var(--muted); }
  .save-row { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
  .derived-val { margin: 6px 0 0; font: 600 14px var(--font-mono); }
  .scheme-chip {
    font: 600 12px var(--font-mono);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 2px 9px;
  }
  .scheme-chip.d-up { color: #3f6339; border-color: #c3d2c5; }
  .scheme-chip.d-hot { color: #7a520d; border-color: #ddd0ae; }
  .scheme-chip.d-tr { color: #55558c; border-color: #cdcede; }
  .scheme-chip.d-de { color: var(--muted); }

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
  .cardio-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .cardio-row .cardio-label { max-width: 200px; }
  .mini.chk { cursor: pointer; }
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
