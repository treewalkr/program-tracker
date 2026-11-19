<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";

  /**
   * An A/B block: odd weeks A, even weeks B, for any length. An edit in W3
   * with "W3 and later" reaches W5, the next A week, and hops over W4.
   */
  type Note = "edited" | "updated" | "skipped" | null;
  const weeks: { n: number; note: Note }[] = [
    { n: 1, note: null },
    { n: 2, note: null },
    { n: 3, note: "edited" },
    { n: 4, note: "skipped" },
    { n: 5, note: "updated" },
    { n: 6, note: "skipped" },
  ];
  const t = {
    en: { edited: "edited", updated: "updated", skipped: "not changed" },
    th: { edited: "แก้ตรงนี้", updated: "เปลี่ยนตาม", skipped: "ไม่เปลี่ยน" },
  } as const;
  const l = $derived(t[i18n.locale]);
</script>

<div class="ab">
  <div class="bridge"><span>W3 and later</span></div>
  {#each weeks as w (w.n)}
    {@const a = w.n % 2 === 1}
    <div class="wk" class:a class:b={!a} class:edited={w.note === "edited"} class:updated={w.note === "updated"}>
      <span class="wn">W{w.n}</span>
      <b>{a ? "A" : "B"}</b>
    </div>
    <span class="wk-note" class:on={w.note === "edited" || w.note === "updated"}>{w.note ? l[w.note] : ""}</span>
  {/each}
  <div class="more" aria-hidden="true">…</div>
</div>

<style>
  .ab {
    width: 100%;
    max-width: 520px;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr)) minmax(0, 0.5fr);
    grid-template-rows: auto auto auto;
    column-gap: 6px;
    row-gap: 4px;
  }
  /* The edit's reach: a bridge from W3's centre over W4, landing on W5. */
  .bridge { grid-row: 1; grid-column: 3 / 6; position: relative; height: 34px; }
  .bridge::before {
    content: "";
    position: absolute;
    left: calc((100% - 12px) / 6 - 1px);
    right: calc((100% - 12px) / 6 - 1px);
    top: 10px;
    bottom: 4px;
    border: 2px solid var(--blue);
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
  }
  .bridge::after {
    content: "";
    position: absolute;
    right: calc((100% - 12px) / 6 - 5px);
    bottom: 0;
    border: 5px solid transparent;
    border-top: 7px solid var(--blue);
    border-bottom: 0;
  }
  .bridge span { position: absolute; left: 50%; top: 2px; transform: translateX(-50%); padding: 0 5px; background: var(--well); font: 600 11px/1.4 var(--font-mono); color: var(--blue); white-space: nowrap; }

  .wk { grid-row: 2; display: grid; justify-items: center; gap: 3px; padding: 7px 2px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .wn { font: 500 11px/1 var(--font-mono); color: var(--muted); }
  .wk b { font: 600 18px/1 var(--font-mono); color: var(--ink); }
  .wk.b { background: transparent; border-style: dashed; }
  .wk.b b { color: var(--muted); }
  .wk.edited { border: 2px solid var(--blue); padding: 6px 1px 7px; }
  .wk.updated { border-color: var(--blue); background: color-mix(in srgb, var(--blue) 12%, var(--surface)); }
  .wk-note { grid-row: 3; text-align: center; font: 500 11px/1.25 var(--font-ui); color: var(--muted); }
  .wk-note.on { color: var(--blue); }
  .more { grid-row: 2; align-self: center; text-align: center; font: 600 18px/1 var(--font-mono); color: var(--faint); }
  @container (max-width: 420px) {
    .ab { column-gap: 4px; }
    .wk-note { font-size: 10px; }
    .wk b { font-size: 16px; }
  }
</style>
