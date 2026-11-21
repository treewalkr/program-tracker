<script lang="ts">
  import { PATTERN_GROUPS, makePrimary, togglePattern } from "$lib/exerciseLibrary";
  import Icon from "$lib/ui/Icon.svelte";
  import { MAX_MOVEMENT_PATTERNS, MOVEMENT_PATTERN_INFO, NO_PATTERN, type MovementPattern } from "@pt/shared";

  /**
   * Movement-pattern toggle chips, grouped (Upper / Lower / Core / Other) with
   * "No pattern" on its own row. The first selected is the primary (★); a
   * selected secondary splits into ☆ (make primary) and its label (remove).
   * A full list disables the rest. The caller wraps it in a labelled group.
   */
  let { value = $bindable() }: { value: string[] } = $props();

  const uid = $props.id();
  const primaryId = `${uid}-primary`;

  /** Chip groups; "No pattern" sits on its own below them. */
  const CHIP_GROUPS = PATTERN_GROUPS.map((g) => ({ ...g, patterns: g.patterns.filter((p) => p !== NO_PATTERN) }));

  const full = $derived(value.filter((x) => x !== NO_PATTERN).length >= MAX_MOVEMENT_PATTERNS);
</script>

{#snippet patternChip(p: MovementPattern)}
  {@const name = MOVEMENT_PATTERN_INFO[p].name}
  {@const i = value.indexOf(p)}
  {#if i > 0}
    <!-- A selected secondary: the ☆ makes it primary, the label removes it. Two buttons, never nested. -->
    <span class="tchip on split">
      <button type="button" class="star" aria-label="Make {name} primary" title="Make primary" onclick={() => (value = makePrimary(value, p))}
        ><Icon name="star" /></button
      ><button type="button" class="lbl" aria-pressed="true" onclick={() => (value = togglePattern(value, p))}>{name}</button>
    </span>
  {:else}
    <button
      type="button"
      class="tchip"
      class:on={i === 0}
      class:none={p === NO_PATTERN}
      aria-pressed={i === 0}
      aria-describedby={i === 0 && p !== NO_PATTERN ? primaryId : undefined}
      disabled={i === -1 && p !== NO_PATTERN && full}
      onclick={() => (value = togglePattern(value, p))}
      >{#if i === 0 && p !== NO_PATTERN}<span class="prim"><Icon name="star" /></span>{/if}{name}</button
    >
  {/if}
{/snippet}

<span hidden id={primaryId}>Primary</span>

{#each CHIP_GROUPS as g (g.label)}
  <span class="grp">{g.label}</span>
  <div class="chips">
    {#each g.patterns as p (p)}{@render patternChip(p)}{/each}
  </div>
{/each}
<div class="chips none-row">{@render patternChip(NO_PATTERN)}</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .tchip:disabled { opacity: 0.6; cursor: default; }
  .grp { font: 500 11px var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); margin: 8px 0 4px; }
  .none-row { margin-top: 10px; }
  .prim { display: inline-flex; }
  .prim :global(svg) { fill: currentColor; }
  /* A selected secondary: one pill holding the ☆ (make primary) and the label (remove). */
  .tchip.split { padding: 0; gap: 0; cursor: default; }
  .split button {
    appearance: none; border: 0; background: none; color: inherit; font: inherit; cursor: pointer;
    display: inline-flex; align-items: center;
  }
  .split .star { padding: 4px 2px 4px 10px; border-radius: 99px 0 0 99px; }
  .split .lbl { padding: 4px 12px 4px 4px; border-radius: 0 99px 99px 0; }
  .split .star:hover :global(svg) { fill: currentColor; }
  .split button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .tchip.none:not(.on) { border-style: dashed; }
</style>
