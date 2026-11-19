<script lang="ts">
  import type { Component } from "svelte";
  import Figure from "./Figure.svelte";
  import type { Block, GuideFig } from "./programsWeeks";
  import { rich } from "./rich";

  /**
   * A guide section's blocks in order — paragraphs, asides, steps, lists,
   * definitions, lookup tables and drawn figures. Styled by GuideDoc.
   */
  interface Props {
    blocks: Block[];
    /** The drawn diagram for each `fig` block; guides without figures omit it. */
    figs?: Partial<Record<GuideFig, Component>>;
  }

  let { blocks, figs = {} }: Props = $props();
</script>

{#each blocks as block, bi (bi)}
  {#if "fig" in block}
    {@const Fig = figs[block.fig]}
    {#if Fig}<Figure caption={block.caption}><Fig /></Figure>{/if}
  {:else if "p" in block}
    <p>{@html rich(block.p)}</p>
  {:else if "aside" in block}
    <p class="aside">{@html rich(block.aside)}</p>
  {:else if "steps" in block}
    <ol class="steps">
      {#each block.steps as step, i (i)}
        <li><h3>{@html rich(step.h)}</h3><p>{@html rich(step.p)}</p></li>
      {/each}
    </ol>
  {:else if "list" in block}
    <ul class="rules">{#each block.list as li, i (i)}<li>{@html rich(li)}</li>{/each}</ul>
  {:else if "defs" in block}
    <dl class="defs">
      {#each block.defs as item (item.dt)}
        <div><dt>{@html rich(item.dt)}</dt><dd>{@html rich(item.dd)}</dd></div>
      {/each}
    </dl>
  {:else if "table" in block}
    <table class="lookup">
      <thead><tr><th scope="col">{block.table.head[0]}</th><th scope="col">{block.table.head[1]}</th></tr></thead>
      <tbody>
        {#each block.table.rows as [said, fix], i (i)}
          <tr><th scope="row">{said}</th><td>{@html rich(fix)}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/each}
