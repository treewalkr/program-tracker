<script lang="ts">
  import {
    CARDIO_DEFAULT,
    CARDIO_UNIT_WORD,
    DAY_SHORT,
    hasCardio,
    stackNote,
    weekSummary,
    type ProfileForm,
  } from "$lib/clientProfile";
  import DayChips from "$lib/components/DayChips.svelte";

  /**
   * A client's training week: lifting sessions a week (stepper), lifting days
   * (day chips), and a Cardio switch that reveals cardio days, the long session
   * day and the weekly cardio target. Days are ISO 1=Mon … 7=Sun, kept sorted.
   * A one-line summary reads the week back. Bound to the profile form; the
   * parent owns the save.
   */
  let { form = $bindable(), idPrefix }: { form: ProfileForm; idPrefix: string } = $props();

  const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MIN = 1;
  const MAX = 7;

  /** Switched on by hand with nothing set yet; any saved cardio setting keeps the switch on (restore, Discard). */
  let cardioPicked = $state(false);
  const cardio = $derived(cardioPicked || hasCardio(form));

  const sessions = $derived(Number(form.sessionsPerWeek));
  const stack = $derived(stackNote(sessions, form.trainingDays.length));
  const summary = $derived(weekSummary(form, cardio));

  function step(by: number) {
    form.sessionsPerWeek = Math.min(MAX, Math.max(MIN, sessions + by));
  }

  function setCardio(on: boolean) {
    cardioPicked = on;
    if (on) return;
    form.cardioDays = [];
    form.longRunDay = null;
    form.cardioUnit = "none";
  }

  function setUnit(unit: ProfileForm["cardioUnit"]) {
    form.cardioUnit = unit;
    if (unit !== "none") form.cardioValue = CARDIO_DEFAULT[unit];
  }
</script>

<div class="twk">
  <div>
    <span class="label" id="{idPrefix}-spw-label">Lifting sessions a week</span>
    <div class="twk-step-row">
      <div class="stepper" role="group" aria-labelledby="{idPrefix}-spw-label">
        <button type="button" class="step" aria-label="One fewer session" disabled={sessions <= MIN} onclick={() => step(-1)}>−</button>
        <output class="step-val" aria-live="polite">{sessions}</output>
        <button type="button" class="step" aria-label="One more session" disabled={sessions >= MAX} onclick={() => step(1)}>+</button>
      </div>
      {#if stack}<span class="stack" role="status">{stack}</span>{/if}
    </div>
  </div>

  <DayChips bind:days={form.trainingDays} label="Lifting days" idPrefix="{idPrefix}-lift" empty="No fixed days — sessions are spread across the week" />

  <div class="twk-cardio">
    <label class="twk-switch">
      <input type="checkbox" checked={cardio} onchange={(e) => setCardio(e.currentTarget.checked)} />
      Cardio <span class="subtle">— runs, rides, swims</span>
    </label>

    {#if cardio}
      <div class="twk-cardio-body">
        <DayChips bind:days={form.cardioDays} label="Cardio days" idPrefix="{idPrefix}-cardio" empty="No fixed days — on lifting days" />
        <div class="twk-cardio-row">
          <div>
            <label class="label" for="{idPrefix}-long">Long session day <span class="subtle">— long run, ride or swim</span></label>
            <select
              class="select"
              id="{idPrefix}-long"
              value={form.longRunDay == null ? "" : String(form.longRunDay)}
              onchange={(e) => (form.longRunDay = e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
            >
              <option value="">No preference</option>
              {#each DAY_FULL as name, i (name)}<option value={String(i + 1)}>{name}</option>{/each}
            </select>
          </div>
          <div>
            <label class="label" for="{idPrefix}-target">Weekly target <span class="subtle">— resets every Monday</span></label>
            <div class="twk-target">
              <select class="select" id="{idPrefix}-target" value={form.cardioUnit} onchange={(e) => setUnit(e.currentTarget.value as ProfileForm["cardioUnit"])}>
                <option value="none">No target</option>
                <option value="minutes">Minutes</option>
                <option value="sessions">Sessions</option>
                <option value="zone_minutes">Zone minutes</option>
              </select>
              {#if form.cardioUnit !== "none"}
                <input class="input tnum" type="number" inputmode="numeric" min="1" max="10000" bind:value={form.cardioValue} aria-label="Target {CARDIO_UNIT_WORD[form.cardioUnit]}" />
                <span class="subtle">{CARDIO_UNIT_WORD[form.cardioUnit]}</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <p class="summary" aria-live="polite">{summary}</p>
</div>

<style>
  .twk { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .twk-step-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

  .stepper {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--well);
    overflow: hidden;
  }
  .step {
    width: 32px;
    min-height: 30px;
    border: none;
    background: none;
    font: 500 16px/1 var(--font-ui);
    color: var(--ink);
    cursor: pointer;
  }
  .step:hover:not(:disabled) { background: var(--well-2); }
  .step:disabled { color: var(--faint); cursor: default; }
  .step:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .step-val {
    display: grid;
    place-items: center;
    min-width: 36px;
    border-inline: 1px solid var(--line);
    background: var(--surface);
    font: 500 13px var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .stack { font-size: 12.5px; color: var(--warn); }

  .twk-cardio { display: flex; flex-direction: column; gap: 12px; padding-top: 16px; border-top: 1px solid var(--line); }
  .twk-switch { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; font: 500 14px var(--font-ui); color: var(--ink); cursor: pointer; }
  .twk-switch input { width: 16px; height: 16px; margin: 0; accent-color: var(--hover-ink); cursor: pointer; }
  .twk-cardio-body { display: flex; flex-direction: column; gap: 14px; padding-left: 12px; border-left: 2px solid var(--line); }
  .twk-cardio-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
  .twk-target { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .twk-target .select { width: auto; }
  .twk-target .input { width: 96px; }

  .summary { margin: 0; font-size: 13px; color: var(--muted); }

  @media (max-width: 700px) {
    .step { width: 40px; min-height: 38px; }
    .twk-switch input { width: 20px; height: 20px; }
    .twk-cardio-row { grid-template-columns: minmax(0, 1fr); }
    .twk-cardio-body { padding-left: 0; border-left: none; }
  }
</style>
