<script lang="ts">
  import type { Component } from "svelte";
  import AbWeeksFigure from "$lib/guide/AbWeeksFigure.svelte";
  import EditSpreadFigure from "$lib/guide/EditSpreadFigure.svelte";
  import Figure from "$lib/guide/Figure.svelte";
  import GuideDoc from "$lib/guide/GuideDoc.svelte";
  import MissedFigure from "$lib/guide/MissedFigure.svelte";
  import { PROGRAMS_GUIDE, type GuideFig } from "$lib/guide/programsWeeks";
  import { rich } from "$lib/guide/rich";
  import ShiftStartFigure from "$lib/guide/ShiftStartFigure.svelte";
  import WeekCalendarFigure from "$lib/guide/WeekCalendarFigure.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";

  /** The drawn diagram for each `fig` block. */
  const FIGS: Record<GuideFig, Component> = {
    weeks: WeekCalendarFigure,
    edit: EditSpreadFigure,
    missed: MissedFigure,
    ab: AbWeeksFigure,
    shift: ShiftStartFigure,
  };

  const g = $derived(PROGRAMS_GUIDE[i18n.locale]);
  const toc = $derived(g.sections.map((s) => [s.id, s.h] as const));
</script>

<svelte:head><title>{g.title} guide · Program Tracker</title></svelte:head>

<PageHead title={g.title} sub={g.sub} crumbs={[{ href: "/guide", label: g.crumbs[0] }, { label: g.crumbs[1] }]}>
  {#snippet actions()}<LangToggle compact />{/snippet}
</PageHead>

<GuideDoc {toc} onThisPage={g.onThisPage} lang={i18n.locale}>
  <p class="intro">{@html rich(g.intro)}</p>

  {#each g.sections as section (section.id)}
    <section id={section.id}>
      <h2>{section.h}</h2>
      {#each section.blocks as block, bi (bi)}
        {#if "fig" in block}
          {@const Fig = FIGS[block.fig]}
          <Figure caption={block.caption}><Fig /></Figure>
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
    </section>
  {/each}
</GuideDoc>
