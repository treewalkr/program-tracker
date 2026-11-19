<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";

  /**
   * A 4-week block before and after Week 1 moves a week later, on one shared
   * calendar (sample dates). The client was away 17–23 Nov, during W2; after
   * the move, W2 lands on 24–30 Nov, so the missed week comes round again.
   * The "Week 1 started …" lines quote the trainer UI, so they stay English.
   */
  const cols = ["10–16 Nov", "17–23 Nov", "24–30 Nov", "1–7 Dec", "8–14 Dec"];
  const away = 2; // grid column of 17–23 Nov
  const t = {
    en: { away: "client away", before: "Before", after: "After Change", missed: "missed", again: "again" },
    th: { away: "เมมเบอร์ไม่อยู่", before: "ก่อน", after: "หลังกด Change", missed: "ขาด", again: "รอบใหม่" },
  } as const;
  const l = $derived(t[i18n.locale]);
  const before = [1, 2, 3, 4];
  const after = [2, 3, 4, 5];
</script>

<div class="shift">
  <span class="band" style="grid-column: {away}" aria-hidden="true"></span>
  <span class="away" style="grid-column: {away}">{l.away}</span>
  {#each cols as c, i (c)}<span class="when" style="grid-column: {i + 1}">{c}</span>{/each}

  <span class="row-label" style="grid-row: 3"><b>{l.before}</b> <code>Week 1 started Tue 10 Nov</code></span>
  {#each before as col, i (col)}
    <span class="wk" class:missed={i === 1} style="grid-row: 4; grid-column: {col}">
      W{i + 1}{#if i === 1}<small>{l.missed}</small>{/if}
    </span>
  {/each}

  <span class="row-label" style="grid-row: 5"><b>{l.after}</b> <code>Week 1 started Tue 17 Nov</code></span>
  <span class="gap" style="grid-row: 6; grid-column: 1" aria-hidden="true"></span>
  {#each after as col, i (col)}
    <span class="wk" class:again={i === 1} style="grid-row: 6; grid-column: {col}">
      W{i + 1}{#if i === 1}<small>{l.again}</small>{/if}
    </span>
  {/each}
</div>

<style>
  .shift {
    width: 100%;
    max-width: 560px;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    grid-template-rows: auto auto auto 46px auto 46px;
    gap: 5px;
  }
  .shift > * { position: relative; }
  /* The week the client was away, shaded down through both strips. */
  .band {
    grid-row: 1 / -1;
    margin: -4px -2px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .away { grid-row: 1; justify-self: center; padding: 1px 6px; border-radius: 4px; background: var(--surface); border: 1px solid var(--line); font: 500 11px/1.4 var(--font-ui); color: var(--muted); white-space: nowrap; }
  .when { grid-row: 2; text-align: center; font: 500 11px/1.3 var(--font-mono); color: var(--muted); }
  .row-label { grid-column: 1 / -1; margin-top: 6px; font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
  .row-label b { font-weight: 600; color: var(--ink); }
  .row-label code { font: 500 11px/1 var(--font-mono); color: var(--ink); white-space: nowrap; }
  .wk { display: grid; place-items: center; align-content: center; gap: 2px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); font: 600 13px/1 var(--font-mono); color: var(--ink); }
  .wk small { font: 600 10px/1 var(--font-ui); }
  .wk.missed { color: var(--bad); border-color: var(--bad-line); background: var(--bad-bg); }
  .wk.again { color: var(--blue); border: 2px solid var(--blue); background: var(--pulse-now-bg); }
  .gap { border: 1px dashed var(--line-soft); border-radius: 4px; }
  @container (max-width: 420px) {
    .shift { gap: 4px; }
    .when { font-size: 10px; }
  }
</style>
