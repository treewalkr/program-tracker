<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ClientDto, ExerciseDto, PeriodizationSchemeDto, ProgramSessionDto, WeekDirective } from "$lib/api/types";
  import { EXERCISE_ROLE_INFO, EXERCISE_ROLES, sortExercisesByRole } from "@pt/shared";
  import type { ExerciseRole, SetType } from "@pt/shared";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let catalog = $state<ExerciseDto[]>([]);

  let name = $state("");
  let description = $state("");
  let plannedWeeks = $state(4);
  let phase = $state("accumulation");
  let nextPhase = $state("deload");
  let usePhasing = $state(true);
  let schemes = $state<PeriodizationSchemeDto[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);

  interface SetRow {
    setNumber: number;
    type: SetType;
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
    role: ExerciseRole | "";
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
    }
  });

  function onSchemeSelect(value: string) {
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
    if (!selectedScheme) return;
    const gone = selectedScheme.id;
    await api.deleteScheme(gone);
    schemes = schemes.filter((s) => s.id !== gone);
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
    s.exercises.push({ key: crypto.randomUUID(), exerciseId: catalog[0]?.id ?? "", role: "", sets: [] });
    sessions = [...sessions];
  }

  function addSet(e: ExRow, type: SetRow["type"] = "working") {
    e.sets.push({
      setNumber: e.sets.length + 1,
      type,
      reps: 8,
      repsTo: null,
      targetRpe: 8,
      restSeconds: 150,
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
        // role order is the session order — sort before assigning array-index orders,
        // so the saved program lists power → primary → strength → accessory → core
        exercises: sortExercisesByRole(s.exercises.map((e) => ({ ...e, role: e.role || undefined }))).map((e, ei) => ({
          id: crypto.randomUUID(),
          exerciseId: e.exerciseId,
          exerciseName: catalog.find((c) => c.id === e.exerciseId)?.name,
          role: e.role,
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
  <Skeleton h="140px" />
{:else}
  <PageHead
    title="Write a program by hand"
    sub="Saved as draft — nothing goes live until you activate it."
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "New program" }]}
  >
    {#snippet actions()}
      <Button variant="primary" onclick={save} disabled={saving || !canSave}>
        {saving ? "Saving…" : "Save as draft"}
      </Button>
    {/snippet}
  </PageHead>

  <div class="cols">
    <Panel title="Basics">
      <div class="panel-body stack">
        <Field label="Name" htmlFor="np-name">
          <input class="input" id="np-name" placeholder="e.g. Strength Base B" bind:value={name} maxlength="120" />
        </Field>
        <Field label="Description" hint="optional" htmlFor="np-desc">
          <input class="input" id="np-desc" placeholder="Focus, notes to self…" bind:value={description} maxlength="300" />
        </Field>
        <div class="phasing">
          <label class="label">
            <input type="checkbox" bind:checked={usePhasing} />
            Periodization plan <span class="subtle">— powers phase-change reminders</span>
          </label>
          {#if usePhasing}
            <div class="phasing-grid">
              <div style="grid-column: 1 / -1">
                <Field label="Progression scheme" htmlFor="np-scheme">
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
                </Field>
                {#if schemeMode === "saved" && selectedScheme}
                  <div class="scheme-chips">
                    {#each selectedScheme.weeks as w (w.week)}
                      <span class="dir {w.directive === '+volume' ? 'vol' : w.directive === '+intensity' ? 'int' : w.directive === 'transition' ? 'tr' : ''}">W{w.week} {w.directive}</span>
                    {/each}
                  </div>
                  <div class="scheme-manage">
                    <ConfirmButton
                      label="Delete scheme"
                      confirmLabel="Really delete scheme?"
                      variant="danger"
                      class="ghost"
                      small
                      onconfirm={removeScheme}
                    />
                  </div>
                {:else if schemeMode === "custom"}
                  <div class="week-rows">
                    {#each customWeeks as d, i (i)}
                      <div class="week-row">
                        <span class="wk">W{i + 1}</span>
                        <select class="select" bind:value={customWeeks[i]}>
                          {#each DIRECTIVES as opt (opt)}
                            <option value={opt}>{opt}</option>
                          {/each}
                        </select>
                        <Button
                          variant="ghost"
                          small
                          disabled={customWeeks.length <= 2}
                          onclick={() => (customWeeks = customWeeks.filter((_, j) => j !== i))}
                          aria-label="Remove week"
                        >{#snippet icon()}<Icon name="x" />{/snippet}</Button>
                      </div>
                    {/each}
                    <div class="save-row">
                      <Button variant="ghost" small type="button" onclick={() => (customWeeks = [...customWeeks, "+volume"])}>+ Add week</Button>
                      <input class="input" style="flex:1" placeholder="Scheme name — e.g. 5-week peaking wave" bind:value={schemeName} />
                      <Button
                        small
                        type="button"
                        disabled={savingScheme || !schemeName.trim() || customWeeks.length < 2}
                        onclick={saveScheme}
                      >{savingScheme ? "Saving…" : "Save as scheme"}</Button>
                    </div>
                  </div>
                {/if}
              </div>
              {#if activeWeeks.length === 0}
                <div>
                  <Field label="Block length" htmlFor="np-weeks">
                    <select class="select" id="np-weeks" bind:value={plannedWeeks}>
                      {#each [3, 4, 5, 6, 8] as w}<option value={w}>{w} weeks</option>{/each}
                    </select>
                  </Field>
                </div>
              {:else}
                <div>
                  <p class="label">Block length <span class="subtle">— from scheme</span></p>
                  <p class="derived-val">{activeWeeks.length} weeks</p>
                </div>
              {/if}
              <div>
                <Field label="This phase" htmlFor="np-phase">
                  <input class="input" id="np-phase" bind:value={phase} maxlength="40" />
                </Field>
              </div>
              <div>
                <Field label="Next phase" htmlFor="np-next">
                  <input class="input" id="np-next" bind:value={nextPhase} maxlength="40" />
                </Field>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </Panel>

    <div class="builder-col">
      {#each sessions as s, si (s.key)}
        <section class="panel">
          <div class="panel-head">
            <input class="sess-name" value={s.name} oninput={(e) => (s.name = e.currentTarget.value)} maxlength="60" aria-label="Session name" />
            <div class="head-actions">
              <Button variant="ghost" small type="button" onclick={() => addExercise(s)}>+ Exercise</Button>
              <Button variant="ghost" small type="button" onclick={() => { s.cardioLabel = s.cardioLabel === "" ? "Cardio" : ""; sessions = [...sessions]; }} title="Add / remove cardio block">{s.cardioLabel === "" ? "+ Cardio" : "− Cardio"}</Button>
              {#if sessions.length > 1}
                <Button variant="danger" small type="button" onclick={() => removeSession(s.key)}>Remove day</Button>
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
                  <select class="select tiny" bind:value={e.role} aria-label="Exercise role" title="Session slot for this exercise">
                    <option value="">Role…</option>
                    {#each EXERCISE_ROLES as r (r)}
                      <option value={r} title={EXERCISE_ROLE_INFO[r].description}>{EXERCISE_ROLE_INFO[r].label}</option>
                    {/each}
                  </select>
                  <div class="head-actions">
                    <Button variant="ghost" small type="button" onclick={() => addSet(e, "working")}>+ set</Button>
                    <Button
                      variant="danger"
                      small
                      type="button"
                      onclick={() => {
                        s.exercises = s.exercises.filter((x) => x.key !== e.key);
                        sessions = [...sessions];
                      }}
                    >Remove</Button>
                  </div>
                </div>
                {#if e.sets.length === 0}
                  <p class="subtle nosets">No sets yet — add a working set.</p>
                {:else}
                  <div class="setrows">
                    {#each e.sets as ps, pi (pi)}
                      <div class="setrow">
                        <span class="setno">{ps.setNumber}</span>
                        <select class="select tiny" bind:value={ps.type} aria-label="Set type">
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
                        <button type="button" class="setx" onclick={() => removeSet(e, pi)} aria-label="Remove set"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
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
      <div class="addday">
        <Button variant="ghost" type="button" onclick={addSession}>+ Add training day</Button>
      </div>
      {#if error}<p class="err">{error}</p>{/if}
      <p class="subtle hint">
        {totalSets} sets across {sessions.length} {sessions.length === 1 ? "day" : "days"}.
        Prefer help? <a href={`/clients/${id}/generate`}>Generate with AI</a> instead.
      </p>
    </div>
  </div>
{/if}

<style>
  .cols { display: grid; grid-template-columns: 4fr 8fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 12px; }

  .phasing { border-top: 1px solid var(--line); padding-top: 12px; }
  .phasing > .label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .phasing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .scheme-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .scheme-manage { margin-top: 6px; }
  .week-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .week-row { display: flex; align-items: center; gap: 8px; }
  .week-row .select { flex: 1; }
  .wk { font: 500 12px var(--font-mono); width: 28px; color: var(--muted); }
  .save-row { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
  .derived-val { margin: 6px 0 0; font: 600 14px var(--font-mono); }

  .builder-col { display: flex; flex-direction: column; gap: 18px; }
  .sess-name {
    font: 600 14px/1.3 var(--font-ui);
    border: none; background: none; color: var(--ink);
    padding: 0; width: 220px;
  }
  .sess-name:focus { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
  .head-actions { display: flex; gap: 6px; }

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
  .setno { width: 16px; text-align: right; color: var(--faint); font-family: var(--font-mono); font-size: 12px; }
  .select.tiny { width: auto; padding: 3px 6px; font-size: 12.5px; }
  .mini { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
  .mini .input { width: 58px; padding: 3px 6px; text-align: right; font-family: var(--font-mono); font-size: 12.5px; }
  .setx { border: none; background: none; color: var(--faint); cursor: pointer; padding: 2px; display: inline-flex; }
  .setx svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }
  .setx:hover { color: var(--bad); }

  .addday { align-self: flex-start; }
  .hint { margin: 0; }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
