<script lang="ts">
  import { CARDIO_DEFAULT, stackNote, type ProfileForm } from "$lib/clientProfile";
  import Field from "$lib/ui/Field.svelte";
  import WeekdayPicker from "$lib/components/WeekdayPicker.svelte";

  /**
   * Schedule + "For the AI" sections of a client profile. The parent owns the
   * form and its save. `collapsible` tucks the optional cardio target and AI
   * notes behind "More details" (new-client form); Settings shows everything.
   */
  let {
    form = $bindable(),
    idPrefix,
    collapsible = false,
  }: { form: ProfileForm; idPrefix: string; collapsible?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let expanded = $state(!collapsible || form.cardioUnit !== "none" || form.goals.trim() !== "" || form.limitations.trim() !== "");
  const stack = $derived(stackNote(form.sessionsPerWeek, form.trainingDays.length));
  const UNIT_WORD = { minutes: "minutes a week", sessions: "sessions a week", zone_minutes: "zone minutes a week" } as const;

  function setUnit(unit: ProfileForm["cardioUnit"]) {
    form.cardioUnit = unit;
    if (unit !== "none") form.cardioValue = CARDIO_DEFAULT[unit];
  }
</script>

<section class="pf-sec">
  <h3>Schedule</h3>
  <Field label="Lifting sessions a week" htmlFor="{idPrefix}-sessions" hint="cardio sessions don't count">
    <select class="select count" id="{idPrefix}-sessions" bind:value={form.sessionsPerWeek}>
      {#each [1, 2, 3, 4, 5, 6, 7] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
  </Field>
  <fieldset class="fs">
    <legend class="label">Available days <span class="subtle">— sessions are placed on these days; none picked leaves every session on “any day”</span></legend>
    <div class="days-row">
      <WeekdayPicker bind:days={form.trainingDays} />
      {#if stack}<span class="note" role="status">{stack}</span>{/if}
    </div>
  </fieldset>
</section>

{#if !expanded}
  <button type="button" class="more" aria-expanded="false" onclick={() => (expanded = true)}>
    More details <span class="subtle">— cardio target, goals, limitations · optional, can be set later in Settings</span>
  </button>
{:else}
  <section class="pf-sec">
    <fieldset class="fs">
      <legend class="label">Weekly cardio target <span class="subtle">— resets every Monday</span></legend>
      <div class="cardio-fields">
        <select class="select" value={form.cardioUnit} onchange={(e) => setUnit(e.currentTarget.value as ProfileForm["cardioUnit"])} aria-label="Cardio target unit">
          <option value="none">No cardio target</option>
          <option value="minutes">Minutes</option>
          <option value="sessions">Sessions</option>
          <option value="zone_minutes">Zone minutes</option>
        </select>
        {#if form.cardioUnit !== "none"}
          <input class="input tnum" type="number" inputmode="numeric" min="1" max="10000" bind:value={form.cardioValue} aria-label="Target {UNIT_WORD[form.cardioUnit]}" />
          <span class="subtle">{UNIT_WORD[form.cardioUnit]}</span>
        {/if}
      </div>
    </fieldset>
  </section>

  <section class="pf-sec">
    <h3>For the AI <span class="cue">feeds every AI draft</span></h3>
    <Field label="Goals" htmlFor="{idPrefix}-goals">
      <textarea class="textarea" id="{idPrefix}-goals" rows="2" maxlength="2000" placeholder="e.g. Squat 140kg by spring, run a sub-25 min 5k" bind:value={form.goals}></textarea>
    </Field>
    <Field label="Limitations" htmlFor="{idPrefix}-lim" hint="hard constraints every draft must respect">
      <textarea class="textarea" id="{idPrefix}-lim" rows="3" maxlength="2000" placeholder="e.g. Left shoulder impingement — no overhead pressing" bind:value={form.limitations}></textarea>
    </Field>
  </section>
{/if}

<style>
  .fs { border: none; margin: 0; padding: 0; min-width: 0; }
  .fs legend { padding: 0; }
  .days-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .note { font-size: 12.5px; color: var(--warn); }
  .select.count { width: auto; }
  .cardio-fields { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .cardio-fields .select { width: auto; }
  .cardio-fields .input { width: 96px; }
  .cue {
    margin-left: 8px;
    font: 500 11px/1 var(--font-ui);
    letter-spacing: 0;
    text-transform: none;
    color: var(--blue);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 2px 8px;
  }
  .more {
    align-self: flex-start;
    border: 1px dashed var(--line-strong);
    border-radius: 6px;
    background: none;
    padding: 8px 12px;
    font: 500 13px var(--font-ui);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .more:hover { background: var(--well); }
  .more:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
