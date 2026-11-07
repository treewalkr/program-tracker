<script lang="ts">
  import type { ExerciseDto } from "$lib/api/types";
  import {
    EQUIPMENT_OPTIONS,
    NONE,
    PATTERN_GROUPS,
    coverage,
    coverageLevel,
    mapScope,
    patternName,
    type Filters,
  } from "$lib/exerciseLibrary";

  /**
   * Pattern × equipment grid on the done ramp, plus an Untagged row. A visual
   * filter for the library table: cells, row labels and column labels call
   * `onpick`; empty cells are gaps the AI can't fill. Collapsible.
   */
  interface Props {
    list: ExerciseDto[];
    filters: Filters;
    open: boolean;
    ontoggle: () => void;
    onpick: (pattern?: string, equipment?: string) => void;
  }

  let { list, filters, open, ontoggle, onpick }: Props = $props();

  const cov = $derived(coverage(list));
  const scope = $derived(mapScope(filters));
  const isOn = (p?: string, q?: string) => scope !== null && scope.pattern === p && scope.equipment === q;
  const count = (p: string, q: string) => cov.cells.get(`${p}|${q}`) ?? 0;
  const cols = EQUIPMENT_OPTIONS;
</script>

{#snippet cell(p: string, q: string)}
  {@const n = count(p, q)}
  {@const on = isOn(p, q)}
  <td class="c">
    <button
      type="button"
      class="cell {p === NONE && n ? 'todo' : coverageLevel(n)}"
      class:on
      aria-pressed={on}
      aria-label="{p === NONE ? 'Untagged' : patternName(p)}, {cols.find((c) => c.key === q)?.label}: {n}"
      onclick={() => onpick(p, q)}>{n || "·"}</button
    >
  </td>
{/snippet}

{#snippet rowHead(p: string, label: string)}
  <th class="rowh" scope="row">
    <button type="button" class:on={isOn(p, undefined)} onclick={() => onpick(p, undefined)}>{label}</button>
  </th>
{/snippet}

<section class="panel cov" class:closed={!open} aria-label="Coverage by pattern and equipment">
  <div class="panel-head">
    <button type="button" class="tog" aria-expanded={open} aria-controls="cov-body" onclick={ontoggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>Coverage
    </button>
    <span class="sum">
      <span><b>{cov.placed}</b> of <b>{cov.live}</b> placed</span>
      <span class="gaps"><b>{cov.gaps}</b> gaps</span>
    </span>
    {#if open}<span class="hint">Click a cell to filter the table. Empty cells are gaps the AI can't fill.</span>{/if}
  </div>
  {#if open}
    <div id="cov-body">
      <div class="mapwrap">
        <table class="map">
          <thead>
            <tr>
              <th class="rowh"></th>
              {#each cols as c (c.key)}
                <th scope="col">
                  <button type="button" class:on={isOn(undefined, c.key)} onclick={() => onpick(undefined, c.key)}>{c.label}</button>
                </th>
              {/each}
              <th class="tot-h">All</th>
            </tr>
          </thead>
          <tbody>
            {#each PATTERN_GROUPS as g (g.label)}
              <tr class="grp"><td colspan={cols.length + 2}>{g.label}</td></tr>
              {#each g.patterns as p (p)}
                <tr>
                  {@render rowHead(p, patternName(p))}
                  {#each cols as c (c.key)}{@render cell(p, c.key)}{/each}
                  <td class="tot">{cov.rowTotal(p)}</td>
                </tr>
              {/each}
            {/each}
            <tr class="grp"><td colspan={cols.length + 2}>To tag</td></tr>
            <tr>
              {@render rowHead(NONE, "Untagged")}
              {#each cols as c (c.key)}{@render cell(NONE, c.key)}{/each}
              <td class="tot">{cov.rowTotal(NONE)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="legend">
        <span><i class="z"></i>none</span><span><i class="l1"></i>1</span><span><i class="l2"></i>2–3</span><span
          ><i class="l3"></i>4+</span
        ><span><i class="todo"></i>untagged</span>
        <span class="faint">Counts exclude archived and hidden</span>
      </div>
    </div>
  {/if}
</section>

<style>
  .cov { margin-bottom: 20px; }
  .cov .panel-head { gap: 10px; }
  .cov.closed .panel-head { border-bottom: 0; }
  .tog {
    display: inline-flex; align-items: center; gap: 6px; appearance: none; border: 0; background: none; padding: 0;
    font: 600 14px/1.3 var(--font-ui); color: var(--ink); cursor: pointer;
  }
  .tog svg {
    width: 12px; height: 12px; stroke: var(--muted); fill: none; stroke-width: 2;
    transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .closed .tog svg { transform: rotate(-90deg); }
  .sum { display: flex; gap: 12px; font-size: 12px; color: var(--muted); }
  .sum b { font: 500 12px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
  .sum .gaps b { color: var(--warn); }
  .hint { margin-left: auto; font-size: 12px; color: var(--faint); }

  .mapwrap { overflow-x: auto; padding: 8px 10px; }
  .map { border-collapse: separate; border-spacing: 4px; width: 100%; min-width: 760px; }
  .map th { font: 600 12px/1.2 var(--font-ui); color: var(--muted); padding: 4px 6px; text-align: center; white-space: nowrap; }
  .map th.rowh { text-align: left; width: 168px; }
  .map th.tot-h { text-align: right; }
  .map th button {
    appearance: none; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 2px 4px; border-radius: 4px;
  }
  .map th button:hover { color: var(--ink); background: var(--well-2); }
  .map th button.on { color: var(--ink); background: var(--active); }
  .grp td {
    padding: 6px 6px 0; font: 600 11px/1 var(--font-ui); text-transform: uppercase; letter-spacing: 0.04em; color: var(--faint);
  }
  td.c { padding: 0; }
  .cell {
    width: 100%; min-width: 52px; height: 26px; display: grid; place-items: center;
    border: 1px solid transparent; border-radius: 4px; cursor: pointer;
    font: 500 12px/1 var(--font-mono); font-variant-numeric: tabular-nums;
  }
  .cell.z { background: var(--surface); border: 1px dashed var(--line); color: var(--faint); }
  .cell.l1 { background: var(--done-1); color: var(--ink); }
  .cell.l2 { background: var(--done-2); color: var(--ink); }
  .cell.l3 { background: var(--done-4); color: var(--on-done); }
  .cell.todo { background: var(--warn-bg); border-color: var(--warn-line); color: var(--warn); }
  .cell:hover { filter: brightness(1.05); border-color: var(--line-strong); }
  .cell.on { box-shadow: inset 0 0 0 2px var(--hover-ink); }
  .cell.z.on { border-style: solid; }
  td.tot { font: 500 12px var(--font-mono); color: var(--muted); text-align: right; padding-right: 8px; }

  .legend {
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--muted);
    padding: 10px 16px; border-top: 1px solid var(--line);
  }
  .legend i { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -3px; margin-right: 5px; }
  .legend .z { border: 1px dashed var(--line); }
  .legend .l1 { background: var(--done-1); }
  .legend .l2 { background: var(--done-2); }
  .legend .l3 { background: var(--done-4); }
  .legend .todo { background: var(--warn-bg); border: 1px solid var(--warn-line); }
  .legend .faint { margin-left: auto; color: var(--faint); }

  @media (max-width: 760px) {
    .sum { display: none; }
    .hint { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tog svg { transition: none; }
  }
</style>
