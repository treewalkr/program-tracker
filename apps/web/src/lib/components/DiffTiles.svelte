<script lang="ts">
  /**
   * 2×2 change-summary tiles for the AI draft diff ("3 kept / 2 added …").
   * Counts are plain numbers — colour coding lives here.
   */
  interface Props {
    kept: number;
    added: number;
    removed: number;
    changed: number;
  }

  let { kept, added, removed, changed }: Props = $props();
</script>

<div class="diff">
  <div class="diff-cell"><div class="n muted">{kept}</div><div class="l">kept</div></div>
  <div class="diff-cell"><div class="n green">{added}</div><div class="l">added</div></div>
  <div class="diff-cell"><div class="n red">{removed}</div><div class="l">removed</div></div>
  <div class="diff-cell"><div class="n blue">{changed}</div><div class="l">changed</div></div>
</div>

<style>
  .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .diff-cell { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; background: var(--surface); }
  .diff-cell .n { font: 600 20px/1 var(--font-mono); }
  .diff-cell .n.muted { color: var(--muted); }
  .diff-cell .n.green { color: var(--good); }
  .diff-cell .n.red { color: var(--bad); }
  .diff-cell .n.blue { color: var(--blue); }
  .diff-cell .l { font: 400 12px/1.3 var(--font-ui); color: var(--muted); margin-top: 5px; }
</style>
