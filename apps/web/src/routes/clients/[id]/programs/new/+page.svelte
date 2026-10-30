<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ClientDto, ExerciseDto, PeriodizationSchemeDto } from "$lib/api/types";
  import {
    applyDefaultWeekdays,
    EXERCISE_ROLE_INFO,
    EXERCISE_ROLES,
    sortExercisesByRole,
    stampWeeks,
    type ExerciseRole,
    type ProgramDay,
    type ProgramSession,
    type SetType,
    type WeekDirective,
    type WeekMetric,
    type WeekPlan,
  } from "@pt/shared";
  import { weekPlanLabel } from "$lib/format";
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
  interface CardioFields {
    modality: string;
    durationMin: number | null;
    hrZone: number | null;
    intensity: string;
    distanceKm: number | null;
    targetRpe: number | null;
  }
  interface SessionRow {
    key: string;
    name: string;
    kind: "lifting" | "cardio";
    weekday: number | null;
    cardio: CardioFields;
    exercises: ExRow[];
  }

  let sessions = $state<SessionRow[]>([
    {
      key: crypto.randomUUID(),
      name: "Day 1",
      kind: "lifting",
      weekday: null,
      cardio: { modality: "", durationMin: 30, hrZone: 2, intensity: "", distanceKm: null, targetRpe: null },
      exercises: [],
    },
  ]);

  interface CustomWeekRow {
    directive: WeekDirective;
    metric: WeekMetric | "";
    deltaPercent: number | null;
  }

  let schemeMode = $state<"saved" | "custom" | "none">("saved");
  let selectedSchemeId = $state<string>("");
  let customWeeks = $state<CustomWeekRow[]>([
    { directive: "base", metric: "", deltaPercent: null },
    { directive: "+volume", metric: "overall_volume", deltaPercent: 5 },
    { directive: "+intensity", metric: "intensity", deltaPercent: 2.5 },
    { directive: "transition", metric: "", deltaPercent: null },
  ]);
  let schemeName = $state("");
  let savingScheme = $state(false);
  const DIRECTIVES: WeekDirective[] = ["base", "+volume", "+intensity", "deload", "transition", "test"];
  const METRICS: { value: WeekMetric; label: string }[] = [
    { value: "overall_volume", label: "Overall vol" },
    { value: "rep_volume", label: "Rep vol" },
    { value: "intensity", label: "Intensity" },
  ];

  const activeWeekPlans = $derived.by<WeekPlan[]>(() => {
    if (schemeMode === "custom") {
      return customWeeks.map((cw, i) => ({
        week: i + 1,
        directive: cw.directive,
        target: cw.metric ? { metric: cw.metric, deltaPercent: Number(cw.deltaPercent ?? 0) } : undefined,
      }));
    }
    if (schemeMode === "saved" && selectedScheme) {
      return selectedScheme.weeks;
    }
    return [];
  });

  const selectedScheme = $derived(
    schemeMode === "saved" ? (schemes.find((s) => s.id === selectedSchemeId) ?? null) : null
  );

  $effect(() => {
    if (activeWeekPlans.length > 0) {
      plannedWeeks = activeWeekPlans.length;
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
        weeks: activeWeekPlans,
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

  const canSave = $derived.by(() => {
    if (name.trim() === "" || sessions.length === 0) return false;
    for (const s of sessions) {
      if (s.kind === "lifting") {
        if (s.exercises.length === 0 || !s.exercises.some((e) => e.sets.length > 0)) return false;
      } else {
        if (!s.cardio.modality.trim()) return false;
      }
    }
    return true;
  });

  function addSession() {
    const sorted = client?.trainingDays ? [...client.trainingDays].sort((a, b) => a - b) : [];
    const idx = sessions.length;
    sessions.push({
      key: crypto.randomUUID(),
      name: `Day ${idx + 1}`,
      kind: "lifting",
      weekday: sorted[idx] ?? null,
      cardio: { modality: "", durationMin: 30, hrZone: 2, intensity: "", distanceKm: null, targetRpe: null },
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

  function toTemplateDays(): ProgramDay[] {
    return sessions.map((s, si) => {
      let session: ProgramSession;
      if (s.kind === "cardio") {
        session = {
          id: crypto.randomUUID(),
          name: s.name.trim() || `Cardio ${si + 1}`,
          order: 0,
          kind: "cardio",
          exercises: [],
          cardio: {
            modality: s.cardio.modality.trim() || "Cardio",
            durationMin: s.cardio.durationMin != null && s.cardio.durationMin > 0 ? Number(s.cardio.durationMin) : null,
            hrZone: s.cardio.hrZone != null && s.cardio.hrZone >= 1 && s.cardio.hrZone <= 5 ? Number(s.cardio.hrZone) : null,
            intensity: s.cardio.intensity.trim() || undefined,
            distanceKm: s.cardio.distanceKm != null && s.cardio.distanceKm > 0 ? Number(s.cardio.distanceKm) : undefined,
            targetRpe: s.cardio.targetRpe != null && s.cardio.targetRpe >= 1 ? Number(s.cardio.targetRpe) : undefined,
          },
        };
      } else {
        session = {
          id: crypto.randomUUID(),
          name: s.name.trim() || `Day ${si + 1}`,
          order: 0,
          kind: "lifting",
          cardio: null,
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
        };
      }
      return {
        id: crypto.randomUUID(),
        day: si + 1,
        weekday: s.weekday,
        sessions: [session],
      };
    });
  }

  async function save() {
    saving = true;
    error = null;
    try {
      const template = toTemplateDays();
      const numWeeks = Number(plannedWeeks) || 4;
      const stamped = stampWeeks(template, numWeeks);
      let weeks = applyDefaultWeekdays(stamped, client?.trainingDays);
      weeks = weeks.map((w) => ({
        ...w,
        days: w.days.map((d, i) => ({
          ...d,
          weekday: sessions[i]?.weekday !== undefined ? sessions[i].weekday : d.weekday,
        })),
      }));

      const program = await api.createProgram({
        clientId: id,
        name: name.trim(),
        description: description.trim() || null,
        weeks,
        phasing: usePhasing
          ? {
              plannedWeeks: numWeeks,
              phase: phase.trim() || "block",
              nextPhase: nextPhase.trim() || null,
              weeks: activeWeekPlans.length > 0 ? activeWeekPlans : undefined,
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
    const sorted = client?.trainingDays ? [...client.trainingDays].sort((a, b) => a - b) : [];
    if (sessions.length > 0 && sessions[0].weekday === null && sorted.length > 0) {
      sessions[0].weekday = sorted[0];
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
                      <span class="dir {w.directive === '+volume' ? 'vol' : w.directive === '+intensity' ? 'int' : w.directive === 'transition' ? 'tr' : ''}">{weekPlanLabel(w)}</span>
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
                    {#each customWeeks as w, i (i)}
                      <div class="week-row">
                        <span class="wk">W{i + 1}</span>
                        <select class="select tiny" bind:value={w.directive}>
                          {#each DIRECTIVES as opt (opt)}
                            <option value={opt}>{opt}</option>
                          {/each}
                        </select>
                        <select class="select tiny" bind:value={w.metric}>
                          <option value="">No target</option>
                          {#each METRICS as m (m.value)}
                            <option value={m.value}>{m.label}</option>
                          {/each}
                        </select>
                        {#if w.metric !== ""}
                          <input
                            class="input tiny-num"
                            type="number"
                            min="-100"
                            max="200"
                            placeholder="±%"
                            bind:value={w.deltaPercent}
                          />
                        {/if}
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
                      <Button variant="ghost" small type="button" onclick={() => (customWeeks = [...customWeeks, { directive: "+volume", metric: "overall_volume", deltaPercent: 5 }])}>+ Add week</Button>
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
              {#if activeWeekPlans.length === 0}
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
                  <p class="derived-val">{activeWeekPlans.length} weeks</p>
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
            <select class="select tiny" bind:value={s.weekday} aria-label="Day weekday">
              <option value={null}>Weekday…</option>
              <option value={1}>Mon</option>
              <option value={2}>Tue</option>
              <option value={3}>Wed</option>
              <option value={4}>Thu</option>
              <option value={5}>Fri</option>
              <option value={6}>Sat</option>
              <option value={7}>Sun</option>
            </select>
            <select class="select tiny" bind:value={s.kind} aria-label="Session kind">
              <option value="lifting">Lifting</option>
              <option value="cardio">Cardio</option>
            </select>
            <div class="head-actions">
              {#if s.kind === "lifting"}
                <Button variant="ghost" small type="button" onclick={() => addExercise(s)}>+ Exercise</Button>
              {/if}
              {#if sessions.length > 1}
                <Button variant="danger" small type="button" onclick={() => removeSession(s.key)}>Remove day</Button>
              {/if}
            </div>
          </div>
          <div class="panel-body exlist">
            {#if s.kind === "cardio"}
              <div class="cardio-fields">
                <input class="input" placeholder="Modality (e.g. Bike, Run, Rower) *" bind:value={s.cardio.modality} maxlength="80" aria-label="Modality" />
                <div class="cardio-grid">
                  <label class="mini">Duration <input class="input tnum" type="number" min="1" max="300" bind:value={s.cardio.durationMin} placeholder="30" /> min</label>
                  <label class="mini">Zone <input class="input tnum" type="number" min="1" max="5" bind:value={s.cardio.hrZone} placeholder="1-5" /></label>
                  <label class="mini">Intensity <input class="input" bind:value={s.cardio.intensity} placeholder="easy, tempo…" maxlength="60" /></label>
                  <label class="mini">Distance <input class="input tnum" type="number" min="0" step="0.5" bind:value={s.cardio.distanceKm} placeholder="km" /> km</label>
                  <label class="mini">RPE <input class="input tnum" type="number" min="1" max="10" bind:value={s.cardio.targetRpe} placeholder="1-10" /></label>
                </div>
              </div>
            {:else}
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
            {/if}
          </div>
        </section>
      {/each}

      <Button variant="ghost" class="addday" onclick={addSession}>+ Add another day</Button>

      {#if error}<p class="error">{error}</p>{/if}
      <p class="subtle hint">
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
  .tiny-num { width: 60px; padding: 3px 6px; font-family: var(--font-mono); font-size: 12.5px; }
  .wk { font: 500 12px var(--font-mono); width: 28px; color: var(--muted); }
  .save-row { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
  .derived-val { margin: 6px 0 0; font: 600 14px var(--font-mono); }

  .builder-col { display: flex; flex-direction: column; gap: 18px; }
  .sess-name {
    font: 600 14px/1.3 var(--font-ui);
    border: none; background: none; color: var(--ink);
    padding: 0; width: 140px;
  }
  .sess-name:focus { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
  .head-actions { display: flex; gap: 6px; align-items: center; margin-left: auto; }

  .exlist { display: flex; flex-direction: column; gap: 12px; }
  .cardio-fields { display: flex; flex-direction: column; gap: 10px; }
  .cardio-grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
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

  :global(.addday) { align-self: flex-start; }
  .hint { margin: 0; }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
