<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";
  import { fmtSet } from "$lib/format";

  let { sets }: { sets: PrescribedSetDto[] } = $props();

  let openIndex = $state<number | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  const restLabel = (s: PrescribedSetDto) => (s.restSeconds ? `${s.restSeconds}s` : null);

  /**
   * Coach notation: uniform sets collapse to one chip — `3×5 @RPE 6–8 · 180s`.
   * A uniform RPE ramp reads as a range; genuinely mixed sets stay per-set.
   * Tap/click a chip toggles a plain-words popover (touch has no hover).
   */
  const groups = $derived.by(() => {
    const labelled = sets.map((s) => ({ main: fmtSet(s), rpe: s.targetRpe ?? null, rest: restLabel(s) }));
    const uniformMain = new Set(labelled.map((l) => l.main)).size === 1;
    const uniformRest = new Set(labelled.map((l) => l.rest)).size === 1;
    if (uniformMain && uniformRest) {
      const rpes = labelled.map((l) => l.rpe);
      let rpe: string | null = null;
      if (rpes.every((r) => r != null)) {
        const vals = rpes as number[];
        rpe = new Set(vals).size === 1 ? `${vals[0]}` : `${Math.min(...vals)}–${Math.max(...vals)}`;
      }
      const maxRpe = rpes.every((r) => r != null) ? Math.max(...(rpes as number[])) : 0;
      return [{ count: labelled.length, main: labelled[0].main, rpe, rest: labelled[0].rest, maxRpe }];
    }
    return labelled.map((l) => ({ count: 1, main: l.main, rpe: l.rpe != null ? `${l.rpe}` : null, rest: l.rest, maxRpe: l.rpe ?? 0 }));
  });

  /** Plain-words chip meaning for hover and tap popover. */
  const describe = (g: { count: number; main: string; rpe: string | null; rest: string | null }) => {
    const setsWord = g.count === 1 ? "1 set" : `${g.count} sets`;
    const main = /^[\d–]+$/.test(g.main) ? `${g.main} reps` : g.main;
    const rpeWord = g.rpe ? `, effort RPE ${g.rpe} out of 10` : "";
    const restWord = g.rest ? `, ${g.rest.replace("s", " seconds")} rest between sets` : "";
    return `${setsWord} of ${main}${rpeWord}${restWord}`;
  };

  const toggle = (i: number) => (openIndex = openIndex === i ? null : i);
</script>

<svelte:window
  onpointerdown={(e) => {
    if (openIndex !== null && rootEl && !rootEl.contains(e.target as Node)) openIndex = null;
  }}
/>

<span class="chips" bind:this={rootEl}>
  {#each groups as g, i (i)}
    {@const tip = describe(g)}
    <span
      class="setchip"
      class:open={openIndex === i}
      role="button"
      tabindex="0"
      aria-label={tip}
      aria-expanded={openIndex === i}
      title={tip}
      onclick={() => toggle(i)}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(i);
        }
      }}
    >
      {#if g.count > 1}<span class="count">{g.count}×{g.main}</span>{:else}<span class="rep">{g.main}</span>{/if}
      {#if g.rpe}<span class="sub rpe" class:rpe-mid={g.maxRpe >= 7} class:rpe-high={g.maxRpe >= 9}>@RPE {g.rpe}</span>{/if}
      {#if g.rest}<span class="sub">· {g.rest}</span>{/if}
      {#if openIndex === i}
        <span class="pop" role="tooltip">{tip}</span>
      {/if}
    </span>
  {/each}
</span>

<style>
  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .count {
    font-weight: 600;
  }
  .setchip {
    position: relative;
    cursor: default;
  }
  .setchip.open {
    outline: 2px solid var(--accent-emphasis, #0969da);
  }
  .pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 30;
    width: max-content;
    max-width: 260px;
    padding: 7px 10px;
    border-radius: 6px;
    background: var(--ink, #1f2328);
    color: #fff;
    font: 400 12px/1.45 var(--font-ui, sans-serif);
    white-space: normal;
    pointer-events: none;
  }
  /* RPE effort tiers live in app.css (.setchip .rpe) — chip-darkened for AA */
</style>
