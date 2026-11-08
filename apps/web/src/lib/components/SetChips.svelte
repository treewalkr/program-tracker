<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";
  import { fmtSet, rpeLabel } from "$lib/format";

  /** `oneRepMaxKg`: the client's 1RM for this exercise, so %1RM sets show their kg. */
  let { sets, oneRepMaxKg = null }: { sets: PrescribedSetDto[]; oneRepMaxKg?: number | null } = $props();

  let openIndex = $state<number | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  const restLabel = (s: PrescribedSetDto) => (s.restSeconds ? `${s.restSeconds}s` : null);
  /** RIR and tempo ride along in the notation: "3×5 · RIR 2 · 3-1-1-0". */
  const extras = (s: PrescribedSetDto) => ({
    rir: s.targetRir ?? null,
    tempo: s.tempo ? s.tempo.toUpperCase() : null,
  });
  const extraNotation = (x: { rir: number | null; tempo: string | null }) =>
    [x.rir != null ? `RIR ${x.rir}` : null, x.tempo].filter(Boolean).join(" · ");
  const extraWords = (x: { rir: number | null; tempo: string | null }) =>
    [x.rir != null ? `${x.rir} in reserve` : null, x.tempo ? `tempo ${x.tempo}` : null].filter(Boolean).map((w) => ` · ${w}`).join("");

  /**
   * Coach notation: uniform sets collapse to one chip — `3×5 @RPE 6–8 · 180s`.
   * A uniform ramp of single RPEs reads as a range; genuinely mixed sets stay per-set.
   * Tap/click toggles the chip between notation and its plain-words form
   * (touch has no hover; iPad is a primary target).
   */
  const groups = $derived.by(() => {
    const labelled = sets.map((s) => ({
      main: fmtSet(s, oneRepMaxKg),
      x: extras(s),
      extra: extraNotation(extras(s)),
      rpe: rpeLabel(s),
      top: s.amrap ? 0 : (s.targetRpe ?? 0),
      ranged: s.targetRpeMin != null,
      rest: restLabel(s),
    }));
    const same = <T,>(xs: T[]) => new Set(xs).size === 1;
    if (same(labelled.map((l) => l.main)) && same(labelled.map((l) => l.extra)) && same(labelled.map((l) => l.rest))) {
      const rpes = labelled.map((l) => l.rpe);
      let rpe: string | null = null;
      if (rpes.every((r) => r != null)) {
        if (same(rpes)) rpe = rpes[0];
        else if (!labelled.some((l) => l.ranged)) {
          const vals = labelled.map((l) => l.top);
          rpe = `${Math.min(...vals)}–${Math.max(...vals)}`;
        } else rpe = rpes.join("/");
      }
      const maxRpe = Math.max(...labelled.map((l) => l.top));
      return [{ count: labelled.length, main: labelled[0].main, x: labelled[0].x, extra: labelled[0].extra, rpe, rest: labelled[0].rest, maxRpe }];
    }
    return labelled.map((l) => ({ count: 1, main: l.main, x: l.x, extra: l.extra, rpe: l.rpe, rest: l.rest, maxRpe: l.top }));
  });

  /** Plain-words form shown while the chip is toggled open. */
  const describe = (g: { count: number; main: string; x: ReturnType<typeof extras>; rpe: string | null; rest: string | null }) => {
    const setsWord = g.count === 1 ? "1 set" : `${g.count} sets`;
    const main = /^[\d–]+$/.test(g.main) ? `${g.main} reps` : g.main;
    const rpeWord = `${g.rpe ? ` · RPE ${g.rpe}` : ""}${extraWords(g.x)}`;
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
        {#if g.extra}<span class="sub">· {g.extra}</span>{/if}
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
    outline: 2px solid var(--blue);
  }
  .words {
    font-weight: 400;
  }
  /* RPE effort tiers live in app.css (.setchip .rpe) — chip-darkened for AA */
</style>
