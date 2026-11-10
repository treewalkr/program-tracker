<script lang="ts">
  import type { Snippet } from "svelte";
  import { groupKind } from "@pt/shared";

  /**
   * A superset / circuit: a hairline box with a well-gray header
   * ("Superset · 3 rounds") around its members. Pass `onrounds` to make the
   * rounds editable and the move / ungroup actions appear.
   */
  let {
    group,
    count,
    rounds,
    children,
    onrounds,
    onmoveup,
    onmovedown,
    canMoveUp = false,
    canMoveDown = false,
    onungroup,
  }: {
    group: string;
    /** Members in the group — two is a superset, three or more a circuit. */
    count: number;
    rounds: number;
    children: Snippet;
    onrounds?: (n: number) => void;
    onmoveup?: () => void;
    onmovedown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onungroup?: () => void;
  } = $props();

  const kind = $derived(groupKind(count));
</script>

<div class="xgroup" role="group" aria-label="{kind} {group}, {rounds} rounds">
  <div class="ghead">
    <span class="letter">{group}</span>
    <strong>{kind}</strong>
    <span class="sep">·</span>
    {#if onrounds}
      <input
        class="input rounds"
        type="number"
        min="1"
        max="20"
        aria-label="Rounds for {kind.toLowerCase()} {group}"
        value={rounds}
        onchange={(e) => onrounds(Number(e.currentTarget.value))}
      />
      <span>rounds</span>
    {:else}
      <span>{rounds} {rounds === 1 ? "round" : "rounds"}</span>
    {/if}
    {#if onmoveup || onmovedown || onungroup}
      <span class="grow"></span>
      {#if onmoveup}<button type="button" class="act" disabled={!canMoveUp} onclick={onmoveup} aria-label="Move {kind.toLowerCase()} {group} up">↑</button>{/if}
      {#if onmovedown}<button type="button" class="act" disabled={!canMoveDown} onclick={onmovedown} aria-label="Move {kind.toLowerCase()} {group} down">↓</button>{/if}
      {#if onungroup}<button type="button" class="act text" onclick={onungroup}>Ungroup</button>{/if}
    {/if}
  </div>
  <div class="gbody">
    {@render children()}
  </div>
</div>

<style>
  .xgroup {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: var(--well);
    border-bottom: 1px solid var(--line);
    border-radius: var(--radius) var(--radius) 0 0;
    font: 500 12px var(--font-ui);
    color: var(--muted);
  }
  .ghead strong { color: var(--ink); font-weight: 600; }
  .letter { font: 600 11px/1 var(--font-mono); color: var(--muted); }
  .sep { color: var(--faint); }
  .rounds { width: 52px; padding: 2px 6px; text-align: right; font: 12px var(--font-mono); }
  .grow { flex: 1; }
  .act {
    border: 1px solid transparent;
    background: none;
    color: var(--muted);
    font: 500 12px var(--font-ui);
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .act:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
  .act:disabled { opacity: 0.4; cursor: default; }
  .gbody {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 12px;
  }
</style>
