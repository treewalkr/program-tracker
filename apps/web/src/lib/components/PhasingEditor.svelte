<script lang="ts">
  import type { ProgramPhasingDto, WeekDirective, WeekMetric } from "$lib/api/types";
  import { WEEK_DIRECTIVES, WEEK_METRICS } from "@pt/shared";
  import { phasingToRows, rowsToPhasing, type PhasingRow } from "$lib/phasing";

  let {
    phasing = $bindable(),
    weeksCount,
  }: {
    phasing: ProgramPhasingDto | null | undefined;
    weeksCount: number;
  } = $props();

  let enabled = $state(phasing != null);
  let phase = $state(phasing?.phase ?? "accumulation");
  let nextPhase = $state(phasing?.nextPhase ?? "");
  // svelte-ignore state_referenced_locally
  let rows = $state<PhasingRow[]>(
    phasingToRows(phasing ?? null).length > 0
      ? phasingToRows(phasing ?? null)
      : Array.from({ length: Math.max(2, weeksCount) }, (_, i) => ({
          directive: (i === weeksCount - 1 ? "deload" : i === 0 ? "base" : "+volume") as WeekDirective,
          metric: (i > 0 && i < weeksCount - 1 ? "overall_volume" : "") as WeekMetric | "",
          deltaPercent: i > 0 && i < weeksCount - 1 ? 5 : null,
        }))
  );

  const plannedWeeks = $derived(Math.max(rows.length, weeksCount));

  const METRIC_LABELS: Record<WeekMetric, string> = {
    overall_volume: "Overall vol",
    rep_volume: "Rep vol",
    intensity: "Intensity",
  };

  $effect(() => {
    if (!enabled) {
      phasing = null;
    } else {
      phasing = rowsToPhasing(rows, phase, nextPhase, weeksCount);
    }
  });
</script>

<div class="phasing-editor">
  <label class="enable-label">
    <input type="checkbox" bind:checked={enabled} />
    <span>Periodization plan</span>
  </label>

  {#if enabled}
    <div class="phase-inputs">
      <label class="field">
        <span class="field-label">Current phase</span>
        <input
          class="input"
          type="text"
          maxlength="120"
          placeholder="e.g. Accumulation"
          aria-label="Current phase"
          bind:value={phase}
        />
      </label>
      <label class="field">
        <span class="field-label">Next phase</span>
        <input
          class="input"
          type="text"
          maxlength="120"
          placeholder="e.g. Intensification (optional)"
          aria-label="Next phase"
          bind:value={nextPhase}
        />
      </label>
    </div>

    <div class="meta-row">
      <span class="derived-val">Planned: {plannedWeeks} weeks</span>
    </div>

    <div class="week-rows">
      {#each rows as r, i (i)}
        <div class="week-row">
          <span class="wk">W{i + 1}</span>
          <select class="select tiny" bind:value={r.directive} aria-label="Week {i + 1} directive">
            {#each WEEK_DIRECTIVES as opt (opt)}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
          <select class="select tiny" bind:value={r.metric} aria-label="Week {i + 1} metric">
            <option value="">No target</option>
            {#each WEEK_METRICS as m (m)}
              <option value={m}>{METRIC_LABELS[m]}</option>
            {/each}
          </select>
          {#if r.metric !== ""}
            <input
              class="input tiny-num"
              type="number"
              min="-100"
              max="200"
              placeholder="±%"
              aria-label="Week {i + 1} target delta %"
              bind:value={r.deltaPercent}
            />
          {/if}
          <button
            type="button"
            class="btn ghost small remove-wk"
            disabled={rows.length <= 2}
            onclick={() => {
              rows = rows.filter((_, j) => j !== i);
            }}
            aria-label="Remove week"
          >
            ✕
          </button>
        </div>
      {/each}

      <div class="add-row">
        <button
          type="button"
          class="btn ghost small"
          disabled={rows.length >= 26}
          onclick={() => {
            rows = [...rows, { directive: "+volume", metric: "", deltaPercent: null }];
          }}
        >
          + Add week
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .phasing-editor {
    border-top: 1px solid var(--line);
    padding-top: 14px;
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .enable-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 600;
  }
  .phase-inputs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field-label {
    font-size: 12px;
    color: var(--muted);
  }
  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  .derived-val {
    font: 600 13px var(--font-mono);
    color: var(--muted);
  }
  .week-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }
  .week-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .wk {
    font: 500 12px var(--font-mono);
    width: 28px;
    color: var(--muted);
  }
  .select.tiny {
    width: auto;
    padding: 3px 6px;
    font-size: 12.5px;
  }
  .tiny-num {
    width: 60px;
    padding: 3px 6px;
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .remove-wk {
    padding: 2px 6px;
  }
  .add-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
  }
</style>
