<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";

  /**
   * One block week (W2, Tue 17 – Mon 23 Nov) with a session planned Thursday,
   * plus the first day of W3 (sample dates). Two tracks: what happens when the
   * client logs late, and when they don't log at all. Columns: 7 days, the
   * week boundary, then Tue 24.
   */
  const dates = [17, 18, 19, 20, 21, 22, 23];
  const planned = 2; // Thu 19
  const t = {
    en: {
      days: ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"],
      next: "Tue",
      planned: "planned",
      late: "If the member logs late",
      none: "If it isn't logged",
      cant: "can't log",
      grace: "2-day grace",
      still: "can still log",
      missed: "missed",
    },
    th: {
      days: ["อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา.", "จ."],
      next: "อ.",
      planned: "ตามแผน",
      late: "ถ้าเมมเบอร์บันทึกช้า",
      none: "ถ้าไม่ได้บันทึก",
      cant: "บันทึกไม่ได้",
      grace: "ผ่อนผัน 2\u00a0วัน",
      still: "ยังบันทึกได้",
      missed: "ขาด",
    },
  } as const;
  const l = $derived(t[i18n.locale]);
</script>

<div class="tl">
  <span class="wk" style="grid-column: 1 / 8">W2 · 17–23 Nov</span>
  <span class="wk next" style="grid-column: 9">W3</span>
  <span class="edge" aria-hidden="true"></span>

  {#each l.days as d, i (i)}<span class="dow" style="grid-row: 2; grid-column: {i + 1}">{d}</span>{/each}
  <span class="dow next" style="grid-row: 2; grid-column: 9">{l.next}</span>

  {#each dates as n, i (n)}
    <span class="day" class:planned={i === planned} style="grid-column: {i + 1}">
      <b>{n}</b>
    </span>
  {/each}
  <span class="day next" style="grid-column: 9"><b>24</b></span>
  <span class="pin" style="grid-column: {planned} / {planned + 3}">↑ {l.planned}</span>

  <span class="track" style="grid-row: 5">{l.late}</span>
  <span class="bar good" style="grid-row: 6; grid-column: 4 / 8">✓ logged Fri 20 Nov</span>
  <span class="bar bad" style="grid-row: 6; grid-column: 9">✕ {l.cant}</span>

  <span class="track" style="grid-row: 7">{l.none}</span>
  <span class="bar soft" style="grid-row: 8; grid-column: 4 / 6">{l.grace}</span>
  <span class="bar warn" style="grid-row: 8; grid-column: 6 / 8">{l.still}</span>
  <span class="bar bad" style="grid-row: 8; grid-column: 9">{l.missed}</span>
</div>

<style>
  .tl {
    width: 100%;
    max-width: 560px;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr)) 12px minmax(0, 1.4fr);
    grid-template-rows: auto auto 44px auto auto auto auto auto;
    gap: 4px;
  }
  .wk { grid-row: 1; padding-bottom: 2px; font: 600 12px/1.3 var(--font-mono); color: var(--ink); white-space: nowrap; }
  .wk.next { color: var(--muted); }
  /* The week boundary: Monday is the last day; Tuesday is already W3. */
  .edge { grid-row: 1 / -1; grid-column: 8; justify-self: center; width: 0; border-left: 2px dashed var(--line-strong); }
  .dow { text-align: center; font: 500 12px/1 var(--font-ui); color: var(--muted); }
  .day { grid-row: 3; display: grid; place-items: center; align-content: center; gap: 2px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); }
  .day b { font: 500 13px/1 var(--font-mono); color: var(--ink); }
  .pin { grid-row: 4; text-align: center; font: 600 11px/1.2 var(--font-ui); color: var(--blue); white-space: nowrap; }
  .day.planned { border: 2px solid var(--blue); background: var(--pulse-now-bg); }
  .day.next { border-style: dashed; background: transparent; }
  .day.next b, .dow.next { color: var(--faint); }
  .track { grid-column: 1 / -1; margin-top: 6px; font: 500 12px/1.3 var(--font-ui); color: var(--muted); }
  .track + .bar { margin: 0; }
  .bar { display: flex; align-items: center; min-height: 26px; padding: 3px 7px; border: 1px solid; border-radius: 4px; font: 500 11px/1.3 var(--font-ui); overflow-wrap: anywhere; }
  .good { color: var(--good); border-color: var(--good-line); background: var(--good-bg); font-family: var(--font-mono); }
  .bad { justify-content: center; text-align: center; color: var(--bad); border-color: var(--bad-line); background: var(--bad-bg); }
  .warn { color: var(--warn); border-color: var(--warn-line); background: var(--warn-bg); }
  .soft { color: var(--muted); border-color: var(--line); border-style: dashed; background: var(--surface); }
  @container (max-width: 420px) {
    .tl { grid-template-rows: auto auto 38px auto auto auto auto auto; gap: 3px; }
    .dow { font-size: 11px; }
    .bar { padding: 3px 5px; }
  }
</style>
