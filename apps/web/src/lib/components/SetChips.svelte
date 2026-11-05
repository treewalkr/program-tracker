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
   * Tap/click toggles the chip between notation and its plain-words form
   * (touch has no hover; iPad is a primary target).
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

  /** Plain-words form shown while the chip is toggled open. */
  const describe = (g: { count: number; main: string; rpe: string | null; rest: string | null }) => {
    const setsWord = g.count === 1 ? "1 set" : `${g.count} sets`;
    const main = /^[\d–]+$/.test(g.main) ? `${g.main} reps` : g.main;
    const rpeWord = g.rpe ? ` · RPE ${g.rpe}` : "";
    const restWord = g.rest ? ` · rest ${g.rest}` : "";
    return `${setsWord} × ${main}${rpeWord}${restWord}`;
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
    {@const open = openIndex === i}
    <span
      class="setchip"
      class:open
      role="button"
      tabindex="0"
      aria-expanded={open}
      title={open ? "show notation" : describe(g)}
      onclick={() => toggle(i)}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(i);
        }
      }}
    >
      {#if open}
        <span class="words">{describe(g)}</span>
      {:else}
        {#if g.count > 1}<span class="count">{g.count}×{g.main}</span>{:else}<span class="rep">{g.main}</span>{/if}
        {#if g.rpe}<span class="sub rpe" class:rpe-mid={g.maxRpe >= 7} class:rpe-high={g.maxRpe >= 9}>@RPE {g.rpe}</span>{/if}
        {#if g.rest}<span class="sub">· {g.rest}</span>{/if}
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
    cursor: default;
  }
  .setchip.open {
    outline: 2px solid var(--accent-emphasis, #0969da);
  }
  .words {
    font-weight: 400;
  }
  /* RPE effort tiers live in app.css (.setchip .rpe) — chip-darkened for AA */
</style>
