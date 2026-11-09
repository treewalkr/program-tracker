<script lang="ts">
  import { DAY_SHORT, stackNote, weekSummary, type ProfileForm } from "$lib/clientProfile";

  /**
   * One grid for a client's training week: lifting sessions a week (stepper),
   * then Lift / Run toggle rows and a Long run radio row across Mon–Sun.
   * Days are ISO 1=Mon … 7=Sun; arrays stay sorted. A one-line summary reads
   * the week back. Bound to the profile form; the parent owns the save.
   */
  let { form = $bindable(), idPrefix }: { form: ProfileForm; idPrefix: string } = $props();

  const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAYS = [1, 2, 3, 4, 5, 6, 7];
  const MIN = 1;
  const MAX = 7;

  const sessions = $derived(Number(form.sessionsPerWeek));
  const stack = $derived(stackNote(sessions, form.trainingDays.length));
  const summary = $derived(weekSummary(form));

  const toggled = (days: number[], d: number) =>
    days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);

  function step(by: number) {
    form.sessionsPerWeek = Math.min(MAX, Math.max(MIN, sessions + by));
  }
</script>

{#snippet toggleRow(kind: "Lift" | "Run", days: number[], set: (days: number[]) => void)}
  <tr>
    <th scope="row" class="rowh">{kind}</th>
    {#each DAYS as d (d)}
      {@const on = days.includes(d)}
      <td>
        <button
          type="button"
          class="cell"
          class:on
          aria-pressed={on}
          aria-label="{kind} on {DAY_FULL[d - 1]}"
          onclick={() => set(toggled(days, d))}
        >{#if on}<span aria-hidden="true">{kind}</span>{/if}</button>
      </td>
    {/each}
    <td></td>
  </tr>
{/snippet}

<div class="twg">
  <div class="twg-top">
    <span class="label" id="{idPrefix}-spw-label">Lifting sessions a week <span class="subtle">— cardio sessions don't count</span></span>
    <div class="twg-step-row">
      <div class="stepper" role="group" aria-labelledby="{idPrefix}-spw-label">
        <button type="button" class="step" aria-label="One fewer session" disabled={sessions <= MIN} onclick={() => step(-1)}>−</button>
        <output class="step-val" aria-live="polite">{sessions}</output>
        <button type="button" class="step" aria-label="One more session" disabled={sessions >= MAX} onclick={() => step(1)}>+</button>
      </div>
      {#if stack}<span class="stack" role="status">{stack}</span>{/if}
    </div>
  </div>

  <div class="twg-scroll">
    <table class="twg-table">
      <caption class="vh">Training week — lifting days, run days and the long run day</caption>
      <thead>
        <tr>
          <td class="corner"></td>
          {#each DAYS as d (d)}
            <th scope="col"><abbr title={DAY_FULL[d - 1]}>{DAY_SHORT[d - 1]}</abbr></th>
          {/each}
          <th scope="col" class="any-h">Any</th>
        </tr>
      </thead>
      <tbody>
        {@render toggleRow("Lift", form.trainingDays, (days) => (form.trainingDays = days))}
        {@render toggleRow("Run", form.cardioDays, (days) => (form.cardioDays = days))}
        <tr>
          <th scope="row" class="rowh">Long run</th>
          {#each DAYS as d (d)}
            <td>
              <label class="cell radio">
                <input
                  type="radio"
                  name="{idPrefix}-long-run"
                  value={d}
                  checked={form.longRunDay === d}
                  onchange={() => (form.longRunDay = d)}
                />
                <span class="vh">Long run on {DAY_FULL[d - 1]}</span>
                <span class="dot" aria-hidden="true"></span>
              </label>
            </td>
          {/each}
          <td>
            <label class="cell radio">
              <input
                type="radio"
                name="{idPrefix}-long-run"
                value=""
                checked={form.longRunDay == null}
                onchange={() => (form.longRunDay = null)}
              />
              <span class="vh">Long run on any day</span>
              <span class="dot" aria-hidden="true"></span>
            </label>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <p class="summary" aria-live="polite">{summary}</p>
</div>

<style>
  .twg { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .twg-top .label { margin-bottom: 6px; }
  .twg-step-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

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

  .twg-scroll { overflow-x: auto; }
  .twg-table { border-collapse: separate; border-spacing: 4px; min-width: 400px; margin: -4px; }
  thead th {
    font: 500 12px/1.4 var(--font-ui);
    color: var(--muted);
    text-align: center;
    padding: 0 0 2px;
  }
  thead abbr { text-decoration: none; }
  .any-h { color: var(--faint); }
  .rowh {
    font: 500 13px/1.3 var(--font-ui);
    color: var(--ink);
    text-align: left;
    white-space: nowrap;
    padding-right: 8px;
  }
  td { padding: 0; }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 40px;
    min-height: 36px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--surface);
    font: 500 10px/1.2 var(--font-mono);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--on-ink);
    cursor: pointer;
  }
  .cell:hover { border-color: var(--line-strong); background: var(--well); }
  .cell.on, .cell.on:hover { background: var(--hover-ink); border-color: var(--hover-ink); }

  .radio { position: relative; }
  .radio input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
  .radio .dot {
    width: 12px;
    height: 12px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
  }
  .radio:has(input:checked) { background: var(--hover-ink); border-color: var(--hover-ink); }
  .radio:has(input:checked) .dot { border-color: var(--on-ink); background: var(--on-ink); }
  .radio:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 1px; }

  .summary { margin: 0; font-size: 13px; color: var(--muted); }

  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 700px) {
    .cell { min-height: 40px; }
    .step { width: 40px; min-height: 38px; }
  }
</style>
