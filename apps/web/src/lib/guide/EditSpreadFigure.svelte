<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";

  /**
   * An exercise swapped in W2 with "W2 and later": W1 has ended, W3 keeps the
   * old exercise because it has logs, W4 takes the swap (sample dates).
   * Exercise names, week tabs and the edit message stay English (trainer UI).
   */
  type State = "ended" | "edited" | "kept" | "updated";
  const weeks: { w: string; dates: string; state: State }[] = [
    { w: "W1", dates: "10–16 Nov", state: "ended" },
    { w: "W2", dates: "17–23 Nov", state: "edited" },
    { w: "W3", dates: "24–30 Nov", state: "kept" },
    { w: "W4", dates: "1–7 Dec", state: "updated" },
  ];
  const t = {
    en: { ended: "ended · unchanged", edited: "edited here", updated: "updated", logged: "logged" },
    th: { ended: "จบแล้ว · ไม่เปลี่ยน", edited: "แก้ตรงนี้", updated: "เปลี่ยนตาม", logged: "บันทึกแล้ว" },
  } as const;
  const l = $derived(t[i18n.locale]);
  const swapped = (s: State) => s === "edited" || s === "updated";
</script>

<div class="spread">
  <div class="flow"><span class="flow-label">W2 and later</span></div>
  {#each weeks as wk (wk.w)}
    <div class="card {wk.state}">
      <div class="card-head"><b>{wk.w}</b><span>{wk.dates}</span></div>
      <ul>
        <li>Squat</li>
        <li class:swap={swapped(wk.state)}>
          {swapped(wk.state) ? "Incline press" : "Bench press"}
          {#if wk.state === "kept"}<span class="tick" aria-hidden="true">✓</span>{/if}
        </li>
      </ul>
      <div class="card-foot">
        {#if wk.state === "kept"}
          <span class="kept-tag">W3 kept: has logs</span>
        {:else}
          {l[wk.state]}
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .spread { width: 100%; max-width: 620px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }

  /* The reach of the edit: an arrow over W2 → W4. */
  .flow { grid-row: 1; grid-column: 2 / 5; position: relative; height: 22px; }
  .flow::before { content: ""; position: absolute; left: 12px; right: 6px; bottom: 4px; border-top: 2px solid var(--blue); }
  .flow::after { content: ""; position: absolute; right: 0; bottom: 0; border: 5px solid transparent; border-left: 8px solid var(--blue); border-right: 0; }
  .flow-label { position: absolute; left: 6px; bottom: 7px; padding: 0 6px; background: var(--well); font: 600 11px/1.3 var(--font-mono); color: var(--blue); white-space: nowrap; }

  .card { grid-row: 2; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .card-head { display: flex; align-items: baseline; gap: 6px; padding: 7px 9px; border-bottom: 1px solid var(--line-soft); font: 400 11px/1.2 var(--font-mono); color: var(--muted); }
  .card-head b { font: 600 13px/1 var(--font-mono); color: var(--ink); }
  ul { list-style: none; margin: 0; padding: 7px 9px; display: grid; gap: 5px; flex: 1; }
  li { padding: 4px 6px; border-radius: 4px; background: var(--well); font: 400 12px/1.3 var(--font-ui); color: var(--ink); overflow-wrap: anywhere; }
  li.swap { background: color-mix(in srgb, var(--blue) 12%, transparent); box-shadow: inset 2px 0 0 var(--blue); }
  .tick { color: var(--good); font-weight: 600; }
  .card-foot { padding: 6px 9px 8px; font: 500 11px/1.35 var(--font-ui); color: var(--muted); }
  .kept-tag { display: inline-block; padding: 2px 6px; border: 1px solid var(--warn-line); border-radius: 4px; background: var(--warn-bg); color: var(--warn); font: 500 11px/1.35 var(--font-ui); }

  .ended { background: transparent; border-color: var(--line-soft); }
  .ended .card-head b, .ended li { color: var(--faint); }
  .ended li { background: transparent; border: 1px dashed var(--line-soft); }
  .edited { border: 2px solid var(--blue); }
  .edited .card-foot, .updated .card-foot { color: var(--blue); }
  .kept { border-color: var(--warn-line); }

  /* Narrow: weeks stack, and the arrow runs down the left side from W2. */
  @container (max-width: 520px) {
    .spread { grid-template-columns: 14px minmax(0, 1fr); row-gap: 6px; column-gap: 8px; }
    .flow { grid-column: 1; grid-row: 2 / 5; height: auto; }
    .flow::before { left: 6px; right: auto; top: 14px; bottom: 8px; border-top: 0; border-left: 2px solid var(--blue); }
    .flow::after { right: auto; left: 2px; bottom: 0; border: 5px solid transparent; border-top: 8px solid var(--blue); border-bottom: 0; }
    .flow-label { display: none; }
    .card { grid-column: 2; grid-row: auto; flex-direction: row; flex-wrap: wrap; align-items: center; }
    .card-head { flex-direction: column; align-items: flex-start; gap: 3px; width: 76px; border-bottom: 0; }
    ul { flex: 1 1 140px; padding: 7px 9px 7px 0; }
    .card-foot { flex-basis: 100%; padding-top: 0; }
    .edited .card-foot::after { content: " · W2 and later"; font-family: var(--font-mono); }
  }
</style>
