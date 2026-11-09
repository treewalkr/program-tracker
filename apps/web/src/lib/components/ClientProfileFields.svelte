<script lang="ts">
  import {
    birthDateError,
    bodyweightError,
    heightError,
    startedOnError,
    type ProfileForm,
  } from "$lib/clientProfile";
  import { BIRTH_DATE_MIN, BODYWEIGHT_KG_RANGE, HEIGHT_CM_RANGE, STARTED_ON_MIN, ageOn, startedOnMax } from "@pt/shared";
  import Field from "$lib/ui/Field.svelte";
  import TrainingWeekGrid from "$lib/components/TrainingWeekGrid.svelte";
  import ProfileSection from "$lib/components/ProfileSection.svelte";
  import ExercisePicker from "$lib/components/ExercisePicker.svelte";
  import type { ExerciseDto } from "$lib/api/types";
  import { localIso } from "$lib/overview";

  /**
   * The intake boxes of a client profile, in the order a trainer asks:
   * Goals & limitations, Training week, Basics, then 1RMs. The parent owns the
   * form and its save. With a `catalog`, the client's 1RMs are editable too
   * (they resolve %1RM sets). `compact1rm` (new-client form) tucks the 1RMs
   * behind a small "+ Add 1RMs" link until clicked or a row exists.
   */
  let {
    form = $bindable(),
    idPrefix,
    compact1rm = false,
    catalog = null,
  }: { form: ProfileForm; idPrefix: string; compact1rm?: boolean; catalog?: ExerciseDto[] | null } = $props();

  function addOneRepMax() {
    form.oneRepMaxes.push({ exerciseId: "", kg: null, date: localIso(new Date()) });
  }

  /** Set by "+ Add 1RMs"; a restored draft with rows shows the box on its own. */
  let ormOpened = $state(false);
  const ormShown = $derived(!compact1rm || ormOpened || form.oneRepMaxes.length > 0);

  function openOneRepMaxes() {
    ormOpened = true;
    if (!form.oneRepMaxes.length) addOneRepMax();
  }

  const today = localIso(new Date());
  const age = $derived(form.birthDate && !birthDateError(form.birthDate, today) ? ageOn(form.birthDate, today) : null);
  const errs = $derived({
    birth: birthDateError(form.birthDate, today) ?? undefined,
    since: startedOnError(form.startedOn, today) ?? undefined,
    weight: bodyweightError(form.bodyweightKg) ?? undefined,
    height: heightError(form.heightCm) ?? undefined,
  });
</script>

<ProfileSection title="Goals & limitations" purpose="every AI draft respects these">
  <Field label="Goals" htmlFor="{idPrefix}-goals">
    <textarea class="textarea" id="{idPrefix}-goals" rows="2" maxlength="2000" placeholder="e.g. Squat 140kg by spring, run a sub-25 min 5k" bind:value={form.goals}></textarea>
  </Field>
  <Field label="Limitations" htmlFor="{idPrefix}-lim" hint="hard constraints every draft must respect">
    <textarea class="textarea" id="{idPrefix}-lim" rows="3" maxlength="2000" placeholder="e.g. Left shoulder impingement — no overhead pressing" bind:value={form.limitations}></textarea>
  </Field>
</ProfileSection>

<ProfileSection title="Training week" purpose="where lifting and cardio land on the calendar">
  <TrainingWeekGrid bind:form {idPrefix} />
</ProfileSection>

