<script lang="ts">
  import {
    birthDateError,
    bodyweightError,
    heightError,
    startedOnError,
    type ProfileForm,
  } from "$lib/clientProfile";
  import { BIRTH_DATE_MIN, BODYWEIGHT_KG_RANGE, HEIGHT_CM_RANGE, STARTED_ON_MIN, ageOn, startedOnMax } from "@pt/shared";
  import InputDate from "$lib/ui/InputDate.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import InputUnit from "$lib/ui/InputUnit.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import type { SelectOption } from "$lib/ui/select/options";
  import TrainingWeekGrid from "$lib/components/TrainingWeekGrid.svelte";
  import ProfileSection from "$lib/components/ProfileSection.svelte";
  import ExercisePicker from "$lib/components/ExercisePicker.svelte";
  import type { ExerciseDto } from "$lib/api/types";
  import { localIso } from "$lib/overview";
  import { showWeight, storeWeight, weightUnit } from "$lib/units.svelte";

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

  const EXPERIENCE_OPTIONS: SelectOption<ProfileForm["experience"]>[] = [
    { value: "", label: "Not set" },
    { value: "beginner", label: "Beginner — under 1 yr" },
    { value: "intermediate", label: "Intermediate — 1–3 yrs" },
    { value: "advanced", label: "Advanced — 3+ yrs" },
  ];
  const SEX_OPTIONS: SelectOption<ProfileForm["sex"]>[] = [
    { value: "", label: "Not specified" },
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
  ];

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
  <InputNote label="Goals" id="{idPrefix}-goals" rows={2} maxlength={2000} placeholder="e.g. Squat 140kg by spring, run a sub-25 min 5k" bind:value={form.goals} />
  <InputNote
    label="Limitations"
    id="{idPrefix}-lim"
    rows={3}
    maxlength={2000}
    hint="Hard constraints every draft must respect"
    placeholder="e.g. Left shoulder impingement — no overhead pressing"
    bind:value={form.limitations}
  />
</ProfileSection>

<ProfileSection title="Training week" purpose="where exercise sessions and cardio land on the calendar">
  <TrainingWeekGrid bind:form {idPrefix} />
</ProfileSection>

<ProfileSection title="Basics" purpose="used for age, loading and AI context">
  <div class="basics-row">
    <SelectField label="Experience" options={EXPERIENCE_OPTIONS} maxWidth="none" bind:value={form.experience} />
    <SelectField label="Sex" options={SEX_OPTIONS} maxWidth="none" bind:value={form.sex} />
  </div>
  <div class="basics-row">
    <InputDate label="Date of birth" {today} min={BIRTH_DATE_MIN} max={today} hint={age != null ? `${age} yrs` : null} error={errs.birth} bind:value={form.birthDate} />
    <InputDate label="Client since" {today} min={STARTED_ON_MIN} max={startedOnMax(today)} error={errs.since} bind:value={form.startedOn} />
  </div>
  <div class="basics-row">
    <InputUnit
      label="Bodyweight"
      unit={weightUnit()}
      step={0.5}
      min={Math.floor(showWeight(BODYWEIGHT_KG_RANGE.min))}
      max={Math.ceil(showWeight(BODYWEIGHT_KG_RANGE.max))}
      error={errs.weight}
      bind:value={() => (form.bodyweightKg == null ? null : showWeight(form.bodyweightKg)), (v) => (form.bodyweightKg = v == null ? null : storeWeight(v))}
    />
    <InputUnit label="Height" unit="cm" step={0.5} min={HEIGHT_CM_RANGE.min} max={HEIGHT_CM_RANGE.max} error={errs.height} bind:value={form.heightCm} />
  </div>
</ProfileSection>

{#if catalog && ormShown}
  <ProfileSection title="1RMs" purpose="sets prescribed as % of 1RM take their load from these">
    {#if form.oneRepMaxes.length}
      <div class="orm-list">
        {#each form.oneRepMaxes as r, i (i)}
          <div class="orm-row">
            <ExercisePicker value={r.exerciseId} {catalog} label="1RM {i + 1} exercise" onpick={(ex) => (r.exerciseId = ex.id)} />
            <div class="orm-kg">
              <InputUnit
                label="1RM {i + 1} {weightUnit()}"
                hideLabel
                unit={weightUnit()}
                width="auto"
                step={0.5}
                min={1}
                max={Math.ceil(showWeight(600))}
                bind:value={() => (r.kg == null ? null : showWeight(r.kg)), (v) => (r.kg = v == null ? null : storeWeight(v))}
              />
            </div>
            <div class="orm-date"><InputDate label="1RM {i + 1} tested on" hideLabel {today} bind:value={r.date} /></div>
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
  .basics-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  @media (max-width: 700px) {
    .basics-row { grid-template-columns: minmax(0, 1fr); }
  }
  .orm-list { display: flex; flex-direction: column; gap: 6px; }
  .orm-empty { margin: 0; font-size: 13px; color: var(--muted); }
  .orm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .orm-row :global(.xp) { flex: 1 1 220px; min-width: 0; }
  .orm-kg, .orm-date { flex: none; }
  .orm-x { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 16px; padding: 0 4px; }
  .orm-x:hover { color: var(--bad); }
  .orm-add { align-self: flex-start; border: none; background: none; padding: 0; font: 500 13px var(--font-ui); color: var(--blue); cursor: pointer; }
  .orm-add:hover { text-decoration: underline; }
  .orm-more { margin: 0; }
</style>
