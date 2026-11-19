<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";

  /**
   * Three block weeks for a program activated Tue 10 Nov, today Thu 19 Nov
   * (sample dates). Week labels quote the trainer's week tabs, so they stay
   * English; the weekday axis and the state notes follow the language.
   */
  const weeks = [
    { tab: "W1 · 10–16 Nov", from: 10, state: "ended" },
    { tab: "W2 · 17–23 Nov", from: 17, state: "now" },
    { tab: "W3 · 24–30 Nov", from: 24, state: "upcoming" },
  ] as const;
  const today = 19;
  /** Day of month for the `i`th day of a week starting on `from` (November has 30). */
  const day = (from: number, i: number) => ((from + i - 1) % 30) + 1;

  const t = {
    en: { days: ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"], ended: "ended", upcoming: "upcoming", today: "today", span: "7 days · Tue → Mon" },
    th: { days: ["อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา.", "จ."], ended: "จบแล้ว", upcoming: "ยังไม่ถึง", today: "วันนี้", span: "7 วัน · อังคาร → จันทร์" },
  } as const;
  const l = $derived(t[i18n.locale]);
</script>

<div class="cal">
  <div class="axis">
    {#each l.days as d, i (i)}<span class:edge={i === 0 || i === 6}>{d}</span>{/each}
  </div>
  <div class="span"><span>{l.span}</span></div>

  {#each weeks as w (w.tab)}
    <div class="week {w.state}">
      <div class="head">
        <span class="tab">{w.tab}</span>
        {#if w.state === "now"}
          <span class="pill neutral">now</span>
        {:else}
          <span class="wk-state">{l[w.state]}</span>
        {/if}
      </div>
      <div class="days">
        {#each l.days as _, i (i)}
          {@const n = day(w.from, i)}
          <span class="day" class:today={w.state === "now" && n === today}>
            <b>{n}</b>
            {#if w.state === "now" && n === today}<small>{l.today}</small>{/if}
          </span>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .cal { width: 100%; max-width: 520px; display: grid; gap: 10px; }
  .axis, .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .axis span { text-align: center; font: 500 12px/1 var(--font-ui); color: var(--muted); }
  .axis .edge { color: var(--ink); font-weight: 600; }
  /* A bracket under the axis: one week is these seven days, Tuesday first. */
  .span { position: relative; height: 8px; margin-top: -4px; border: 1px solid var(--line-strong); border-top: 0; border-radius: 0 0 4px 4px; }
  .span span { position: absolute; left: 50%; top: 100%; transform: translate(-50%, -2px); padding: 0 6px; background: var(--well); font: 500 11px/1.4 var(--font-ui); color: var(--muted); white-space: nowrap; }
  .span + .week { margin-top: 12px; }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; min-height: 20px; }
  .tab { font: 600 12px/1 var(--font-mono); color: var(--ink); white-space: nowrap; }
  .wk-state { font: 400 12px/1 var(--font-ui); color: var(--muted); }
  .day { display: grid; place-items: center; align-content: center; gap: 2px; height: 40px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); }
  .day b { font: 500 13px/1 var(--font-mono); color: var(--ink); }
  .day small { font: 600 10px/1 var(--font-ui); color: var(--blue); }
  .ended .tab, .ended .day b { color: var(--faint); }
  .ended .day { background: transparent; border-color: var(--line-soft); }
  .now .day { border-color: color-mix(in srgb, var(--blue) 35%, var(--line)); }
  .day.today { border: 2px solid var(--blue); background: var(--pulse-now-bg); }
  .upcoming .day { border-style: dashed; }
  @container (max-width: 400px) {
    .day { height: 36px; }
    .axis span { font-size: 11px; }
  }
</style>
