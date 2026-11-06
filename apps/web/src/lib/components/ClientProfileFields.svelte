<script lang="ts">
  import type { ProfileForm } from "$lib/clientProfile";
  import Field from "$lib/ui/Field.svelte";
  import WeekdayPicker from "$lib/components/WeekdayPicker.svelte";

  /** Schedule + "For the AI" sections of a client profile. The parent owns the form and its save. */
  let { form = $bindable(), idPrefix }: { form: ProfileForm; idPrefix: string } = $props();

  /** More lifting sessions than available days → some days stack. */
  const stacks = $derived(form.trainingDays.length > 0 && Number(form.sessionsPerWeek) > form.trainingDays.length);
</script>

<section class="pf-sec">
  <h3>Schedule</h3>
  <Field label="Lifting sessions a week" htmlFor="{idPrefix}-sessions" hint="cardio sessions don't count">
    <select class="select count" id="{idPrefix}-sessions" bind:value={form.sessionsPerWeek}>
      {#each [1, 2, 3, 4, 5, 6, 7] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
  </Field>
  <Field label="Available days" hint="sessions are placed on these days; a day can hold more than one">
    <div class="days-row">
      <WeekdayPicker bind:days={form.trainingDays} />
      {#if stacks}<span class="subtle">Some days will hold two sessions</span>{/if}
    </div>
  </Field>
  <Field label="Weekly cardio target" hint="resets every Monday">
    <div class="cardio-fields">
      {#if form.cardioUnit !== "none"}
        <input class="input tnum" type="number" inputmode="numeric" min="1" max="10000" bind:value={form.cardioValue} aria-label="Cardio target value" />
      {/if}
      <select class="select" bind:value={form.cardioUnit} aria-label="Cardio target unit">
        <option value="none">No cardio target</option>
        <option value="minutes">minutes</option>
        <option value="sessions">sessions</option>
        <option value="zone_minutes">zone minutes</option>
      </select>
    </div>
  </Field>
</section>

<section class="pf-sec">
  <h3>For the AI</h3>
  <Field label="Goals" htmlFor="{idPrefix}-goals">
    <textarea class="textarea" id="{idPrefix}-goals" rows="2" maxlength="2000" placeholder="e.g. Squat 140kg by spring, run a sub-25 min 5k" bind:value={form.goals}></textarea>
  </Field>
  <Field label="Limitations" htmlFor="{idPrefix}-lim" hint="hard constraints every draft must respect">
    <textarea class="textarea" id="{idPrefix}-lim" rows="2" maxlength="2000" placeholder="e.g. Left shoulder impingement — no overhead pressing" bind:value={form.limitations}></textarea>
  </Field>
</section>

<style>
  .pf-sec { display: flex; flex-direction: column; gap: 14px; }
  .pf-sec h3 {
    margin: 0;
    font: 600 11.5px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .days-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .select.count { width: auto; }
  .cardio-fields { display: flex; gap: 8px; align-items: center; }
  .cardio-fields .select { width: auto; }
  .cardio-fields .input { width: 110px; }
</style>
