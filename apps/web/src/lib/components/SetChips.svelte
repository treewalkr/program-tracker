<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";
  import { fmtSet } from "$lib/format";

  let { sets }: { sets: PrescribedSetDto[] } = $props();

  const restLabel = (s: PrescribedSetDto) => (s.restSeconds ? `${s.restSeconds}s` : null);

  /**
   * Coach notation: uniform sets collapse to one chip — `3×5 @RPE 6–8 · 180s`.
   * A uniform RPE ramp reads as a range; genuinely mixed sets stay per-set.
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
        rpe = new Set(vals).size === 1 ? `${vals[0]}` : `${Math.min(...vals)}→${Math.max(...vals)}`;
      }
      const maxRpe = rpes.every((r) => r != null) ? Math.max(...(rpes as number[])) : 0;
      return [{ count: labelled.length, main: labelled[0].main, rpe, rest: labelled[0].rest, maxRpe }];
    }
    return labelled.map((l) => ({ count: 1, main: l.main, rpe: l.rpe != null ? `${l.rpe}` : null, rest: l.rest, maxRpe: l.rpe ?? 0 }));
  });
</script>

<span class="chips" title="sets × reps @RPE · rest (seconds)">
  {#each groups as g, i (i)}
    <span class="setchip">
      {#if g.count > 1}<span class="count">{g.count}×{g.main}</span>{:else}<span class="rep">{g.main}</span>{/if}
      {#if g.rpe}<span class="sub rpe" class:rpe-mid={g.maxRpe >= 7} class:rpe-high={g.maxRpe >= 9}>@RPE {g.rpe}</span>{/if}
      {#if g.rest}<span class="sub">· {g.rest}</span>{/if}
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
  /* RPE effort tiers live in app.css (.setchip .rpe) — chip-darkened for AA */
</style>