<ProfileSection title="Basics" purpose="used for age, loading and AI context">
  <div class="basics-row">
    <Field label="Experience" htmlFor="{idPrefix}-exp">
      <select class="select" id="{idPrefix}-exp" bind:value={form.experience}>
        <option value="">Not set</option>
        <option value="beginner">Beginner — under 1 yr</option>
        <option value="intermediate">Intermediate — 1–3 yrs</option>
        <option value="advanced">Advanced — 3+ yrs</option>
      </select>
    </Field>
    <Field label="Sex" htmlFor="{idPrefix}-sex">
      <select class="select" id="{idPrefix}-sex" bind:value={form.sex}>
        <option value="">Not specified</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
    </Field>
  </div>
  <div class="basics-row">
    <Field label="Date of birth" htmlFor="{idPrefix}-dob" hint={age != null ? `${age} yrs` : undefined} error={errs.birth}>
      <input class="input" id="{idPrefix}-dob" type="date" min={BIRTH_DATE_MIN} max={today} aria-invalid={errs.birth ? "true" : undefined} bind:value={form.birthDate} />
    </Field>
    <Field label="Client since" htmlFor="{idPrefix}-since" error={errs.since}>
      <input class="input" id="{idPrefix}-since" type="date" min={STARTED_ON_MIN} max={startedOnMax(today)} aria-invalid={errs.since ? "true" : undefined} bind:value={form.startedOn} />
    </Field>
  </div>
  <div class="basics-row">
    <Field label="Bodyweight" htmlFor="{idPrefix}-bw" error={errs.weight}>
      <span class="unit-input">
        <input class="input tnum" id="{idPrefix}-bw" type="number" inputmode="decimal" min={BODYWEIGHT_KG_RANGE.min} max={BODYWEIGHT_KG_RANGE.max} step="0.1" placeholder="—" aria-invalid={errs.weight ? "true" : undefined} bind:value={form.bodyweightKg} />
        <span class="subtle">kg</span>
      </span>
    </Field>
    <Field label="Height" htmlFor="{idPrefix}-ht" error={errs.height}>
      <span class="unit-input">
        <input class="input tnum" id="{idPrefix}-ht" type="number" inputmode="decimal" min={HEIGHT_CM_RANGE.min} max={HEIGHT_CM_RANGE.max} step="0.5" placeholder="—" aria-invalid={errs.height ? "true" : undefined} bind:value={form.heightCm} />
        <span class="subtle">cm</span>
      </span>
    </Field>
  </div>
</ProfileSection>

{#if catalog && ormShown}
  <ProfileSection title="1RMs" purpose="sets prescribed as % of 1RM take their kg from these">
    {#if form.oneRepMaxes.length}
      <div class="orm-list">
        {#each form.oneRepMaxes as r, i (i)}
          <div class="orm-row">
            <ExercisePicker value={r.exerciseId} {catalog} label="1RM {i + 1} exercise" onpick={(ex) => (r.exerciseId = ex.id)} />
            <span class="orm-kg">
              <input class="input tnum" type="number" inputmode="decimal" min="1" max="600" step="0.5" placeholder="—" aria-label="1RM {i + 1} kg" bind:value={r.kg} />
              <span class="subtle">kg</span>
            </span>
            <input class="input orm-date" type="date" aria-label="1RM {i + 1} tested on" bind:value={r.date} />
            <button type="button" class="orm-x" aria-label="Remove 1RM {i + 1}" onclick={() => form.oneRepMaxes.splice(i, 1)}>×</button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="orm-empty">No 1RMs yet</p>
    {/if}
    <button type="button" class="orm-add" onclick={addOneRepMax}>+ Add a 1RM</button>
  </ProfileSection>
{:else if catalog}
  <p class="orm-more">
    <button type="button" class="orm-add" onclick={openOneRepMaxes}>+ Add 1RMs</button>
    <span class="subtle">— usually tested in the first week</span>
  </p>
{/if}

<style>
  .basics-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
  .unit-input { display: flex; align-items: center; gap: 6px; }
  .unit-input .input { width: 96px; text-align: right; }
  .input[aria-invalid="true"] { border-color: var(--bad); }
  @media (max-width: 700px) {
    .basics-row { grid-template-columns: minmax(0, 1fr); }
  }
  .orm-list { display: flex; flex-direction: column; gap: 6px; }
  .orm-empty { margin: 0; font-size: 13px; color: var(--muted); }
  .orm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .orm-row :global(.xp) { flex: 1 1 220px; min-width: 0; }
  .orm-kg { display: inline-flex; align-items: center; gap: 6px; }
  .orm-kg .input { width: 84px; text-align: right; }
  .orm-date { width: auto; }
  .orm-x { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 16px; padding: 0 4px; }
  .orm-x:hover { color: var(--bad); }
  .orm-add { align-self: flex-start; border: none; background: none; padding: 0; font: 500 13px var(--font-ui); color: var(--blue); cursor: pointer; }
  .orm-add:hover { text-decoration: underline; }
  .orm-more { margin: 0; }
</style>
