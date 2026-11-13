<script lang="ts">
  import type { ProgramPhasingDto, ProgramWeekDto, WeekDirective, WeekMetric } from "$lib/api/types";
  import type { OneRepMaxes } from "@pt/shared";
  import { phasingToRows, progressionPreview, rowsToPhasing, type PhasingRow } from "$lib/phasing";
  import WeekPlanRows from "./WeekPlanRows.svelte";

  let {
    phasing = $bindable(),
    weeksCount,
    weeks = null,
    oneRepMaxes = null,
    onapply,
  }: {
    phasing: ProgramPhasingDto | null | undefined;
    weeksCount: number;
    /** The program's weeks; with `onapply`, "Preview progression" generates weeks 2…n from W1. */
    weeks?: ProgramWeekDto[] | null;
    /** The client's 1RMs, for the planned volume in the preview. */
    oneRepMaxes?: OneRepMaxes | null;
    /** Writes the generated weeks into the program (unsaved until the trainer saves). */
    onapply?: (weeks: ProgramWeekDto[]) => void;
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

  const hasRules = $derived(rows.some((r, i) => i > 0 && r.progKind && r.progAmount));
  let previewOpen = $state(false);
  const preview = $derived(previewOpen && weeks && phasing ? progressionPreview(weeks, phasing, oneRepMaxes) : null);
  const fmtTonnage = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)} t` : `${Math.round(t)} kg`);
  const MAX_CHANGES = 6;

  function apply() {
    if (!preview || !onapply) return;
    onapply(preview.weeks);
    previewOpen = false;
  }

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

    <WeekPlanRows bind:rows>
      {#snippet actions()}
        {#if onapply && weeks}
          <button
            type="button"
            class="btn ghost small"
            disabled={!hasRules}
            title={hasRules
              ? weeks.some((w) => w.rotation)
                ? "Generate later A weeks from W1 and B weeks from W2, with each week's rule"
                : "Generate weeks 2 onward from week 1 with each week's rule"
              : "Set a progression rule on a week first"}
            aria-expanded={previewOpen}
            onclick={() => (previewOpen = !previewOpen)}>Preview progression</button
          >
        {/if}
      {/snippet}
    </WeekPlanRows>

    {#if preview}
      <section class="prog-preview" aria-label="Progression preview">
        <p class="prog-lead">
          Weeks 2–{preview.weeks.length} rebuilt from week 1. Replaces what those weeks hold now; nothing is saved until you save the program.
        </p>
        <ol class="prog-weeks">
          {#each preview.rows as row (row.week)}
            <li>
              <div class="prog-head">
                <span class="wk">W{row.week}</span>
                <span class="prog-rule">{row.rule}</span>
                <span class="prog-vol">{row.planned == null ? "no planned loads" : `${fmtTonnage(row.planned)} planned`}</span>
              </div>
              {#if row.isNew}
                <p class="prog-none">New week</p>
              {:else if row.changes.length === 0}
                <p class="prog-none">No change</p>
              {:else}
                <ul class="prog-changes">
                  {#each row.changes.slice(0, MAX_CHANGES) as c, ci (ci)}
                    <li><span class="prog-ex">{c.exercise}</span> {c.from ?? "—"} → {c.to ?? "—"}</li>
                  {/each}
                  {#if row.changes.length > MAX_CHANGES}<li class="prog-none">and {row.changes.length - MAX_CHANGES} more</li>{/if}
                </ul>
              {/if}
            </li>
          {/each}
        </ol>
        <div class="add-row">
          <button type="button" class="btn small" onclick={apply}>Write weeks 2–{preview.weeks.length}</button>
          <button type="button" class="btn ghost small" onclick={() => (previewOpen = false)}>Cancel</button>
        </div>
      </section>
    {/if}
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
  .wk {
    font: 500 12px var(--font-mono);
    width: 28px;
    color: var(--muted);
  }
  .prog-preview {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--well);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prog-lead { margin: 0; font-size: 13px; color: var(--muted); }
  .prog-weeks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .prog-head { display: flex; align-items: baseline; gap: 10px; }
  .prog-rule { font-weight: 600; font-size: 13px; }
  .prog-vol { margin-left: auto; font: 12px var(--font-mono); color: var(--muted); font-variant-numeric: tabular-nums; }
  .prog-changes { margin: 2px 0 0 38px; padding: 0; list-style: none; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .prog-ex { font-weight: 500; }
  .prog-none { margin: 2px 0 0 38px; font-size: 12.5px; color: var(--muted); }
  .add-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
  }
</style>
