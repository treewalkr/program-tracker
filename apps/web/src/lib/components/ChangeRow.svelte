<script lang="ts">
  /**
   * One changed-exercise row in the AI draft diff: colour-coded +/−/~ sign,
   * exercise name, right-aligned mono detail ("8/8 → 10/8").
   */
  interface Props {
    change: "added" | "removed" | "changed";
    exercise: string;
    detail: string;
  }

  let { change, exercise, detail }: Props = $props();

  const cls = $derived(change === "added" ? "add" : change === "removed" ? "rm" : "ch");
  const sign = $derived(change === "added" ? "+" : change === "removed" ? "−" : "~");
</script>

<div class="chg {cls}">
  <span class="pm" aria-hidden="true">{sign}</span>
  <span class="nm">{exercise}</span>
  <span class="detail">{detail}</span>
</div>

<style>
  .chg {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 2px;
    border-bottom: 1px solid var(--line-soft);
    font-size: 13.5px;
  }
  .chg:last-child { border-bottom: none; }
  .chg .pm { font: 700 13px/1 var(--font-mono); width: 14px; flex: none; }
  .chg.add .pm { color: var(--good); }
  .chg.rm .pm { color: var(--bad); }
  .chg.ch .pm { color: var(--blue); }
  .chg.add .nm { color: var(--good); }
  .chg.rm .nm { color: var(--bad); }
  .chg .detail { color: var(--muted); font: 400 12px/1.4 var(--font-mono); margin-left: auto; white-space: nowrap; }
</style>
