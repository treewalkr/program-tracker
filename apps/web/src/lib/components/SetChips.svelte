<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";
  import { describeGroup, groupSets, spokenGroup } from "$lib/setChips";

  /** `oneRepMaxKg`: the client's 1RM for this exercise, so %1RM sets show their kg. */
  /**
   * `cols`: aligned mode (session card rows). Every chip keeps the same slots
   * — sets×reps · load · effort · tempo · rest — so on a wide card the right-aligned chips
   * line their fields up into columns. `head` renders the column labels.
   */
  let {
    sets,
    oneRepMaxKg = null,
    cols = null,
    head = false,
  }: {
    sets: PrescribedSetDto[];
    oneRepMaxKg?: number | null;
    cols?: { load: boolean; tempo: boolean; rest: boolean } | null;
    head?: boolean;
  } = $props();

  let openIndex = $state<number | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  /**
   * Coach notation (`$lib/setChips`): uniform sets collapse to one chip,
   * consecutive identical sets become runs (top set, then back-offs).
   * Tap/click toggles a chip between notation and its plain-words form
   * (touch has no hover; iPad is a primary target).
   */
  const groups = $derived(groupSets(sets, oneRepMaxKg));
  const describe = describeGroup;
  const spoken = spokenGroup;

  /** "8→9" → [8, →, **9**]: only figures at RPE 9+ go heavy, never the whole token. */
  const rpeTokens = (rpe: string) =>
    rpe.split(/([→–/])/).filter(Boolean).map((text) => ({ text, hi: /^\d/.test(text) && Number(text) >= 9 }));

  const toggle = (i: number) => (openIndex = openIndex === i ? null : i);
</script>

<svelte:window
  onpointerdown={(e) => {
    if (openIndex !== null && rootEl && !rootEl.contains(e.target as Node)) openIndex = null;
  }}
/>

<span class="chips" class:aligned={!!cols} bind:this={rootEl}>
  {#if head && cols}
    <span class="setchip ghost" aria-hidden="true">
      <span class="slot s-main"><span class="sub">sets×reps</span></span>
      {#if cols.load}<span class="slot s-load"><span class="sub">load</span></span>{/if}
      <span class="slot s-eff"><span class="sub">effort</span></span>
      {#if cols.tempo}<span class="slot s-tempo"><span class="sub">tempo</span></span>{/if}
      {#if cols.rest}<span class="slot s-rest"><span class="sub">rest</span></span>{/if}
    </span>
  {:else}
    {#each groups as g, i (i)}
      {@const open = openIndex === i}
      <!-- Not a tab stop: a week holds ~70 chips. Screen readers get the
           plain words below; tap-to-words is a pointer/touch aid. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <span class="setchip" class:open title={open ? "show notation" : describe(g)} onclick={() => toggle(i)}>
        <span class="sr">{spoken(g)}</span>
        <span class="vis" aria-hidden="true">
        {#if open}
          <span class="words">{describe(g)}</span>
        {:else}
          <span class="slot s-main">{#if g.count > 1}<span class="count">{g.count}×{g.main}</span>{:else}<span class="rep">{g.main}</span>{/if}</span>
          {#if !cols || cols.load}<span class="slot s-load" class:none={!g.kg && !g.pct}>{#if g.kg}<span class="kg">{g.kg}</span>{#if g.pct}<span class="sub"> {g.pct}</span>{/if}{:else if g.pct}<span class="kg">{g.pct}</span>{/if}</span>{/if}
          <span class="slot s-eff" class:none={!g.rpe && g.rir == null && g.stop == null}>
            {#if g.stop != null}<span class="sub rpe" class:rpe-mid={g.stop >= 7}>stop @{g.stop}</span>
            {:else if g.rpe}<span class="sub rpe" class:rpe-mid={g.maxRpe >= 7}>@RPE {#each rpeTokens(g.rpe) as t, k (k)}{#if t.hi}<b class="hi">{t.text}</b>{:else}{t.text}{/if}{/each}</span>
            {:else if g.rir != null}<span class="sub">RIR {g.rir}</span>{/if}
          </span>
          {#if !cols || cols.tempo}<span class="slot s-tempo" class:none={!g.tempo}>{#if g.tempo}<span class="sub">· {g.tempo}</span>{/if}</span>{/if}
          {#if !cols || cols.rest}<span class="slot s-rest" class:none={!g.rest}>{#if g.rest}<span class="sub">· {g.rest}</span>{/if}</span>{/if}
        {/if}
        </span>
      </span>
    {/each}
  {/if}
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
  .kg {
    font-weight: 500;
  }
  /* click shows the plain-words reading — the cursor says so */
  .setchip {
    position: relative;
    cursor: pointer;
  }
  .setchip.open {
    outline: 2px solid var(--blue);
  }
  .words {
    font-weight: 400;
  }
  .vis {
    display: contents;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .slot.none {
    display: none;
  }
  .ghost {
    background: none;
  }
  /* Wide session card: fixed slots so right-aligned chips form columns.
     Widths in ch of the 12px chip mono; longer values (loads) just grow. */
  @container session (min-width: 521px) {
    /* runs (top set, back-offs) stack so every run sits in the columns */
    .aligned { flex-direction: column; align-items: flex-end; gap: 3px; }
    .aligned .slot { display: inline-block; text-align: left; }
    .aligned .s-main { min-width: 8.5ch; }
    .aligned .s-load { min-width: 10.5ch; }
    .aligned .s-eff { min-width: 7.5ch; }
    .aligned .s-tempo { min-width: 8.5ch; }
    .aligned .s-rest { min-width: 5.5ch; }
  }
  /* RPE effort tiers live in app.css (.setchip .rpe) */
</style>
