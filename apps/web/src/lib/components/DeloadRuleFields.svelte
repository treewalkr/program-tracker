<script lang="ts">
  import { deloadRulesText, type DeloadSettings } from "@pt/shared";
  import Field from "$lib/ui/Field.svelte";

  /**
   * The five knobs of a deload rule, plus a live plain-language preview.
   * Every control picks from the allowed steps, so the value is always valid.
   * Shared by Settings (the trainer's rule) and the client page (an override).
   */
  interface Props {
    value: DeloadSettings;
    /** Prefix for control ids — two editors can share a page. */
    idPrefix?: string;
    disabled?: boolean;
  }

  let { value = $bindable(), idPrefix = "deload", disabled = false }: Props = $props();

  const range = (from: number, to: number, step: number) =>
    Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => +(from + i * step).toFixed(1));

  const SETS = range(25, 100, 5).reverse();
  const LOADS = range(-50, 0, 2.5).reverse();
  const RPES = range(4, 10, 0.5).reverse();
  const BASES: { value: DeloadSettings["loadBasis"]; label: string }[] = [
    { value: "previous", label: "Last week" },
    { value: "week1", label: "Week 1" },
  ];

  const setsLabel = (n: number) => (n === 100 ? "All" : n === 50 ? "Half" : `${n} %`);
  const loadLabel = (n: number) => (n === 0 ? "No change" : `−${Math.abs(n)} %`);

  const preview = $derived(deloadRulesText(value));
</script>

<div class="rule" class:off={disabled}>
  <div class="knobs">
    <Field label="Sets kept" htmlFor="{idPrefix}-sets">
      <select id="{idPrefix}-sets" class="select" {disabled} bind:value={value.setsKeptPercent}>
        {#each SETS as n (n)}<option value={n}>{setsLabel(n)}</option>{/each}
      </select>
    </Field>

    <Field label="Load" htmlFor="{idPrefix}-load">
      <select id="{idPrefix}-load" class="select" {disabled} bind:value={value.loadPercent}>
        {#each LOADS as n (n)}<option value={n}>{loadLabel(n)}</option>{/each}
      </select>
    </Field>

    <Field label="From">
      <div class="seg" role="radiogroup" aria-label="Load from">
        {#each BASES as b (b.value)}
          <label class="seg-opt" class:on={value.loadBasis === b.value}>
            <input type="radio" name="{idPrefix}-basis" value={b.value} {disabled} bind:group={value.loadBasis} />
            <span>{b.label}</span>
          </label>
        {/each}
      </div>
    </Field>

    <Field label="RPE cap" htmlFor="{idPrefix}-rpe">
      <select id="{idPrefix}-rpe" class="select" {disabled} bind:value={value.rpeCap}>
        <option value={null}>No cap</option>
        {#each RPES as n (n)}<option value={n}>{n}</option>{/each}
      </select>
    </Field>

    <label class="amrap">
      <input type="checkbox" {disabled} bind:checked={value.amrap} />
      <span>Keep AMRAP sets</span>
    </label>
  </div>

  <p class="preview" aria-live="polite"><span class="pv-k">A deload week:</span> {preview}.</p>
</div>

<style>
  .rule { display: flex; flex-direction: column; gap: 12px; }
  .rule.off { opacity: 0.6; }
  .knobs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 10px 12px;
    align-items: end;
  }
  .knobs :global(.label) { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
  .knobs .select { min-height: 32px; font-variant-numeric: tabular-nums; }
  /* the two-option switch needs two columns or "Week 1" is clipped */
  .knobs > :global(:has(> .seg)) { grid-column: span 2; }

  .seg {
    display: flex;
    padding: 2px;
    gap: 2px;
    background: var(--well-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    min-height: 32px;
  }
  .seg-opt {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border-radius: 4px;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .seg-opt input { position: absolute; opacity: 0; pointer-events: none; }
  .seg-opt:hover { color: var(--ink); }
  .seg-opt.on { background: var(--well); color: var(--ink); font-weight: 600; box-shadow: 0 0 0 1px var(--line); }
  .seg-opt:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 1px; }

  .amrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    font-size: 13px;
    color: var(--ink);
    cursor: pointer;
  }
  .amrap input { margin: 0; width: 14px; height: 14px; accent-color: var(--blue); flex: none; }

  .preview {
    margin: 0;
    padding: 8px 10px;
    border-left: 2px solid var(--blue);
    background: var(--well-2);
    border-radius: 0 4px 4px 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink);
  }
  .pv-k { color: var(--muted); }
</style>
